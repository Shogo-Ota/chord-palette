import { KEYS, type Key, type PaletteChord } from "./musicTheory";

const STORAGE_KEY = "cp_state_v1";

export interface PersistedState {
  selectedKey: Key;
  palette: PaletteChord[];
  bpm: number;
  drumPattern: "none" | "4beat" | "8beat" | "16beat";
  chordDurationMode: "1" | "1/2" | "1/4";
  isLooping: boolean;
}

const DRUM_PATTERNS = new Set(["none", "4beat", "8beat", "16beat"]);
const DURATION_MODES = new Set(["1", "1/2", "1/4"]);

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

function sanitizePersistedState(raw: unknown): Partial<PersistedState> | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<PersistedState>;
  const result: Partial<PersistedState> = {};

  if (typeof data.selectedKey === "string" && KEYS.includes(data.selectedKey as Key)) {
    result.selectedKey = data.selectedKey as Key;
  }

  if (Array.isArray(data.palette)) {
    result.palette = data.palette.filter(isPaletteChord);
  }

  if (typeof data.bpm === "number" && Number.isFinite(data.bpm)) {
    result.bpm = Math.min(200, Math.max(10, Math.round(data.bpm)));
  }

  if (typeof data.drumPattern === "string" && DRUM_PATTERNS.has(data.drumPattern)) {
    result.drumPattern = data.drumPattern;
  }

  if (typeof data.chordDurationMode === "string" && DURATION_MODES.has(data.chordDurationMode)) {
    result.chordDurationMode = data.chordDurationMode as PersistedState["chordDurationMode"];
  }

  if (typeof data.isLooping === "boolean") {
    result.isLooping = data.isLooping;
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
