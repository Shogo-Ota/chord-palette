// === 音楽理論ロジック ===

export const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export type Key = (typeof KEYS)[number];

export const SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11]; // Major Scale
export const CHORD_TYPES = ["", "m", "m", "", "", "m", "m(♭5)"];
export const CHORD_TYPES_7TH = ["M7", "m7", "m7", "M7", "7", "m7", "m7(♭5)"];
export const FUNCTIONS = ["T", "SD", "T", "SD", "D", "T", "D"] as const;
export type ChordFunction = (typeof FUNCTIONS)[number];

export const DEGREE_LABELS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];

// === Chord intervals by type ===
const TRIAD_INTERVALS: Record<string, number[]> = {
  "": [0, 4, 7],         // major
  "m": [0, 3, 7],        // minor
  "m(♭5)": [0, 3, 6],   // diminished
  "sus2": [0, 2, 7],
  "sus4": [0, 5, 7],
};

const SEVENTH_CHORD_INTERVALS: Record<string, number[]> = {
  "M7": [0, 4, 7, 11],      // major 7th
  "m7": [0, 3, 7, 10],      // minor 7th
  "7": [0, 4, 7, 10],       // dominant 7th
  "m7(♭5)": [0, 3, 6, 10], // half-diminished
};

// === Palette Entry (共通型) ===
export interface PaletteChord {
  displayName: string;   // "C", "CM7", "A7", "Fm", "C/E"
  label: string;         // "I", "V7/ii", "IVm"
  function: ChordFunction;
  rootNote: number;
  intervals: number[];
  degreeIndex?: number;  // ダイアトニックコードの場合のみ
  isDiatonic: boolean;
  bassNoteOverride?: number; // オンコード（分数コード）用
}

// === Diatonic Chord ===
export interface DiatonicChord {
  degree: string;
  name: string;
  name7th: string;
  function: ChordFunction;
  degreeIndex: number;
  rootNote: number;
  is7th?: boolean;
}

/**
 * 選択されたキーのダイアトニックコード7つを返す
 */
export function getDiatonicChords(key: Key): DiatonicChord[] {
  const keyIndex = KEYS.indexOf(key);
  return SCALE_INTERVALS.map((interval, i) => {
    const noteIndex = (keyIndex + interval) % 12;
    const noteName = KEYS[noteIndex];
    return {
      degree: DEGREE_LABELS[i],
      name: noteName + CHORD_TYPES[i],
      name7th: noteName + CHORD_TYPES_7TH[i],
      function: FUNCTIONS[i],
      degreeIndex: i,
      rootNote: 60 + keyIndex + interval,
    };
  });
}

/**
 * DiatonicChord → PaletteChord 変換
 */
