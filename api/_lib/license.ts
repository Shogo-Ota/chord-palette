// === Chord Palette Pro ライセンス HMAC ユーティリティ ===
//
// Sprint 16 設計に基づき、Stripe Customer + Payment Intent の組から
// 決定的にライセンスキーを生成する。サーバー専用モジュール。
//
// アルゴリズム:
//   raw = HMAC_SHA256(LICENSE_SECRET, "v1:" + customerId + ":" + paymentIntentId)
//   先頭 60bit を base32 (RFC 4648 大文字、0/O/1/I 除外) で 12 文字にエンコード
//   "XXXX-XXXX-XXXX" 形式に整形
//
// 検証:
//   client から受信した license と (customerId, paymentIntentId) で再計算し、
//   一致すれば有効。Stripe Customer 検索は呼び出し側で行う。

import crypto from "node:crypto";

import Stripe from "stripe";

/** ライセンスキー形式: 4 文字 base32 × 3 ブロック、ハイフン区切り */
export const LICENSE_FORMAT_REGEX = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

/**
 * Crockford 風 base32 アルファベット（RFC 4648 大文字から `0`, `O`, `1`, `I` を除外）。
 * 32 文字を維持するため `0/1` の代わりに小文字を使わず、`O/I` を抜いて 30 文字 + 数字 `2-9` で
 * 合計 32 文字 = 5 ビット/文字を確保する。
 *
 * 構成: `A-Z` から `I, O` を除く 24 文字 + `2-9` の 8 文字 = 32 文字
 */
const BASE32_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

if (BASE32_ALPHABET.length !== 32) {
  // 起動時アサーション。CI でも検出可能。
  throw new Error(
    `BASE32_ALPHABET length must be 32 (got ${BASE32_ALPHABET.length})`
  );
}

/**
 * バッファの先頭 60bit を base32 12 文字に変換する。
 * 60bit = 12 文字 × 5bit。
 */
function encodeBase32_60bit(buf: Buffer): string {
  let chars = "";
  let bitBuffer = 0;
  let bitsInBuffer = 0;
  let byteIdx = 0;

  while (chars.length < 12) {
    if (bitsInBuffer < 5) {
      if (byteIdx >= buf.length) {
        // 防御: HMAC-SHA256 は 32 バイト出力なので 60bit 取り出しに不足することはない
        throw new Error("encodeBase32_60bit: insufficient input bytes");
      }
      bitBuffer = (bitBuffer << 8) | buf[byteIdx];
      bitsInBuffer += 8;
      byteIdx++;
    }
    const shift = bitsInBuffer - 5;
    const idx = (bitBuffer >> shift) & 0x1f;
    chars += BASE32_ALPHABET[idx];
    bitBuffer = bitBuffer & ((1 << shift) - 1);
    bitsInBuffer = shift;
  }

  return chars;
}

/**
 * ライセンスキーを生成する。
 *
 * @param customerId      Stripe Customer ID（`cus_...`）
 * @param paymentIntentId Stripe PaymentIntent ID（`pi_...`）
 * @param secret          LICENSE_SECRET（32+ 文字推奨）
 * @returns `XXXX-XXXX-XXXX` 形式のライセンスキー
 */
export function generateLicenseKey(
  customerId: string,
  paymentIntentId: string,
  secret: string
): string {
  if (!customerId || !paymentIntentId) {
    throw new Error("generateLicenseKey: customerId and paymentIntentId are required");
  }
  if (!secret || secret.length < 16) {
    throw new Error("generateLicenseKey: LICENSE_SECRET is too short (>=16 chars required)");
  }

  const payload = `v1:${customerId}:${paymentIntentId}`;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest();

  const twelve = encodeBase32_60bit(hmac);
  return `${twelve.slice(0, 4)}-${twelve.slice(4, 8)}-${twelve.slice(8, 12)}`;
}

/**
 * ライセンスキーが (customerId, paymentIntentId) と整合するかを検証する。
 *
 * 文字列比較ではなく `crypto.timingSafeEqual` を使い、タイミング攻撃を防ぐ。
 */
export function isLicenseKeyValidFor(
  license: string,
  customerId: string,
  paymentIntentId: string,
  secret: string
): boolean {
  if (!LICENSE_FORMAT_REGEX.test(license)) return false;
  try {
    const expected = generateLicenseKey(customerId, paymentIntentId, secret);
    if (expected.length !== license.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(license, "utf8")
    );
  } catch {
    return false;
  }
}

/** 入力の正規化: 小文字 → 大文字、空白除去、4 文字ごとのハイフン挿入。 */
export function normalizeLicenseKey(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-9]/g, "");
  if (cleaned.length !== 12) return input.toUpperCase();
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8, 12)}`;
}

/**
 * Stripe Customer Metadata `cp_license_key` から license を検索する。
 *
 * Stripe `customers.search` API（query 言語）で metadata を直接検索可能。
 * 検索成功 → そのまま HMAC 再計算で二重検証。
 */
export async function findCustomerByLicense(
  stripe: Stripe,
  license: string
): Promise<{ customer: Stripe.Customer; paymentIntentId: string } | null> {
  // Stripe Customer Search クエリ言語
  const query = `metadata['cp_license_key']:'${license}'`;
  const res = await stripe.customers.search({ query, limit: 1 });
  if (res.data.length === 0) return null;

  const customer = res.data[0];
  const piId = customer.metadata?.cp_payment_intent_id;
  if (!piId) return null;

  return { customer, paymentIntentId: piId };
}
