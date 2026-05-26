import type { PaletteChord } from "./musicTheory";

/** ピアノらしい明瞭なレジスター（旧 36–48 / 48–72 は低すぎた） */
const BASS_MIN = 48;
const BASS_MAX = 57;
const UPPER_MIN = 60;
const UPPER_MAX = 79;
const MAX_UPPER_SPAN = 12;

let lastVoicing: number[] | null = null;

export function resetVoicingState(): void {
  lastVoicing = null;
}

export function getLastVoicing(): number[] | null {
  return lastVoicing;
}

function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

function getChordPitchClasses(chord: PaletteChord): number[] {
  const pcs = new Set<number>();
  for (const interval of chord.intervals) {
    pcs.add(pitchClass(chord.rootNote + interval));
  }
  return Array.from(pcs);
}

function getBassPitchClass(chord: PaletteChord): number {
  // オンコード (bassNoteOverride) は転回より優先
  if (chord.bassNoteOverride !== undefined && chord.bassNoteOverride !== null) {
    return pitchClass(chord.bassNoteOverride);
  }
  // 転回指定: intervals[inversion] のピッチクラスを最低音とする
  const inv = chord.inversion ?? 0;
  if (inv > 0 && chord.intervals.length > inv) {
    return pitchClass(chord.rootNote + chord.intervals[inv]);
  }
  return pitchClass(chord.rootNote);
}

/**
 * 「転回指定が有効」かどうか。
 * - inversion === 0 → 無効（従来挙動）
 * - bassNoteOverride 指定あり → 無効（オンコード優先）
 * - intervals[inversion] が範囲外 → 無効（防御）
 */
function hasActiveInversion(chord: PaletteChord): boolean {
  if (chord.bassNoteOverride !== undefined && chord.bassNoteOverride !== null) return false;
  const inv = chord.inversion ?? 0;
  if (inv <= 0) return false;
  if (inv >= chord.intervals.length) return false;
  return true;
}

function midiCandidatesForPc(pc: number, min: number, max: number): number[] {
  const out: number[] = [];
  for (let m = min; m <= max; m++) {
    if (pitchClass(m) === pc) out.push(m);
  }
  return out;
}

function compressUpperSpan(voices: number[]): number[] {
  if (voices.length === 0) return voices;
  let v = [...voices].sort((a, b) => a - b);
  while (v[v.length - 1] - v[0] > MAX_UPPER_SPAN) {
    const next = v.map((n) => n - 12);
    if (next[0] < UPPER_MIN) break;
    v = next;
  }
  return v;
}

function voiceBass(pc: number, previousVoicing?: number[]): number {
  const candidates = midiCandidatesForPc(pc, BASS_MIN, BASS_MAX);
  if (candidates.length === 0) return BASS_MIN + pc;

  if (!previousVoicing?.length) {
    return candidates[Math.floor(candidates.length / 2)] ?? candidates[0];
  }

  const prevBass = Math.min(...previousVoicing);
  let best = candidates[0];
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = Math.abs(c - prevBass);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function voiceUpperClose(pcs: number[], previousVoicing?: number[]): number[] {
  const sorted = [...pcs].sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const prevUpper =
    previousVoicing && previousVoicing.length > 0
      ? previousVoicing.filter((n) => n !== Math.min(...previousVoicing))
      : undefined;

  if (!prevUpper?.length) {
    const voices: number[] = [];
    const firstCandidates = midiCandidatesForPc(sorted[0], UPPER_MIN, UPPER_MAX);
    const anchor =
      firstCandidates[Math.floor(firstCandidates.length / 2)] ??
      firstCandidates[0] ??
      64;
    voices.push(anchor);

    for (let i = 1; i < sorted.length; i++) {
      const pc = sorted[i];
      let midi = voices[i - 1] + 1;
      while (midi <= UPPER_MAX && pitchClass(midi) !== pc) midi++;
      if (midi > UPPER_MAX || pitchClass(midi) !== pc) {
        const fallback =
          midiCandidatesForPc(pc, UPPER_MIN, UPPER_MAX).find((m) => m > voices[i - 1]) ??
          midiCandidatesForPc(pc, UPPER_MIN, UPPER_MAX)[0];
        midi = fallback ?? UPPER_MIN + pc;
      }
      voices.push(midi);
    }
    return compressUpperSpan(voices);
  }

  const used = new Set<number>();
  const voices: number[] = [];

  for (const pc of sorted) {
    const candidates = midiCandidatesForPc(pc, UPPER_MIN, UPPER_MAX);
    let best = candidates[0];
    let bestCost = Infinity;
    for (const c of candidates) {
      if (used.has(c)) continue;
      const cost = Math.min(...prevUpper.map((p) => Math.abs(c - p)));
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
      }
    }
    voices.push(best);
    used.add(best);
  }

  return compressUpperSpan(voices.sort((a, b) => a - b));
}

