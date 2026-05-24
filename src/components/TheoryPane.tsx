import { useState } from "react";
import type { DiatonicChord, DiatonicChordType, Key } from "../utils/musicTheory";
import ChordVariationToolbar from "./ChordVariationToolbar";

interface TheoryPaneProps {
  chords: DiatonicChord[];
  recommendedIndices: number[];
  onChordClick: (chord: DiatonicChord, type: DiatonicChordType, key: Key) => void;
  selectedKey: Key;
}

const FUNCTION_CLASSES: Record<string, string> = {
  T: "card-tonic",
  SD: "card-subdominant",
  D: "card-dominant",
};

const FUNCTION_LABELS: Record<string, string> = {
  T: "T",
  SD: "SD",
  D: "D",
};

export default function TheoryPane({
  chords,
  recommendedIndices,
  onChordClick,
  selectedKey,
}: TheoryPaneProps) {
  const [selectedDegreeIndex, setSelectedDegreeIndex] = useState<number | null>(null);

  const selectedChord =
    selectedDegreeIndex !== null
      ? chords.find((c) => c.degreeIndex === selectedDegreeIndex) ?? null
      : null;

  const handleDegreeSelect = (chord: DiatonicChord) => {
    setSelectedDegreeIndex((prev) =>
      prev === chord.degreeIndex ? null : chord.degreeIndex
    );
  };

  const handleVariationClick = (type: DiatonicChordType) => {
    if (!selectedChord) return;
    onChordClick(selectedChord, type, selectedKey);
  };

  return (
    <section className="theory-pane">
      <div className="chord-grid">
        {chords.map((chord) => {
          const isRecommended = recommendedIndices.includes(chord.degreeIndex);
          const isSelected = selectedDegreeIndex === chord.degreeIndex;
          const fnClass = FUNCTION_CLASSES[chord.function] || "";

          return (
            <div
              key={chord.degreeIndex}
              className={`chord-card ${fnClass} ${isRecommended ? "recommended" : "dimmed"} ${isSelected ? "selected" : ""}`}
            >
              <button
                type="button"
                className="chord-degree-btn"
                onClick={() => handleDegreeSelect(chord)}
                title={`${chord.degree} を選択`}
                aria-pressed={isSelected}
              >
                {chord.degree}
              </button>
              <button
                className="chord-name-btn"
                onClick={() => onChordClick(chord, "triad", selectedKey)}
                title={`${chord.name} をパレットに追加`}
              >
                {chord.name}
              </button>
              <button
                className="chord-7th-btn"
                onClick={() => onChordClick(chord, "7th", selectedKey)}
                title={`${chord.name7th} をパレットに追加`}
              >
                {chord.name7th}
              </button>

              <span className={`chord-function fn-${chord.function.toLowerCase()}`}>
                {FUNCTION_LABELS[chord.function]}
              </span>
              {isRecommended && <span className="recommended-dot" />}
            </div>
          );
        })}
      </div>

      <ChordVariationToolbar
        selectedChord={selectedChord}
        onVariationClick={handleVariationClick}
      />
    </section>
  );
}
