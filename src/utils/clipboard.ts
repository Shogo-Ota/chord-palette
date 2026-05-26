/**
 * 段階的フォールバック付きクリップボード書き込み。
 *
 * 優先順位:
 *  1. `navigator.clipboard.writeText`（secure context: HTTPS / localhost のみ）
 *  2. `<textarea>` + `document.execCommand("copy")`（非 secure context / 旧ブラウザ）
 *  3. `navigator.share({ text })`（Web Share API 経由でテキストを送信）
 *  4. すべて失敗 → false
 *
 * `navigator.share` の AbortError（ユーザーキャンセル）は「成功扱い」として true を返す。
 * 呼び出し側は false のときのみエラートーストを出せばよい。
 */

const IS_BROWSER = typeof window !== "undefined" && typeof document !== "undefined";

/** iOS Safari は UA で判定する（visualViewport の挙動が他と異なるため） */
function isIOS(): boolean {
  if (!IS_BROWSER) return false;
  const ua = navigator.userAgent || "";
  const platform = (navigator as Navigator & { platform?: string }).platform || "";
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ は Mac UA を返すため touch points で判別
    (platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * 1 段目: Async Clipboard API（HTTPS / localhost 必須）
 */
async function tryAsyncClipboard(text: string): Promise<boolean> {
  if (!IS_BROWSER) return false;
  if (!window.isSecureContext) return false;
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * 2 段目: `<textarea>` + execCommand("copy")
 *
 * iOS Safari は通常の `select()` だけでは選択できないため、
 *  - `contentEditable = "true"` + `readOnly = false`
 *  - `createRange` で選択範囲を作って `Selection` にセット
 *  - フォントサイズを 16px 以上にしてズーム発火を抑止
 * という対応を入れる。
 *
 * try/finally で textarea を必ず DOM から外す。
 */
function tryExecCommand(text: string): boolean {
  if (!IS_BROWSER) return false;
  if (typeof document.execCommand !== "function") return false;

  const previouslyFocused = document.activeElement as HTMLElement | null;
  const textarea = document.createElement("textarea");

  try {
    textarea.value = text;
    // iOS Safari は readonly + contentEditable の組み合わせで選択範囲を取れる
    textarea.setAttribute("readonly", "");
    textarea.contentEditable = "true";
    // 画面外ではなく viewport 内に置く（iOS で select が効くため）
    // ただし視覚的には影響しないように透明 + 1px サイズ
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.padding = "0";
    textarea.style.border = "none";
    textarea.style.outline = "none";
    textarea.style.boxShadow = "none";
    textarea.style.background = "transparent";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    // iOS のオートズーム抑止
    textarea.style.fontSize = "16px";

    document.body.appendChild(textarea);

    if (isIOS()) {
      // iOS: Range + Selection で確実に選択する
      const range = document.createRange();
      range.selectNodeContents(textarea);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      textarea.setSelectionRange(0, text.length);
    } else {
      textarea.focus({ preventScroll: true });
      textarea.select();
      try {
        textarea.setSelectionRange(0, text.length);
      } catch {
        /* 一部ブラウザで setSelectionRange が型不一致を投げる場合がある */
      }
    }

    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    return ok;
  } catch {
    return false;
  } finally {
    if (textarea.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
    // フォーカスを元の要素に戻す（入力中だった場合 UX が壊れない）
    if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      try {
        previouslyFocused.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 3 段目: Web Share API でテキストを送る。
 * AbortError（ユーザーキャンセル）は「成功扱い」にする。
 */
async function tryNavigatorShare(text: string): Promise<boolean> {
  if (!IS_BROWSER) return false;
  if (typeof navigator.share !== "function") return false;
  try {
    await navigator.share({ text });
    return true;
  } catch (err) {
    // ユーザーがキャンセルしただけ → 「失敗」とは扱わない
    if (err instanceof Error && err.name === "AbortError") return true;
    return false;
  }
}

/**
 * 非 secure context（LAN / HTTP）でも使えるクリップボード書き込み。
 *
 * 各段階のエラーを完全に握りつぶし、最後まで fallback を試す。
 * すべて失敗した場合のみ false を返す。
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!IS_BROWSER) return false;

  // 1. Async Clipboard API
  if (await tryAsyncClipboard(text)) return true;

  // 2. execCommand
  if (tryExecCommand(text)) return true;

  // 3. Web Share API
  if (await tryNavigatorShare(text)) return true;

  return false;
}

/**
 * 開発時に非 secure context で起動している場合に開発者向け warning を出す。
 * - localhost / 127.0.0.1 は除外（dev server は secure context 扱い）
 * - 一度だけ出す
 *
 * App / main の初期化時に呼ぶ想定。ユーザー向けの表示は出さない。
 */
let warnedInsecure = false;
export function warnIfInsecureContext(): void {
  if (!IS_BROWSER) return;
  if (warnedInsecure) return;
  if (window.isSecureContext) return;

  const host = window.location?.hostname ?? "";
  // localhost / 127.0.0.1 / ::1 は除外（ただ isSecureContext が true になるはずなのでここに来ない）
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return;

  warnedInsecure = true;
  console.warn(
    "[Chord Palette] 非 secure context で動作中です (例: http://192.168.x.x:5173)。\n" +
      "navigator.clipboard.writeText は無効化されており、execCommand / navigator.share に fallback します。\n" +
      "本番では HTTPS でのアクセスを推奨します。"
  );
}
