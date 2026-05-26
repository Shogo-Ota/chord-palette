// === Pro ライセンス管理 Hook ===
//
// - 起動時に localStorage を読み、24h キャッシュがあれば即 isPro=true
// - URL クエリ `?license=...` を取り込み、verify 成功で保存
// - 手動 verify (`verify(license)`) を提供
// - `clear()` で localStorage を消去 + isPro=false

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearLocalLicense,
  consumeLicenseFromUrl,
  getLocalLicense,
  isLicenseFormatValid,
  isVerificationCacheFresh,
  saveLocalLicense,
  verifyLicenseRemote,
  type VerifyResult,
} from "../utils/license";

export interface UseProLicenseResult {
  /** 現在 Pro 機能が使えるか */
  isPro: boolean;
  /** 保存されているライセンスキー（あれば） */
  license: string | null;
  /** 手動でライセンスキーを検証 + 保存する */
  verify: (license: string) => Promise<VerifyResult>;
  /** ライセンスをローカルから削除して非 Pro に戻す */
  clear: () => void;
  /** verify 実行中 */
  isVerifying: boolean;
  /** verify 結果の最新エラー（UI 表示用） */
  error: string | null;
  /**
   * URL クエリ `?license=` から自動取り込みが完了したかどうか。
   * 親コンポーネントが「成功トースト」を出す制御に使う。
   * トリガが立ったら 1 度だけ true になり、消費後は null に戻す責任は呼び出し側。
   */
  urlAutoVerified: boolean;
  /** urlAutoVerified を消費した後に false に戻す */
  consumeUrlAutoVerified: () => void;
}

export function useProLicense(): UseProLicenseResult {
  // localStorage の license があり、かつキャッシュが fresh なら起動時から isPro=true
  const initialLicense = typeof window !== "undefined" ? getLocalLicense() : null;
  const initialIsPro = initialLicense !== null && isVerificationCacheFresh();

  const [license, setLicense] = useState<string | null>(initialLicense);
  const [isPro, setIsPro] = useState<boolean>(initialIsPro);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [urlAutoVerified, setUrlAutoVerified] = useState<boolean>(false);

  // 起動時の自動 verify：StrictMode の二重実行を抑えるため Ref ガード
  const bootstrappedRef = useRef(false);

  const verify = useCallback(async (input: string): Promise<VerifyResult> => {
    setError(null);
    if (!isLicenseFormatValid(input)) {
      setError("ライセンスキーの形式が違います");
      return { valid: false, reason: "format" };
    }
    setIsVerifying(true);
    try {
      const result = await verifyLicenseRemote(input);
      if (result.valid) {
        saveLocalLicense(input);
        setLicense(input);
        setIsPro(true);
        setError(null);
        return result;
      }
      const msg =
        result.reason === "format"
          ? "ライセンスキーの形式が違います"
          : result.reason === "network"
            ? "通信エラーが発生しました"
            : "ライセンスキーが無効です";
      setError(msg);
      return result;
    } finally {
      setIsVerifying(false);
    }
  }, []);

  const clear = useCallback(() => {
    clearLocalLicense();
    setLicense(null);
    setIsPro(false);
    setError(null);
  }, []);

  const consumeUrlAutoVerified = useCallback(() => {
    setUrlAutoVerified(false);
  }, []);

  // 起動時: URL クエリ取り込み → verify、または既存 license のバックグラウンド再 verify
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const urlLicense = consumeLicenseFromUrl();

    if (urlLicense) {
      void (async () => {
        const result = await verify(urlLicense);
        if (result.valid) {
          setUrlAutoVerified(true);
        }
      })();
      return;
    }

    // localStorage に license があり、キャッシュが期限切れならバックグラウンドで再検証
    const stored = getLocalLicense();
    if (stored && !isVerificationCacheFresh()) {
      void (async () => {
        const result = await verifyLicenseRemote(stored);
        if (result.valid) {
          setIsPro(true);
        } else if (result.reason === "not_found") {
          // 明示的に無効化された場合のみクリア。network エラーは保持。
          clearLocalLicense();
          setLicense(null);
          setIsPro(false);
        }
      })();
    }
  }, [verify]);

  return {
    isPro,
    license,
    verify,
    clear,
    isVerifying,
    error,
    urlAutoVerified,
    consumeUrlAutoVerified,
  };
}
