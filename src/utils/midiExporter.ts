// === MIDI エクスポート ===
//
// Sprint 16: パレットを SMF Type 1（2 トラック、PPQ 480）に書き出す。
//
// Track 1: Chord — Acoustic Grand Piano (program 0)、voice leading 後の MIDI 値
// Track 2: Drum  — GM channel 10 (= channel index 9)、ジャンル別パターン
//
// 動的 import 戦略: `@tonejs/midi` (gzip 15 kB) はメインバンドルに含めず、
// この関数が呼ばれた時点で初めてロードする。
//
// 出力: Blob (audio/midi)

import type { BeatPattern, DrumPattern } from "./audioEngine";
import type { PaletteChord } from "./musicTheory";
import { voiceChordForPlayback, resetVoicingState } from "./voicing";

/** PPQ (parts per quarter note) — SMF テンポ分解能 */
const PPQ = 480;

/** 1 拍 = 480 tick として、`beats * 2 * 240`... ではなく単純に `beats * 480` で OK
 *  ※ アプリ内 `beats` は「四分音符の倍数」を指す（1 = quarter, 0.5 = 8th, 0.25 = 16th 等の表記だが
 *    実体は quarter 単位なので PPQ をそのまま掛ければよい）。
 */
function beatsToTicks(beats: number): number {
  return Math.round(beats * PPQ);
}

/** ファイル名生成: chord-palette-YYYYMMDD-HHmmss.mid */
export function buildMidiFileName(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `chord-palette-${yyyy}${mm}${dd}-${hh}${mi}${ss}.mid`;
}

/** GM Drum Map ノート番号 */
const DRUM_NOTES = {
  KICK: 36,
  SNARE: 38,
  HIHAT_CLOSED: 42,
  HIHAT_OPEN: 46,
  CLAP: 39,
} as const;

interface DrumHit {
  /** 16th step（小節内位置 0..15） */
  step: number;
  /** ドラムノート番号 */
  note: number;
  /** 0–1 で正規化されたベロシティ */
  velocity: number;
}

/**
 * 1 小節 = 16 step 分のドラムヒット列を計算する。
 * audioEngine.scheduleNote と整合性を取り、Kick/Snare/HiHat を MIDI 化する。
 */
function buildDrumHits(drum: DrumPattern, beat: BeatPattern): DrumHit[] {
  const hits: DrumHit[] = [];
  const GHOST = 0.45;

  for (let step = 0; step < 16; step++) {
    // --- Drum 軸（ジャンル別） ---
    if (drum === "rock") {
      if (step % 4 === 0) hits.push({ step, note: DRUM_NOTES.KICK, velocity: 1.0 });
      if (step === 4 || step === 12)
        hits.push({ step, note: DRUM_NOTES.SNARE, velocity: 1.0 });
    } else if (drum === "jazz") {
      if (step === 0) hits.push({ step, note: DRUM_NOTES.KICK, velocity: 1.0 });
      if (step === 4 || step === 12)
        hits.push({ step, note: DRUM_NOTES.SNARE, velocity: GHOST });
    } else if (drum === "funk") {
      if (step === 0 || step === 6 || step === 8 || step === 14) {
        hits.push({ step, note: DRUM_NOTES.KICK, velocity: 1.0 });
      }
      if (step === 4 || step === 12)
        hits.push({ step, note: DRUM_NOTES.SNARE, velocity: 1.0 });
      if (step === 10)
        hits.push({ step, note: DRUM_NOTES.SNARE, velocity: GHOST });
    } else if (drum === "pop") {
      if (step % 8 === 0) hits.push({ step, note: DRUM_NOTES.KICK, velocity: 1.0 });
      if (step === 4 || step === 12)
        hits.push({ step, note: DRUM_NOTES.SNARE, velocity: 1.0 });
    } else if (drum === "soul") {
      if (step === 0 || step === 10)
        hits.push({ step, note: DRUM_NOTES.KICK, velocity: 1.0 });
      if (step === 8) hits.push({ step, note: DRUM_NOTES.SNARE, velocity: 1.0 });
      if (step === 14)
        hits.push({ step, note: DRUM_NOTES.SNARE, velocity: GHOST });
    }

    // --- Beat 軸 + Funk Open Hat 衝突調停 ---
    const funkOpen = drum === "funk" && (step === 2 || step === 10);
    if (funkOpen) {
      hits.push({ step, note: DRUM_NOTES.HIHAT_OPEN, velocity: 1.0 });
    } else {
      let beatHit = false;
      if (beat === "4beat") beatHit = step % 4 === 0;
      else if (beat === "8beat") beatHit = step % 2 === 0;
      else if (beat === "16beat") beatHit = true;
      if (beatHit) {
        const v = drum === "pop" ? 0.55 : 1.0;
        hits.push({ step, note: DRUM_NOTES.HIHAT_CLOSED, velocity: v });
      }
    }
  }
  return hits;
}

/** スウィング遅延（16th 単位の tick 数）を返す */
function swingDelayTicks(step: number, drum: DrumPattern, sixteenthTicks: number): number {
  if (drum === "jazz" || drum === "soul") {
    if (step % 4 === 3) return Math.round(sixteenthTicks * (1 / 3));
  } else if (drum === "funk") {
    if (step % 2 === 1) return Math.round(sixteenthTicks * (1 / 6));
  }
  return 0;
}

/** 0–1 ベロシティを MIDI 1..127 に変換（Track1 用、コードノート） */
function normalizeMidiVelocity(v: number): number {
  return Math.max(1, Math.min(127, Math.round(v)));
}

