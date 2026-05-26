// GET /api/checkout-license?session_id=cs_...
//
// 購入完了後の /pro/success ページから呼び出し、
// ライセンスキーを返す。Webhook より先に到達した場合はここで発行する。

import { issueLicenseForCheckoutSession } from "./_lib/issueLicenseForCheckout.js";
import { createStripeClient, getEnv } from "./_lib/stripeEnv.js";

interface VercelLikeRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
  socket?: { remoteAddress?: string };
}

interface VercelLikeResponse {
  status: (code: number) => VercelLikeResponse;
  json: (body: unknown) => unknown;
  setHeader: (key: string, value: string) => void;
  end: (body?: string) => unknown;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 40;
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
  const bucket = (ipBuckets.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_MAX) {
    ipBuckets.set(ip, bucket);
    return true;
  }
  bucket.push(now);
  ipBuckets.set(ip, bucket);
  return false;
}

function getSessionId(req: VercelLikeRequest): string | null {
  const q = req.query?.session_id;
  if (typeof q === "string" && q.trim()) return q.trim();
  if (Array.isArray(q) && typeof q[0] === "string") return q[0].trim();
  if (req.url) {
    try {
      const host = req.headers.host;
      const proto = req.headers["x-forwarded-proto"];
      const scheme = Array.isArray(proto) ? proto[0] : proto ?? "https";
      const base = host ? `${scheme}://${host}` : "http://localhost";
      const id = new URL(req.url, base).searchParams.get("session_id");
      if (id?.trim()) return id.trim();
    } catch {
      /* ignore */
    }
  }
  return null;
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  if (rateLimitExceeded(ip)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const sessionId = getSessionId(req);
  if (!sessionId) {
    return res.status(400).json({ error: "session_id is required" });
  }

  let licenseSecret: string;
  try {
    licenseSecret = getEnv("LICENSE_SECRET");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "env error";
    return res.status(500).json({ error: msg });
  }

  const expectedProductId = process.env.STRIPE_PRODUCT_ID_PRO;
  let stripe;
  try {
    stripe = createStripeClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "stripe init failed";
    return res.status(500).json({ error: msg });
  }

  const result = await issueLicenseForCheckoutSession(
    stripe,
    sessionId,
    licenseSecret,
    expectedProductId || undefined
  );

  if (result.ok === false) {
    if (result.code === "pending") {
      return res.status(202).json({ status: "pending", message: result.message });
    }
    if (result.code === "not_paid") {
      return res.status(402).json({ status: "not_paid", message: result.message });
    }
    const status =
      result.code === "invalid_session" ? 404 : result.code === "product_mismatch" ? 403 : 400;
    return res.status(status).json({ status: result.code, message: result.message });
  }

  return res.status(200).json({
    license: result.license,
    source: result.source,
  });
}
