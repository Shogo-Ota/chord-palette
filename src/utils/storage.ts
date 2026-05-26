import { KEYS, type Key, type PaletteChord } from "./musicTheory";
import { normalizeInstrumentId, type InstrumentId } from "./instrumentPresets";
import type { BeatPattern, DrumPattern } from "./audioEngine";

const STORAGE_KEY = "cp_state_v1";

export interface PersistedState {
  selectedKey: Key;
  palette: PaletteChord[];
  bpm: number;
  drumPattern: DrumPattern;
  /** v2.8 (Sprint 13): Beat 軸（ハイハット密度） */
  beatPattern: BeatPattern;
  chordDurationMode: "1" | "1/2" | "1/4";
  isLooping: boolean;
  instrumentId: InstrumentId;
}

const DRUM_PATTERNS: ReadonlySet<DrumPattern> = new Set<DrumPattern>([
  "none",
  "rock",
  "jazz",
  "funk",
  "pop",
  "soul",
]);
const BEAT_PATTERNS: ReadonlySet<BeatPattern> = new Set<BeatPattern>([
  "none",
  "4beat",
  "8beat",
  "16beat",
]);
const DURATION_MODES = new Set(["1", "1/2", "1/4"]);

/** 旧 drumPattern が "4beat" 等の Beat 名で保存されていた場合の判定 */
function isLegacyBeatName(value: string): value is Exclude<BeatPattern, "none"> {
  return value === "4beat" || value === "8beat" || value === "16beat";
}

/**
 * v2.8 (Sprint 13): drumPattern と beatPattern を 2 軸として正規化する。
 *
 * - 旧データ（Sprint 12 以前）の drumPattern が "4beat" / "8beat" / "16beat" の場合:
 *     → Drum=none, Beat=旧値（旧ユーザーが「8ビート」を選んでいたなら新 UI でも「Beat=8beat」）
 *   Sprint 12 の "4beat→rock" マップは Sprint 13 で廃止。
 * - 旧データの drumPattern が "rock" / "jazz" / ... の場合:
 *     → Drum=その値, Beat=（新フィールドが存在すればその値、なければ "none"）
 * - 不正値・undefined: "none"
 */
function normalizeDrumBeat(rawDrum: unknown, rawBeat: unknown): {
  drumPattern: DrumPattern;
  beatPattern: BeatPattern;
} {
  // 旧 drumPattern が Beat 名で保存されていた場合は Beat 軸に移管
  if (typeof rawDrum === "string" && isLegacyBeatName(rawDrum)) {
    return { drumPattern: "none", beatPattern: rawDrum };
  }

  const drumPattern: DrumPattern =
    typeof rawDrum === "string" && DRUM_PATTERNS.has(rawDrum as DrumPattern)
      ? (rawDrum as DrumPattern)
      : "none";

  const beatPattern: BeatPattern =
    typeof rawBeat === "string" && BEAT_PATTERNS.has(rawBeat as BeatPattern)
      ? (rawBeat as BeatPattern)
      : "none";

  return { drumPattern, beatPattern };
}

function isPaletteChord(value: unknown): value is PaletteChord {
  if (!value || typeof value !== "object") return false;
  const c = value as PaletteChord;
  return (
    typeof c.displayName === "string" &&
    typeof c.label === "string" &&
    typeof c.rootNote === "number" &&
    Array.isArray(c.intervals)
  );
}

/** Sprint 10: inversion を 0|1|2|3 に強制（不正値・未定義は 0） */
function sanitizeInversion(value: unknown): 0 | 1 | 2 | 3 {
  if (value === 1 || value === 2 || value === 3) return value;
  return 0;
}

function sanitizePaletteChord(raw: PaletteChord): PaletteChord {
  return {
    ...raw,
    inversion: sanitizeInversion((raw as { inversion?: unknown }).inversion),
  };
}

function sanitizePersistedState(raw: unknown): Partial<PersistedState> | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<PersistedState>;
  const result: Partial<PersistedState> = {};

  if (typeof data.selectedKey === "string" && KEYS.includes(data.selectedKey as Key)) {
    result.selectedKey = data.selectedKey as Key;
  }

  if (Array.isArray(data.palette)) {
    result.palette = data.palette
      .filter(isPaletteChord)
      .map(sanitizePaletteChord);
  }

  if (typeof data.bpm === "number" && Number.isFinite(data.bpm)) {
    result.bpm = Math.min(200, Math.max(10, Math.round(data.bpm)));
  }

  if (data.drumPattern !== undefined || data.beatPattern !== undefined) {
    const { drumPattern, beatPattern } = normalizeDrumBeat(
      data.drumPattern,
      data.beatPattern
    );
    result.drumPattern = drumPattern;
    result.beatPattern = beatPattern;
  }

  if (typeof data.chordDurationMode === "string" && DURATION_MODES.has(data.chordDurationMode)) {
    result.chordDurationMode = data.chordDurationMode as PersistedState["chordDurationMode"];
  }

  if (typeof data.isLooping === "boolean") {
    result.isLooping = data.isLooping;
  }

  if (typeof data.instrumentId === "string") {
    result.instrumentId = normalizeInstrumentId(data.instrumentId);
  }

  return Object.keys(result).length > 0 ? result : null;
}

export function loadPersistedState(): Partial<PersistedState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizePersistedState(JSON.parse(raw));
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function savePersistedState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function clearPersistedState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