/**
 * 転回指定有効時のクローズボイシング。
 * ベースは転回後の最低音 PC を BASS レンジに配置し、
 * 上声部はベースの直上から昇順クローズに積み上げる（voice-leading なし）。
 */
function voiceWithInversion(chord: PaletteChord): number[] {
  const allPcs = getChordPitchClasses(chord);
  const bassPc = getBassPitchClass(chord);
  const upperPcs = allPcs.filter((pc) => pc !== bassPc);

  // 転回指定はユーザー指定優先 → 進行横断 voice-leading は使わない
  const bassCandidates = midiCandidatesForPc(bassPc, BASS_MIN, BASS_MAX);
  const bassMidi =
    bassCandidates[Math.floor(bassCandidates.length / 2)] ??
    bassCandidates[0] ??
    BASS_MIN + bassPc;

  // 上声部はベース直上から昇順クローズに配置
  const voices: number[] = [];
  let cursor = Math.max(UPPER_MIN, bassMidi + 1);
  // intervals 順に並んだ PC を、転回番号位置から1周回して取得
  const inv = chord.inversion ?? 0;
  const orderedPcs: number[] = [];
  for (let i = 1; i < chord.intervals.length; i++) {
    const idx = (inv + i) % chord.intervals.length;
    orderedPcs.push(pitchClass(chord.rootNote + chord.intervals[idx]));
  }
  // upperPcs に含まれないものは除外（重複 PC のトライアド sus 等の防御）
  const upperOrdered = orderedPcs.filter((pc) => upperPcs.includes(pc));

  for (const pc of upperOrdered) {
    let midi = cursor;
    while (midi <= UPPER_MAX && pitchClass(midi) !== pc) midi++;
    if (midi > UPPER_MAX || pitchClass(midi) !== pc) {
      // フォールバック: 範囲内の最低候補
      const candidates = midiCandidatesForPc(pc, UPPER_MIN, UPPER_MAX);
      midi = candidates[0] ?? UPPER_MIN + pc;
    }
    voices.push(midi);
    cursor = midi + 1;
  }

  const compressed = compressUpperSpan(voices);
  return [bassMidi, ...compressed].sort((a, b) => a - b);
}

/**
 * コードを MIDI ノート列（ベース + 上声部、昇順）にボイシングする。
 */
export function voiceChord(chord: PaletteChord, previousVoicing?: number[]): number[] {
  // 転回指定（>0）かつオンコードでないとき: ユーザー指定優先の特別パス
  if (hasActiveInversion(chord)) {
    return voiceWithInversion(chord);
  }

  // === 従来挙動（inversion === 0 のとき完全に維持） ===
  const allPcs = getChordPitchClasses(chord);
  const bassPc = getBassPitchClass(chord);
  const upperPcs = allPcs.filter((pc) => pc !== bassPc);

  const bassMidi = voiceBass(bassPc, previousVoicing);
  const upper = voiceUpperClose(upperPcs, previousVoicing);

  return [bassMidi, ...upper].sort((a, b) => a - b);
}

export interface VoiceChordOptions {
  useVoiceLeading?: boolean;
}

/**
 * 再生用: オプションで進行横断ボイスリーディング状態を更新する。
 */
export function voiceChordForPlayback(
  chord: PaletteChord,
  options?: VoiceChordOptions
): number[] {
  const useVoiceLeading = options?.useVoiceLeading ?? false;
  const prev = useVoiceLeading ? (lastVoicing ?? undefined) : undefined;
  const notes = voiceChord(chord, prev);
  if (useVoiceLeading) {
    lastVoicing = notes;
  }
  return notes;
}
