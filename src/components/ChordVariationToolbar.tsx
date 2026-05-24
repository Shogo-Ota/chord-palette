import type { DiatonicChord, DiatonicChordType } from "../utils/musicTheory";
import {
  getAllowedTensions,
  isTensionAllowed,
  VARIATION_TYPES,
  TENSION_TYPES,
  ALTER_TYPES,
} from "../utils/musicTheory";

interface ChordVariationToolbarProps {
  selectedChord: DiatonicChord | null;
  onVariationClick: (type: DiatonicChordType) => void;
}

const ALTER_DISPLAY: Record<string, string> = {
  b9: "♭9",
  "#9": "♯9",
  "#11": "♯11",
  b13: "♭13",
};

export default function ChordVariationToolbar({
  selectedChord,
  onVariationClick,
}: ChordVariationToolbarProps) {
  const allowed = selectedChord ? getAllowedTensions(selectedChord.degreeIndex) : [];
  const disabled = !selectedChord;

  return (
    <div className={`chord-variation-toolbar ${disabled ? "disabled" : ""}`}>
      <div className="variation-toolbar-header">
        {selectedChord ? (
          <span className="variation-target">
            {selectedChord.degree} → {selectedChord.name7th}
          </span>
        ) : (
          <span className="variation-hint">度数を選んでバリエーションを適用</span>
        )}
      </div>

      <div className="chord-var-group">
        {VARIATION_TYPES.map((type) => (
          <button
            key={type}
            className="chord-var-btn"
            disabled={disabled}
            onClick={() => selectedChord && onVariationClick(type)}
            title={type}
          >
            {type === "sus2" ? "sus2" : type === "sus4" ? "sus4" : "6"}
          </button>
        ))}
      </div>

      <div className="chord-tension-group">
        {TENSION_TYPES.map((t) => (
          <button
            key={t}
            className="chord-tension-btn"
            disabled={disabled || !selectedChord || !isTensionAllowed(selectedChord.degreeIndex, t)}
            onClick={() => selectedChord && onVariationClick(t as DiatonicChordType)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="chord-alter-group">
        {ALTER_TYPES.map((t) => (
          <button
            key={t}
            className="chord-alter-btn"
            disabled={disabled || !allowed.includes(t)}
            onClick={() => selectedChord && onVariationClick(t as DiatonicChordType)}
          >
            {ALTER_DISPLAY[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
