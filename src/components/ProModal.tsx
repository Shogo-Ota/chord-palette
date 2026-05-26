// === ProModal: Pro 機能の購入 + ライセンスキー入力 ===
//
// Sprint 16:
// - Stripe Payment Link への遷移ボタン
// - ライセンスキー入力フォーム（自動整形 + 認証）
// - 既購入ユーザー向け: マスク表示 + 解除ボタン

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";

import {
  formatLicenseInput,
  isLicenseFormatValid,
  maskLicenseKey,
} from "../utils/license";
import type { VerifyResult } from "../utils/license";

interface ProModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPro: boolean;
  license: string | null;
  isVerifying: boolean;
  error: string | null;
  onVerify: (license: string) => Promise<VerifyResult>;
  onClear: () => void;
}

const PRICE_LABEL = import.meta.env.VITE_PRO_PRICE_LABEL ?? "¥980";
const PAYMENT_URL =
  import.meta.env.VITE_STRIPE_PAYMENT_URL ?? import.meta.env.VITE_PRO_PAYMENT_URL ?? "";

export default function ProModal({
  isOpen,
  onClose,
  isPro,
  license,
  isVerifying,
  error,
  onVerify,
  onClear,
}: ProModalProps) {
  const [input, setInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // 親 hook の error を render 中に取り込む（effect ではなく derived 表現）
  // ローカル入力中のエラーが優先され、親 error は localError 未設定時のフォールバック
  const displayError = localError ?? error;

  // モーダルを閉じたら入力欄をリセットしてから親に通知（effect 不要）
  const handleClose = useCallback(() => {
    setInput("");
    setLocalError(null);
    onClose();
  }, [onClose]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatLicenseInput(e.target.value);
    setInput(formatted);
    setLocalError(null);
  }, []);

  const handleAuthenticate = useCallback(async () => {
    if (!isLicenseFormatValid(input)) {
      setLocalError("ライセンスキーの形式が違います");
      return;
    }
    const result = await onVerify(input);
    if (result.valid) {
      // 親の effect で isPro が true になり、モーダル側で何もしなくて OK
      handleClose();
    }
  }, [input, onVerify, handleClose]);

  const handlePurchase = useCallback(() => {
    if (!PAYMENT_URL) {
      setLocalError("購入リンクが設定されていません");
      return;
    }
    window.location.href = PAYMENT_URL;
  }, []);

  const handleClear = useCallback(() => {
    const ok = window.confirm("ライセンスを解除しますか？\nMIDI 書き出しが使えなくなります。");
    if (!ok) return;
    onClear();
  }, [onClear]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="pro-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={handleClose}
          role="presentation"
        >
          <motion.div
            className="pro-modal"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pro-modal-title"
          >
            <button
              type="button"
              className="pro-modal-close"
              onClick={handleClose}
              aria-label="閉じる"
            >
              ✕
            </button>

            <header className="pro-modal-header">
              <span className="pro-modal-icon" aria-hidden="true">🎹</span>
              <h2 id="pro-modal-title" className="pro-modal-title">
                MIDI エクスポートで<br />DAW に書き出し
              </h2>
            </header>

            <p className="pro-modal-description">
              コード進行 + ドラムを MIDI ファイル化。
              Logic / GarageBand / Ableton 等にドラッグ&ドロップ。
            </p>

            {isPro ? (
              <section className="pro-modal-section pro-modal-section--active" aria-label="Pro 状態">
                <div className="pro-badge">
                  <span className="pro-badge-icon" aria-hidden="true">✓</span>
                  <span className="pro-badge-label">Pro 有効</span>
                </div>
                <div className="pro-license-display">
                  <span className="pro-license-display-label">ライセンスキー</span>
                  <span className="pro-license-display-key">
                    {license ? maskLicenseKey(license) : "—"}
                  </span>
                </div>
                <button
                  type="button"
                  className="pro-modal-clear"
                  onClick={handleClear}
                >
                  ライセンスを解除
                </button>
              </section>
            ) : (
              <>
                <section className="pro-modal-section" aria-label="購入">
                  <div className="pro-price">
                    <span className="pro-price-amount">{PRICE_LABEL}</span>
                    <span className="pro-price-note">買い切り・永続</span>
                  </div>
                  <button
                    type="button"
                    className="pro-modal-purchase"
                    onClick={handlePurchase}
                    disabled={!PAYMENT_URL}
                  >
                    Stripe で購入
                  </button>
                </section>

                <div className="pro-modal-divider">
                  <span>または</span>
                </div>

                <section className="pro-modal-section" aria-label="ライセンス入力">
                  <label
                    className="pro-modal-section-label"
                    htmlFor="pro-license-input"
                  >
                    ライセンスキーをお持ちですか？
                  </label>
                  <input
                    id="pro-license-input"
                    type="text"
                    className={`pro-license-input ${displayError ? "has-error" : ""}`}
                    value={input}
                    onChange={handleInputChange}
                    placeholder="XXXX-XXXX-XXXX"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="text"
                    maxLength={14}
                    disabled={isVerifying}
                    aria-invalid={displayError ? "true" : "false"}
                    aria-describedby={displayError ? "pro-license-error" : undefined}
                  />
                  {displayError && (
                    <p id="pro-license-error" className="pro-license-error">
                      {displayError}
                    </p>
                  )}
                  <button
                    type="button"
                    className="pro-modal-verify"
                    onClick={handleAuthenticate}
                    disabled={isVerifying || !isLicenseFormatValid(input)}
                  >
                    {isVerifying ? "認証中..." : "認証する"}
                  </button>
                </section>
              </>
            )}

            <footer className="pro-modal-footer">
              <button
                type="button"
                className="pro-modal-dismiss"
                onClick={handleClose}
              >
                閉じる
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