export function diatonicToPalette(
  chord: DiatonicChord,
  type: "triad" | "7th" | "sus2" | "sus4" | "9" | "11" | "13" | "b9" | "#9" | "#11" | "b13"
): PaletteChord {
  const noteName = KEYS[chord.rootNote % 12];
  let displayName = chord.name;
  let intervals = [0, 4, 7];

  const type7th = CHORD_TYPES_7TH[chord.degreeIndex];
  const intervals7th = SEVENTH_CHORD_INTERVALS[type7th] || [0, 4, 7, 10];

  switch (type) {
    case "7th":
      displayName = chord.name7th;
      intervals = intervals7th;
      break;
    case "9":
      displayName = chord.name7th + "(9)";
      intervals = [...intervals7th, 14];
      break;
    case "11":
      displayName = chord.name7th + "(11)";
      intervals = [...intervals7th, 17];
      break;
    case "13":
      displayName = chord.name7th + "(13)";
      intervals = [...intervals7th, 21];
      break;
    case "b9":
      displayName = chord.name7th + "(♭9)";
      intervals = [...intervals7th, 13];
      break;
    case "#9":
      displayName = chord.name7th + "(♯9)";
      intervals = [...intervals7th, 15];
      break;
    case "#11":
      displayName = chord.name7th + "(♯11)";
      intervals = [...intervals7th, 18];
      break;
    case "b13":
      displayName = chord.name7th + "(♭13)";
      intervals = [...intervals7th, 20];
      break;
    case "sus2":
      displayName = noteName + "sus2";
      intervals = TRIAD_INTERVALS.sus2;
      break;
    case "sus4":
      displayName = noteName + "sus4";
      intervals = TRIAD_INTERVALS.sus4;
      break;
    default:
      // Triad
      displayName = chord.name;
      const t = CHORD_TYPES[chord.degreeIndex];
      intervals = TRIAD_INTERVALS[t] || [0, 4, 7];
      break;
  }

  return {
    displayName,
    label:
      type === "sus2"
        ? chord.degree + "sus2"
        : type === "sus4"
        ? chord.degree + "sus4"
        : type === "9"
        ? chord.degree + "(9)"
        : type === "11"
        ? chord.degree + "(11)"
        : type === "13"
        ? chord.degree + "(13)"
        : type === "b9"
        ? chord.degree + "(♭9)"
        : type === "#9"
        ? chord.degree + "(♯9)"
        : type === "#11"
        ? chord.degree + "(♯11)"
        : type === "b13"
        ? chord.degree + "(♭13)"
        : chord.degree,
    function: chord.function,
    rootNote: chord.rootNote,
    intervals,
    degreeIndex: chord.degreeIndex,
    isDiatonic: true,
  };
}

// === Non-Diatonic Chord ===
export type NonDiatonicCategory = "secdom" | "subdm" | "tritone" | "dim" | "aug";

export interface NonDiatonicChord {
  name: string;
  label: string;
  category: NonDiatonicCategory;
  categoryLabel: string;
  rootNote: number;
  intervals: number[];
  function: ChordFunction;
}

export const CATEGORY_LABELS: Record<NonDiatonicCategory, string> = {
  secdom: "Secondary Dominant",
  subdm: "Modal Interchange",
  tritone: "Tritone Sub",
  dim: "Diminished",
  aug: "Augmented",
};

/**
 * 選択されたキーのノンダイアトニックコードを返す
 */
