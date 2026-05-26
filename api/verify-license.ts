// === ライセンス検証エンドポイント ===
//
// POST /api/verify-license
//
// リクエスト: { license: "XXXX-XXXX-XXXX" }
// レスポンス成功: { valid: true, features: ["midi-export"], verifiedAt: <ISO> }
// レスポンス失敗: { valid: false, reason: "format" | "not_found" }
//
// CORS は本番ドメイン + 開発用 localhost:5173 のみ許可。
// レート制限: in-memory Map で同一 IP 1 分あたり 30 リクエスト。
//
// Stripe Customer Metadata `cp_license_key` で逆引きし、HMAC で二重検証する。

import {
  LICENSE_FORMAT_REGEX,
  findCustomerByLicense,
  isLicenseKeyValidFor,
  normalizeLicenseKey,
} from "./_lib/license.js";
import { createStripeClient, getEnv } from "./_lib/stripeEnv.js";

interface VercelLikeRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: { license?: string } | string | null;
  socket?: { remoteAddress?: string };
}

interface VercelLikeResponse {
  status: (code: number) => VercelLikeResponse;
  json: (body: unknown) => unknown;
  setHeader: (key: string, value: string) => void;
  end: (body?: string) => unknown;
}

const ALLOWED_ORIGINS = new Set<string>([
  "https://chord-palette.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function pickOrigin(req: VercelLikeRequest): string | null {
  const raw = req.headers["origin"];
  const origin = Array.isArray(raw) ? raw[0] : raw;
  if (!origin) return null;
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function applyCors(req: VercelLikeRequest, res: VercelLikeResponse): boolean {
  const allowed = pickOrigin(req);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", allowed);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
    return true;
  }
  return false;
}

// === レート制限（in-memory、コールドスタートでリセット）===
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const ipBuckets = new Map<string, number[]>();

function getClientIp(req: VercelLikeRequest): string {
  const xff = req.headers["x-forwarded-for"];
  const xffStr = Array.isArray(xff) ? xff[0] : xff;
  if (xffStr) {
    const first = xffStr.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress ?? "unknown";
}

function rateLimitExceeded(ip: string): boolean {
  const now = Date.now();
  const bucket = ipBuckets.get(ip) ?? [];
  // 古いタイムスタンプを削除
  const fresh = bucket.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT_MAX) {
    ipBuckets.set(ip, fresh);
    return true;
  }
  fresh.push(now);
  ipBuckets.set(ip, fresh);
  return false;
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    const ok = applyCors(req, res);
    if (!ok) {
      return res.status(403).end();
    }
    return res.status(204).end();
  }

  // CORS 適用（許可外オリジンの場合 Origin ヘッダなしでもブラウザは弾く）
  const corsOk = applyCors(req, res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Origin がある場合は許可リストになければ拒否（CSRF / 直接アクセス防御）
  const originHeader = req.headers["origin"];
  if (originHeader && !corsOk) {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  // レート制限
  const ip = getClientIp(req);
  if (rateLimitExceeded(ip)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many requests" });
  }

  let licenseSecret: string;
  try {
    getEnv("STRIPE_SECRET_KEY");
    licenseSecret = getEnv("LICENSE_SECRET");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "env error";
    return res.status(500).json({ error: msg });
  }

  // body 取得（Vercel Node Function は JSON body を自動でパースしてくれるが、
  // raw 文字列のケースもあるので両対応）
  let parsedBody: { license?: unknown } = {};
  if (typeof req.body === "string") {
    try {
      parsedBody = JSON.parse(req.body);
    } catch {
      return res.status(400).json({ valid: false, reason: "format" });
    }
  } else if (req.body && typeof req.body === "object") {
    parsedBody = req.body as { license?: unknown };
  }

  const rawLicense = typeof parsedBody.license === "string" ? parsedBody.license : "";
  const license = normalizeLicenseKey(rawLicense);

  if (!LICENSE_FORMAT_REGEX.test(license)) {
    return res.status(200).json({ valid: false, reason: "format" });
  }

  let stripe;
  try {
    stripe = createStripeClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "stripe init failed";
    return res.status(500).json({ error: msg });
  }

  try {
    const found = await findCustomerByLicense(stripe, license);
    if (!found) {
      return res.status(200).json({ valid: false, reason: "not_found" });
    }

    const valid = isLicenseKeyValidFor(
      license,
      found.customer.id,
      found.paymentIntentId,
      licenseSecret
    );

    if (!valid) {
      return res.status(200).json({ valid: false, reason: "not_found" });
    }

    // 副次処理: 最終検証時刻を保存（失敗しても致命的でないので catch）
    try {
      await stripe.customers.update(found.customer.id, {
        metadata: {
          cp_last_verified_at: new Date().toISOString(),
        },
      });
    } catch {
      /* ignore */
    }

    return res.status(200).json({
      valid: true,
      features: ["midi-export"],
      verifiedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "verification failed";
    return res.status(500).json({ valid: false, error: msg });
  }
}
