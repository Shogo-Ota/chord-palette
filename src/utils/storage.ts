import { KEYS, type Key, type PaletteChord } from "./musicTheory";
import { normalizeInstrumentId, type InstrumentId } from "./instrumentPresets";
import type { DrumPattern } from "./audioEngine";

const STORAGE_KEY = "cp_state_v1";

export interface PersistedState {
  selectedKey: Key;
  palette: PaletteChord[];
  bpm: number;
  drumPattern: DrumPattern;
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
const DURATION_MODES = new Set(["1", "1/2", "1/4"]);

/**
 * v2.7 (Sprint 12): 旧 drumPattern 名と新ジャンル名のマッピング。
 * 不正値・undefined は "none" に正規化される。
 */
function normalizeDrumPattern(value: unknown): DrumPattern {
  if (typeof value !== "string") return "none";
  // 旧名から新ジャンルへ
  if (value === "4beat") return "rock";
  if (value === "8beat") return "pop";
  if (value === "16beat") return "funk";
  if (DRUM_PATTERNS.has(value as DrumPattern)) return value as DrumPattern;
  return "none";
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

  if (data.drumPattern !== undefined) {
    result.drumPattern = normalizeDrumPattern(data.drumPattern);
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
