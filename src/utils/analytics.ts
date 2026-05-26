/**
 * 軽量アナリティクス（Plausible 互換）。
 * VITE_PLAUSIBLE_DOMAIN が未設定なら no-op（開発・ローカルでエラーにしない）。
 *
 * Phase 1 ゲート指標:
 * - pageview（自動）
 * - play_sequence / video_export / tone_change / chord_add
 */

export type AnalyticsEvent =
  | "play_sequence"
  | "video_export"
  | "tone_change"
  | "chord_add"
  | "share_video";

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, string | number> }) => void;
  }
}

const DOMAIN = import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined;

export function isAnalyticsEnabled(): boolean {
  return typeof DOMAIN === "string" && DOMAIN.length > 0;
}

/** index.html に script を注入（main から 1 回だけ呼ぶ） */
export function initAnalytics(): void {
  if (!isAnalyticsEnabled() || typeof document === "undefined") return;
  if (document.querySelector('script[data-plausible]')) return;

  const script = document.createElement("script");
  script.defer = true;
  script.dataset.domain = DOMAIN!;
  script.dataset.plausible = "true";
  script.src = "https://plausible.io/js/script.js";
  document.head.appendChild(script);
}

export function trackEvent(name: AnalyticsEvent, props?: Record<string, string | number>): void {
  if (!isAnalyticsEnabled()) return;
  try {
    window.plausible?.(name, props ? { props } : undefined);
  } catch {
    /* ignore */
  }
}