export function getNonDiatonicChords(key: Key): NonDiatonicChord[] {
  const keyIndex = KEYS.indexOf(key);
  const chords: NonDiatonicChord[] = [];

  // === Secondary Dominants (V7/x) ===
  // 各ダイアトニックコード（ii～vi）に対するセカンダリードミナント
  const secDomTargets = [
    { targetDegree: 1, label: "V7/ii" },   // V7 of ii
    { targetDegree: 2, label: "V7/iii" },  // V7 of iii
    { targetDegree: 3, label: "V7/IV" },   // V7 of IV
    { targetDegree: 4, label: "V7/V" },    // V7 of V
    { targetDegree: 5, label: "V7/vi" },   // V7 of vi
  ];

  for (const { targetDegree, label } of secDomTargets) {
    const targetSemitone = SCALE_INTERVALS[targetDegree];
    // V of target = 7 semitones above target
    const rootInterval = (targetSemitone + 7) % 12;
    const rootIndex = (keyIndex + rootInterval) % 12;
    const rootName = KEYS[rootIndex];
    chords.push({
      name: rootName + "7",
      label,
      category: "secdom",
      categoryLabel: CATEGORY_LABELS.secdom,
      rootNote: 60 + keyIndex + rootInterval,
      intervals: [0, 4, 7, 10], // dominant 7th
      function: "D",
    });
  }

  // === Modal Interchange (同主調借用など) ===
  const subdmDefs = [
    { offset: 5, suffix: "m", intervals: [0, 3, 7], label: "IVm" },
    { offset: 7, suffix: "m", intervals: [0, 3, 7], label: "vm" },
    { offset: 7, suffix: "m7", intervals: [0, 3, 7, 10], label: "vm7" },
    { offset: 10, suffix: "", intervals: [0, 4, 7], label: "♭VII" },
    { offset: 8, suffix: "", intervals: [0, 4, 7], label: "♭VI" },
    { offset: 3, suffix: "", intervals: [0, 4, 7], label: "♭III" },
  ];

  for (const { offset, suffix, intervals, label } of subdmDefs) {
    const rootInterval = offset % 12;
    const rootIndex = (keyIndex + rootInterval) % 12;
    const rootName = KEYS[rootIndex];
    chords.push({
      name: rootName + suffix,
      label,
      category: "subdm",
      categoryLabel: CATEGORY_LABELS.subdm,
      rootNote: 60 + keyIndex + rootInterval,
      intervals,
      function: "SD",
    });
  }

  // === Tritone Substitution (裏コード) ===
  // ♭II7: V7の裏コード（ルートがV7の半音上 = ♭II）
  const tritoneOffset = 1; // ♭II = half step above root
  const rootInterval = tritoneOffset % 12;
  const tritoneRootIndex = (keyIndex + rootInterval) % 12;
  const tritoneRootName = KEYS[tritoneRootIndex];
  chords.push({
    name: tritoneRootName + "7",
    label: "♭II7",
    category: "tritone",
    categoryLabel: CATEGORY_LABELS.tritone,
    rootNote: 60 + keyIndex + rootInterval,
    intervals: [0, 4, 7, 10],
    function: "D",
  });

  // === Diminished (Passing Diminished) ===
  const dimDefs = [
    { offset: 1, label: "#Idim7" },
    { offset: 3, label: "#IIdim7" },
    { offset: 6, label: "#IVdim7" },
    { offset: 8, label: "#Vdim7" },
  ];

  for (const { offset, label } of dimDefs) {
    const rootInterval = offset % 12;
    const rootIndex = (keyIndex + rootInterval) % 12;
    const rootName = KEYS[rootIndex];
    chords.push({
      name: rootName + "dim7",
      label,
      category: "dim",
      categoryLabel: CATEGORY_LABELS.dim,
      rootNote: 60 + keyIndex + rootInterval,
      intervals: [0, 3, 6, 9],
      function: "D",
    });
  }

  // === Augmented ===
  const augDefs = [
    { offset: 0, label: "Iaug" },
    { offset: 7, label: "Vaug" },
  ];

  for (const { offset, label } of augDefs) {
    const rootInterval = offset % 12;
    const rootIndex = (keyIndex + rootInterval) % 12;
    const rootName = KEYS[rootIndex];
    chords.push({
      name: rootName + "aug",
      label,
      category: "aug",
      categoryLabel: CATEGORY_LABELS.aug,
      rootNote: 60 + keyIndex + rootInterval,
      intervals: [0, 4, 8],
      function: "D",
    });
  }

  return chords;
}

/**
 * NonDiatonicChord → PaletteChord 変換
 */
export function nonDiatonicToPalette(chord: NonDiatonicChord): PaletteChord {
  return {
    displayName: chord.name,
    label: chord.label,
    function: chord.function,
    rootNote: chord.rootNote,
    intervals: chord.intervals,
    isDiatonic: false,
  };
}

/**
 * 最後のコードのFunctionに基づいて推奨される次のDegreeIndexリストを返す
 */
export function getRecommendedIndices(
  lastChord: PaletteChord | null
): number[] {
  if (!lastChord) return [0, 1, 2, 3, 4, 5, 6];

  const { function: fn, degreeIndex } = lastChord;

  // ダイアトニックコードの場合、特定のDegreeルールを使用
  if (lastChord.isDiatonic && degreeIndex !== undefined) {
    if (degreeIndex === 4) return [0, 2, 5]; // V → I, iii, vi
    if (degreeIndex === 3) return [0, 2, 4, 5]; // IV → I, iii, V, vi
    if (degreeIndex === 1) return [0, 2, 4, 5]; // ii → I, iii, V, vi
  }

  // 汎用ルール（Functionに基づく）
  switch (fn) {
    case "T":
      return [0, 1, 2, 3, 4, 5, 6];
    case "SD":
      return [0, 2, 4, 5, 6]; // D + T
    case "D":
      return [0, 2, 5]; // T
    default:
      return [0, 1, 2, 3, 4, 5, 6];
  }
}
