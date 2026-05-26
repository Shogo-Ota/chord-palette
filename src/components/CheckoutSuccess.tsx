import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MAX_ATTEMPTS = 24;
const POLL_MS = 1250;

type Phase = "loading" | "ready" | "error";

const NO_SESSION_MESSAGE =
  "決済セッション ID がありません。アプリから再度お試しください。";

export default function CheckoutSuccess() {
  // session_id を URL から同期的に取り出して useState 初期化に使う。
  // これにより「session_id が無い」ケースで effect 内 setState を呼ばずに
  // 初期 phase を "error" にできる（react-hooks/set-state-in-effect 回避）。
  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("session_id")?.trim() ?? null;
  }, []);

  const [phase, setPhase] = useState<Phase>(sessionId ? "loading" : "error");
  const [message, setMessage] = useState(
    sessionId ? "購入を確認しています…" : NO_SESSION_MESSAGE
  );
  const [attempt, setAttempt] = useState(0);
  const [license, setLicense] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const startedRef = useRef(false);

  // ライセンスキー取得後、ユーザーが画面で「キーをコピー」できる時間を確保する。
  // 旧実装の即時 `window.location.replace` は、Stripe Receipt メールに
  // ライセンスキーが含まれない設計のため、画面表示でしか顧客が控える手段が無い。
  const fetchLicense = useCallback(
    async (sid: string): Promise<"ok" | "pending" | "fail"> => {
      const res = await fetch(
        `/api/checkout-license?session_id=${encodeURIComponent(sid)}`
      );
      if (res.status === 202) return "pending";
      if (!res.ok) return "fail";
      const data = (await res.json()) as { license?: string };
      if (!data.license) return "fail";
      setLicense(data.license);
      setPhase("ready");
      return "ok";
    },
    []
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // sessionId が null のときは useState 初期値で既に "error" 状態になっている
    if (!sessionId) return;

    let cancelled = false;
    let tries = 0;

    const run = async () => {
      while (!cancelled && tries < MAX_ATTEMPTS) {
        tries += 1;
        setAttempt(tries);
        setMessage(
          tries <= 1
            ? "購入を確認しています…"
            : `ライセンスを準備しています…（${tries}/${MAX_ATTEMPTS}）`
        );

        try {
          const result = await fetchLicense(sessionId);
          if (result === "ok") return;
          if (result === "fail") {
            setPhase("error");
            setMessage(
              "ライセンスの取得に失敗しました。しばらくしてからアプリでキーを入力するか、サポートにお問い合わせください。"
            );
            return;
          }
        } catch {
          /* ネットワーク — リトライ */
        }

        await new Promise((r) => setTimeout(r, POLL_MS));
      }

      if (!cancelled) {
        setPhase("error");
        setMessage(
          "準備に時間がかかっています。アプリを開き、Pro 画面でライセンスキーを入力してください（メールが届いている場合はそちらをご利用ください）。"
        );
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [fetchLicense, sessionId]);

  const handleCopy = useCallback(async () => {
    if (!license) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(license);
      } else {
        // 非 secure context / 古いブラウザのフォールバック
        const ta = document.createElement("textarea");
        ta.value = license;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // 失敗時は select() で代用、ユーザーが手動コピーできる状態に
      const el = document.getElementById("checkout-success-license-text");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [license]);

  const activateUrl = useMemo(() => {
    if (!license) return "/";
    const url = new URL("/", window.location.origin);
    url.searchParams.set("license", license);
    return url.toString();
  }, [license]);

  return (
    <div className="checkout-success-page">
      <div className="checkout-success-card">
        <p className="checkout-success-logo" aria-hidden="true">
          🎨
        </p>
        <h1 className="checkout-success-title">Chord Palette Pro</h1>

        {phase === "loading" && (
          <>
            <p className="checkout-success-message">{message}</p>
            <div className="checkout-success-spinner" aria-hidden="true" />
            {attempt > 3 && (
              <p className="checkout-success-hint">
                このままお待ちください。完了するとライセンスキーが表示されます。
              </p>
            )}
          </>
        )}

        {phase === "ready" && license && (
          <>
            <p className="checkout-success-message">
              ご購入ありがとうございます。
              <br />
              下のライセンスキーをコピーして大切に保管してください。
            </p>

            <div className="checkout-success-license-box" role="group" aria-label="ライセンスキー">
              <span className="checkout-success-license-label">ライセンスキー</span>
              <code
                id="checkout-success-license-text"
                className="checkout-success-license-text"
              >
                {license}
              </code>
              <button
                type="button"
                className="checkout-success-copy-btn"
                onClick={handleCopy}
                aria-live="polite"
              >
                {copied ? "✓ コピーしました" : "📋 コピー"}
              </button>
            </div>

            <p className="checkout-success-hint checkout-success-hint--warn">
              ⚠️ このキーはこの画面でしか表示されません。必ずコピー or スクリーンショットで保管してください。
              <br />
              紛失時は再購入になります（メールでの再送機能は現時点で提供していません）。
            </p>

            <a
              href={activateUrl}
              className="checkout-success-btn checkout-success-btn--primary"
            >
              アプリで Pro を有効化する →
            </a>
          </>
        )}

        {phase === "error" && (
          <>
            <p className="checkout-success-message checkout-success-message--error">{message}</p>
            <a href="/?open_pro=1" className="checkout-success-btn">
              アプリでライセンスを入力
            </a>
          </>
        )}
      </div>
    </div>
  );
}