/** ドラム種別ごとの MIDI velocity（仕様: Kick 110 / Snare 100 / HiHat 70 / Clap 95、ゴースト ×0.5） */
function drumMidiVelocity(note: number, velocity01: number): number {
  let base = 100;
  switch (note) {
    case DRUM_NOTES.KICK:
      base = 110;
      break;
    case DRUM_NOTES.SNARE:
      base = 100;
      break;
    case DRUM_NOTES.HIHAT_CLOSED:
    case DRUM_NOTES.HIHAT_OPEN:
      base = 70;
      break;
    case DRUM_NOTES.CLAP:
      base = 95;
      break;
  }
  // 仕様: ゴースト (velocity01 ≈ 0.45) は ×0.5
  const isGhost = velocity01 < 0.6;
  const scale = isGhost ? 0.5 : velocity01;
  return normalizeMidiVelocity(base * scale);
}

export interface ExportMidiOptions {
  palette: PaletteChord[];
  bpm: number;
  drumPattern: DrumPattern;
  beatPattern: BeatPattern;
}

export interface ExportMidiResult {
  blob: Blob;
  fileName: string;
}

/**
 * パレット + ドラム設定を MIDI Blob に変換する（動的 import）。
 */
export async function exportPaletteToMidi(
  options: ExportMidiOptions
): Promise<ExportMidiResult> {
  const { palette, bpm, drumPattern, beatPattern } = options;

  if (palette.length === 0) {
    throw new Error("パレットが空です");
  }

  // 動的 import: @tonejs/midi (~15 kB gzip) は MIDI 書き出し時のみロード
  const { Midi } = await import("@tonejs/midi");

  const midi = new Midi();
  // @tonejs/midi のデフォルト PPQ は 480。SMF Type 1 仕様に合致しているので
  // 明示的な代入は不要（プロパティが getter のみ）。PPQ 定数で計算する。
  if (midi.header.ppq !== PPQ) {
    // 防御: もし将来 @tonejs/midi のデフォルトが変わった場合に検出
    console.warn(
      `[midiExporter] @tonejs/midi default PPQ is ${midi.header.ppq}, expected ${PPQ}`
    );
  }
  midi.header.setTempo(bpm);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [4, 4],
  });

  // === Track 1: Chord (Acoustic Grand Piano) ===
  const chordTrack = midi.addTrack();
  chordTrack.name = "Chord";
  chordTrack.channel = 0;
  chordTrack.instrument.number = 0;

  // voice leading 状態をリセットしてから一連の発音用ノートを計算
  resetVoicingState();
  let cursorTicks = 0;

  for (const chord of palette) {
    const beats = chord.beats || 1;
    const durationTicks = beatsToTicks(beats);
    const notes = voiceChordForPlayback(chord, { useVoiceLeading: true });
    for (const midiNote of notes) {
      chordTrack.addNote({
        midi: midiNote,
        ticks: cursorTicks,
        durationTicks,
        velocity: 100 / 127, // @tonejs/midi は 0–1 正規化
      });
    }
    cursorTicks += durationTicks;
  }

  // 再生用の voicing 状態が DAW 書き出しで汚染されないようにリセット
  resetVoicingState();

  // === Track 2: Drum (GM Channel 10 = index 9) ===
  const drumTrack = midi.addTrack();
  drumTrack.name = "Drum";
  drumTrack.channel = 9;

  if (drumPattern !== "none" || beatPattern !== "none") {
    const sixteenthTicks = PPQ / 4; // 480/4 = 120
    const totalChordTicks = cursorTicks;
    const measureTicks = PPQ * 4; // 1 小節 = 4 拍

    const measureCount = Math.max(1, Math.ceil(totalChordTicks / measureTicks));
    const hits = buildDrumHits(drumPattern, beatPattern);

    for (let m = 0; m < measureCount; m++) {
      const measureStart = m * measureTicks;
      for (const hit of hits) {
        const stepTick = hit.step * sixteenthTicks;
        const swing = swingDelayTicks(hit.step, drumPattern, sixteenthTicks);
        const noteTick = measureStart + stepTick + swing;
        // パレット全長を超えるノートは出力しない（DAW で余韻だけ残るのを防ぐ）
        if (noteTick >= totalChordTicks) continue;

        const isOpen = hit.note === DRUM_NOTES.HIHAT_OPEN;
        const noteDurationTicks = isOpen
          ? Math.round(sixteenthTicks * 1.8)
          : Math.max(30, Math.round(sixteenthTicks * 0.5));

        drumTrack.addNote({
          midi: hit.note,
          ticks: noteTick,
          durationTicks: noteDurationTicks,
          velocity: drumMidiVelocity(hit.note, hit.velocity) / 127,
        });
      }
    }
  }

  // === Blob 化 ===
  const bytes = midi.toArray();
  const blob = new Blob([new Uint8Array(bytes)], { type: "audio/midi" });
  const fileName = buildMidiFileName();
  return { blob, fileName };
}

/** ブラウザ download or Web Share でユーザーに渡す */
export async function deliverMidiBlob(
  blob: Blob,
  fileName: string
): Promise<"shared" | "downloaded"> {
  const file = new File([blob], fileName, { type: "audio/midi" });

  // Web Share Level 2 (files) 対応端末
  // iOS Safari は files が "audio/midi" を許可する保証がないので try/catch
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };

  if (
    typeof nav.canShare === "function" &&
    typeof nav.share === "function" &&
    nav.canShare({ files: [file] })
  ) {
    try {
      await nav.share({
        files: [file],
        title: "Chord Palette MIDI",
        text: "Chord Palette で作った MIDI",
      });
      return "shared";
    } catch (err) {
      // AbortError は呼び出し側に伝播させる
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }
      // それ以外はダウンロード fallback
    }
  }

  // <a download> による直接ダウンロード
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // URL.revokeObjectURL をやや遅延（モバイル Safari でダウンロード前に revoke すると失敗するため）
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }, 5000);
  return "downloaded";
}
