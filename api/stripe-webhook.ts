// === Stripe Webhook ハンドラ ===
//
// POST /api/stripe-webhook
//
// Stripe `checkout.session.completed` を受信し:
//   1. 署名検証 (STRIPE_WEBHOOK_SECRET)
//   2. Customer / Payment Intent から HMAC ライセンスキーを生成
//   3. Stripe Customer Metadata に `cp_license_key` / `cp_payment_intent_id` を保存
//
// 他のイベントは 200 で no-op を返す。
// Stripe Receipt メールにライセンスキーを載せる仕組みは Stripe ダッシュボード側で
// メタデータを Receipt にマージできないため、別途 success_url 経路で配信する。
//
// 重要: raw body が必要。Vercel の bodyParser を切るため、本ファイルは
// `req.body` を直接読まず、Node.js ストリームから自前で raw を取得する。
// `vercel.json` で `bodyParser: false` を指定する必要がある。

import type Stripe from "stripe";

import { issueLicenseForCheckoutSession } from "./_lib/issueLicenseForCheckout.js";
import { createStripeClient, getEnv } from "./_lib/stripeEnv.js";

// Node.js 互換のリクエスト/レスポンス型（@vercel/node を直接依存に入れず最小化）
interface NodeLikeRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: "data", cb: (chunk: Buffer) => void): unknown;
  on(event: "end", cb: () => void): unknown;
  on(event: "error", cb: (err: Error) => void): unknown;
}

interface NodeLikeResponse {
  status: (code: number) => NodeLikeResponse;
  json: (body: unknown) => unknown;
  setHeader: (key: string, value: string) => void;
  end: (body?: string) => unknown;
}

// Vercel Functions では default export がデフォルトで body parsing する。
// `export const config = { api: { bodyParser: false } }` 形式は Next.js 用なので
// Vercel Node Functions では vercel.json 側で `runtime` と raw body 設定を行う。
// 本ファイルでは raw body を手動取得する。
export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req: NodeLikeRequest): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", (err) => reject(err));
  });
}

export default async function handler(req: NodeLikeRequest, res: NodeLikeResponse) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      endpoint: "/api/stripe-webhook",
      note: "Stripe からは POST のみ送られます。ブラウザで開いて JSON が見えればデプロイ成功です。",
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let webhookSecret: string;
  let licenseSecret: string;
  try {
    getEnv("STRIPE_SECRET_KEY");
    webhookSecret = getEnv("STRIPE_WEBHOOK_SECRET");
    licenseSecret = getEnv("LICENSE_SECRET");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "env error";
    return res.status(500).json({ error: msg });
  }

  const stripe = createStripeClient();

  const signature = req.headers["stripe-signature"];
  const sigStr = Array.isArray(signature) ? signature[0] : signature;
  if (!sigStr) {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  let rawBody: Buffer;
  try {
    rawBody = await readRawBody(req);
  } catch {
    return res.status(400).json({ error: "Failed to read request body" });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sigStr, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    return res.status(400).json({ error: `Webhook signature verification failed: ${msg}` });
  }

  // 処理対象は checkout.session.completed のみ。他は 200 no-op。
  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const expectedProductId = process.env.STRIPE_PRODUCT_ID_PRO;

  const issued = await issueLicenseForCheckoutSession(
    stripe,
    session.id,
    licenseSecret,
    expectedProductId || undefined
  );

  if (issued.ok === false) {
    return res.status(200).json({
      received: true,
      skipped: issued.code,
      message: issued.message,
    });
  }

  return res.status(200).json({
    received: true,
    license: issued.license,
    source: issued.source,
  });
}
