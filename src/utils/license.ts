// === Chord Palette Pro ライセンス クライアント側ユーティリティ ===
//
// - localStorage `cp_pro_license` に持続化
// - localStorage `cp_pro_last_verified` に最終検証時刻（ISO8601）を持続化
// - `/api/verify-license` 呼び出しと 24h キャッシュ
// - URL クエリ `?license=...` の取り込み

const LICENSE_KEY = "cp_pro_license";
const LAST_VERIFIED_KEY = "cp_pro_last_verified";

/** 24 時間（ms） */
const VERIFY_CACHE_MS = 24 * 60 * 60 * 1000;

/** `XXXX-XXXX-XXXX` 形式の判定（クライアント用、緩めに大文字化を許容） */
export const LICENSE_FORMAT_REGEX_CLIENT = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export function isLicenseFormatValid(license: string): boolean {
  return LICENSE_FORMAT_REGEX_CLIENT.test(license);
}

/** 入力欄からの自動整形: 大文字化 + base32 集合外文字を除去 + 4 文字ごとハイフン挿入 */
export function formatLicenseInput(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 12);
  const parts: string[] = [];
  for (let i = 0; i < cleaned.length; i += 4) {
    parts.push(cleaned.slice(i, i + 4));
  }
  return parts.join("-");
}

export function getLocalLicense(): string | null {
  try {
    return localStorage.getItem(LICENSE_KEY);
  } catch {
    return null;
  }
}

export function saveLocalLicense(license: string): void {
  try {
    localStorage.setItem(LICENSE_KEY, license);
    localStorage.setItem(LAST_VERIFIED_KEY, new Date().toISOString());
  } catch {
    /* quota / privacy mode */
  }
}

export function clearLocalLicense(): void {
  try {
    localStorage.removeItem(LICENSE_KEY);
    localStorage.removeItem(LAST_VERIFIED_KEY);
  } catch {
    /* ignore */
  }
}

/** 24 時間以内に成功検証履歴があるか（オフライン用） */
export function isVerificationCacheFresh(): boolean {
  try {
    const raw = localStorage.getItem(LAST_VERIFIED_KEY);
    if (!raw) return false;
    const t = Date.parse(raw);
    if (Number.isNaN(t)) return false;
    return Date.now() - t < VERIFY_CACHE_MS;
  } catch {
    return false;
  }
}

export interface VerifyResult {
  valid: boolean;
  reason?: "format" | "not_found" | "network";
  features?: string[];
}

/** サーバーに POST /api/verify-license を投げる */
export async function verifyLicenseRemote(license: string): Promise<VerifyResult> {
  if (!isLicenseFormatValid(license)) {
    return { valid: false, reason: "format" };
  }
  try {
    const res = await fetch("/api/verify-license", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license }),
    });
    if (!res.ok) {
      return { valid: false, reason: "network" };
    }
    const data = (await res.json()) as {
      valid?: boolean;
      reason?: "format" | "not_found";
      features?: string[];
    };
    if (data.valid) {
      // キャッシュ更新
      try {
        localStorage.setItem(LAST_VERIFIED_KEY, new Date().toISOString());
      } catch {
        /* ignore */
      }
      return { valid: true, features: data.features ?? ["midi-export"] };
    }
    return { valid: false, reason: data.reason ?? "not_found" };
  } catch {
    return { valid: false, reason: "network" };
  }
}

/**
 * URL クエリ `?license=...` を取り込み、history から除去する。
 * 取り込めた場合は license 文字列を返す。
 */
export function consumeLicenseFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("license");
    if (!raw) return null;
    const normalized = formatLicenseInput(raw);
    if (!isLicenseFormatValid(normalized)) {
      // 形式が違っても URL からは除去（SNS シェア漏洩防止）
      url.searchParams.delete("license");
      window.history.replaceState({}, "", url.toString());
      return null;
    }
    url.searchParams.delete("license");
    window.history.replaceState({}, "", url.toString());
    return normalized;
  } catch {
    return null;
  }
}

/** ライセンスキー末尾 4 文字を `••••-••••-XXXX` 表示用に整形 */
export function maskLicenseKey(license: string): string {
  if (!isLicenseFormatValid(license)) return license;
  return `••••-••••-${license.slice(-4)}`;
}
