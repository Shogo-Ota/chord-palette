import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MAX_ATTEMPTS = 24;
const POLL_MS = 1250;

type Phase = "loading" | "error";

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
  const startedRef = useRef(false);

  const fetchLicense = useCallback(async (sessionId: string): Promise<"ok" | "pending" | "fail"> => {
    const res = await fetch(
      `/api/checkout-license?session_id=${encodeURIComponent(sessionId)}`
    );
    if (res.status === 202) return "pending";
    if (!res.ok) return "fail";
    const data = (await res.json()) as { license?: string };
    if (!data.license) return "fail";
    const home = new URL("/", window.location.origin);
    home.searchParams.set("license", data.license);
    window.location.replace(home.toString());
    return "ok";
  }, []);

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

  return (
    <div className="checkout-success-page">
      <div className="checkout-success-card">
        <p className="checkout-success-logo" aria-hidden="true">
          🎨
        </p>
        <h1 className="checkout-success-title">Chord Palette Pro</h1>
        {phase === "loading" ? (
          <>
            <p className="checkout-success-message">{message}</p>
            <div className="checkout-success-spinner" aria-hidden="true" />
            {attempt > 3 && (
              <p className="checkout-success-hint">
                このままお待ちください。完了すると自動でアプリに戻ります。
              </p>
            )}
          </>
        ) : (
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
