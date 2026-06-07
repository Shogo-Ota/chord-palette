/**
 * 縦型動画（720×1280, 30fps）を MediaRecorder で書き出すオーケストレータ。
 *
 * - Canvas に毎フレーム描画 → `canvas.captureStream(30)` でビデオトラック取得
 * - `audioEngine.attachCaptureDestination()` でオーディオトラック取得
 * - 両者を 1 つの MediaStream に合成して MediaRecorder で記録
 * - パレット 1 周再生分（最大 16 小節）でクリップして自動停止
 * - MIME は 5 段フォールバック（MP4 → WebM）
 */

import type { Key, PaletteChord } from "./musicTheory";
import type { InstrumentId } from "./instrumentPresets";
import {
  attachCaptureDestination,
  awaitRushSamplerIfLoading,
  detachCaptureDestination,
  setExportingVideo,
  playPaletteSequence,
  stopPaletteSequence,
  triggerRushSamplerLoad,
  type BeatPattern,
  type DrumPattern,
} from "./audioEngine";
import {
  renderVideoFrame,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  type VideoRenderState,
} from "./videoRenderer";

const MAX_BARS = 16;
const STOP_TAIL_MS = 400;

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export interface VideoExportOptions {
  palette: PaletteChord[];
  selectedKey: Key;
  bpm: number;
  drumPattern: DrumPattern;
  /** v2.8 (Sprint 13): Beat 軸（ハイハット密度） */
  beatPattern: BeatPattern;
  instrumentId?: InstrumentId;
  /** アプリ画面側のハイライト同期用コールバック */
  onTick?: (index: number) => void;
}

export interface VideoExportResult {
  file: File;
  mimeType: string;
}

export function isVideoExportSupported(): boolean {
  if (typeof MediaRecorder === "undefined") return false;
  return MIME_CANDIDATES.some((m) => safeIsTypeSupported(m));
}

function safeIsTypeSupported(mime: string): boolean {
  try {
    return MediaRecorder.isTypeSupported(mime);
  } catch {
    return false;
  }
}

function pickMimeType(): string {
  for (const mime of MIME_CANDIDATES) {
    if (safeIsTypeSupported(mime)) return mime;
  }
  return "";
}

function pickExtension(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  return "mp4";
}

function buildFilename(mime: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `chord-palette-${stamp}.${pickExtension(mime)}`;
}

function clipPaletteToMaxBars(
  palette: PaletteChord[],
  maxBars: number,
): PaletteChord[] {
  // beats=2 を 1 小節相当として、合計が maxBars を超えたら切る
  let acc = 0;
  const out: PaletteChord[] = [];
  for (const c of palette) {
    const bars = (c.beats || 2) / 2;
    if (acc + bars > maxBars) break;
    acc += bars;
    out.push(c);
  }
  return out.length > 0 ? out : palette.slice(0, 1);
}

/**
 * Canvas + Audio を録画して 1 本の Blob/File を返す。
 *
 * 失敗時は reject。AbortError はユーザーキャンセル相当。
 */
export async function exportProgressionVideo(
  options: VideoExportOptions,
): Promise<VideoExportResult> {
  if (!isVideoExportSupported()) {
    throw new Error("このブラウザは動画書き出しに対応していません");
  }

  const mimeType = pickMimeType();
  if (!mimeType) {
    throw new Error("対応する動画フォーマットが見つかりません");
  }

  const clippedPalette = clipPaletteToMaxBars(options.palette, MAX_BARS);
  if (clippedPalette.length === 0) {
    throw new Error("書き出すコードがありません");
  }

  // Piano 選択時はサンプラーのロード完了を待ってから書き出しを開始する。
  // 未起動なら trigger してから await。失敗時 (state === "error") は合成版で書き出し続行（無音禁止）。
  if (options.instrumentId === "piano") {
    try {
      void triggerRushSamplerLoad();
      await awaitRushSamplerIfLoading();
    } catch (err) {
      console.warn(
        "[videoExporter] Piano sampler load wait failed; continuing with synth",
        err,
      );
    }
  }

  // Canvas を準備（off-DOM）
  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D コンテキストが取得できません");
  }

  // Audio をキャプチャ用 destination に接続
  setExportingVideo(true);
  const audioStream = attachCaptureDestination();

  // Canvas からビデオトラックを取得
  let videoStream: MediaStream;
  try {
    videoStream = canvas.captureStream(30);
  } catch (err) {
    setExportingVideo(false);
    detachCaptureDestination();
    throw err instanceof Error
      ? err
      : new Error("canvas.captureStream に失敗しました");
  }

  // ビデオ + オーディオを合成
  const combined = new MediaStream();
  videoStream.getVideoTracks().forEach((t) => combined.addTrack(t));
  audioStream.getAudioTracks().forEach((t) => combined.addTrack(t));

  // 描画ループの状態
  const renderState: VideoRenderState = {
    palette: clippedPalette,
    selectedKey: options.selectedKey,
    bpm: options.bpm,
    currentIndex: 0,
  };

  let stopped = false;
  let rafId: number | null = null;

  const renderLoop = () => {
    if (stopped) return;
    renderVideoFrame(ctx, renderState);
    rafId = window.requestAnimationFrame(renderLoop);
  };

  // 録音開始
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(combined, {
      mimeType,
      videoBitsPerSecond: 2_500_000,
      audioBitsPerSecond: 128_000,
    });
  } catch (err) {
    setExportingVideo(false);
    detachCaptureDestination();
    videoStream.getTracks().forEach((t) => t.stop());
    throw err instanceof Error
      ? err
      : new Error("MediaRecorder の生成に失敗しました");
  }

  const chunks: Blob[] = [];

  return new Promise<VideoExportResult>((resolve, reject) => {
    let stopScheduled = false;

    const cleanup = () => {
      stopped = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      try {
        videoStream.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      detachCaptureDestination();
      setExportingVideo(false);
    };

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      cleanup();
      try {
        stopPaletteSequence();
      } catch {
        /* ignore */
      }
      const msg =
        (event as unknown as { error?: { message?: string } }).error?.message ??
        "動画の録画に失敗しました";
      reject(new Error(msg));
    };

    recorder.onstop = () => {
      cleanup();
      if (chunks.length === 0) {
        reject(new Error("録画データが空でした"));
        return;
      }
      const blob = new Blob(chunks, { type: mimeType });
      const filename = buildFilename(mimeType);
      const file = new File([blob], filename, { type: mimeType });
      resolve({ file, mimeType });
    };

    try {
      recorder.start(250);
    } catch (err) {
      cleanup();
      reject(
        err instanceof Error
          ? err
          : new Error("MediaRecorder.start に失敗しました"),
      );
      return;
    }

    // 描画ループ開始
    renderLoop();

    // 1 周再生：scheduler の onStop は最後のコードの sustain 経過後に呼ばれる。
    // そこから STOP_TAIL_MS 待って recorder.stop()。
    playPaletteSequence(
      clippedPalette,
      options.bpm,
      options.drumPattern,
      false,
      () => {
        if (stopScheduled) return;
        stopScheduled = true;
        window.setTimeout(() => {
          if (recorder.state === "recording") {
            try {
              recorder.stop();
            } catch {
              /* ignore */
            }
          }
        }, STOP_TAIL_MS);
      },
      (idx) => {
        renderState.currentIndex = idx;
        options.onTick?.(idx);
      },
      { instrumentId: options.instrumentId, beatPattern: options.beatPattern },
    );
  });
}
