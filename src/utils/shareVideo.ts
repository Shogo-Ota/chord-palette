/**
 * 動画ファイル + テキストを Web Share API で送るオーケストレータ。
 *
 * フォールバック順:
 *  1. `navigator.share({ files: [video], text })`  ← canShare({ files }) true
 *  2. 動画 DL + `navigator.share({ text })`        ← canShare({ files }) false
 *  3. 動画 DL + `copyTextToClipboard(text)`        ← navigator.share 非対応 / share 失敗
 *
 * AbortError（ユーザーキャンセル）は呼び出し側に投げ直して伝える。
 */

import { copyTextToClipboard } from "./clipboard";
import type { Key, PaletteChord } from "./musicTheory";

export type ShareVideoMode =
  | "shared" // 動画 + テキストが share シートで送信できた
  | "shared-text-only" // 動画は DL に落ちたが、テキストは share シートで送れた
  | "downloaded-copied" // 動画 DL + テキストをクリップボードへコピー成功
  | "downloaded-only"; // 動画 DL のみ（テキストコピーも失敗）

export function buildShareText(palette: PaletteChord[], key: Key, bpm: number): string {
  const progression = palette.map((c) => c.displayName).join(" - ");
  return `こんなコード進行どう？\n${progression}\nKey: ${key} Major / BPM ${bpm}\n#コード進行 #作曲\nhttps://chord-palette.vercel.app/`;
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 少し遅延してから revoke（即時 revoke だと Safari で失敗することがある）
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canShareFiles(file: File): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function hasShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export async function shareVideoFile(
  file: File,
  text: string
): Promise<ShareVideoMode> {
  // 1. files も text もまとめて送れる
  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file], text, title: "Chord Palette — 進行" });
      return "shared";
    } catch (err) {
      // ユーザーキャンセルはそのまま投げ直す（呼び出し側で AbortError を吸収）
      if (err instanceof Error && err.name === "AbortError") throw err;
      // それ以外は fallback に流す（実装非対応・NotAllowed 等）
    }
  }

  // 2. テキストだけ share + 動画は DL
  //   - canShare(files) false のとき
  //   - もしくは 1 で非 AbortError の失敗が起きたとき
  if (hasShare()) {
    try {
      // 動画は先に DL を走らせる（share シートでユーザーが時間をかけても DL は完了している）
      downloadFile(file);
      await navigator.share({ text, title: "Chord Palette — 進行" });
      return "shared-text-only";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      // それ以外（share 自体が失敗）は最終フォールバックへ
      // ※ downloadFile はすでに走っているのでテキストコピーだけ追加で試す
      const copied = await copyTextToClipboard(text);
      return copied ? "downloaded-copied" : "downloaded-only";
    }
  }

  // 3. share 完全非対応 → DL + クリップボード
  downloadFile(file);
  const copied = await copyTextToClipboard(text);
  return copied ? "downloaded-copied" : "downloaded-only";
}
