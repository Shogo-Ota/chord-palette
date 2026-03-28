import type { NonDiatonicChord, NonDiatonicCategory, PaletteChord } from "../utils/musicTheory";
import { nonDiatonicToPalette, CATEGORY_LABELS } from "../utils/musicTheory";

interface NonDiatonicPaneProps {
  chords: NonDiatonicChord[];
  onChordClick: (chord: PaletteChord) => void;
}

const CATEGORY_ORDER: NonDiatonicCategory[] = ["secdom", "subdm", "tritone", "dim", "aug"];

const CATEGORY_ICONS: Record<NonDiatonicCategory, string> = {
  secdom: "⚡",
  subdm: "🌙",
  tritone: "🔄",
  dim: "🌫️",
  aug: "✨",
};

const FUNCTION_TAG_CLASS: Record<string, string> = {
  D: "ndc-tag-dominant",
  SD: "ndc-tag-subdominant",
};

export default function NonDiatonicPane({ chords, onChordClick }: NonDiatonicPaneProps) {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    icon: CATEGORY_ICONS[cat],
    chords: chords.filter((c) => c.category === cat),
  })).filter((g) => g.chords.length > 0);

  return (
    <section className="ndc-pane">
      <div className="section-header">
        <h2 className="section-title">Non-Diatonic Chords</h2>
        <p className="section-desc">借用コード・セカンダリードミナント・裏コード</p>
      </div>
      <div className="ndc-categories">
        {grouped.map(({ category, label, icon, chords: catChords }) => (
          <div key={category} className="ndc-category">
            <div className="ndc-category-header">
              <span className="ndc-category-icon">{icon}</span>
              <span className="ndc-category-label">{label}</span>
            </div>
            <div className="ndc-chord-row">
              {catChords.map((chord, idx) => (
                <button
                  key={idx}
                  className={`ndc-chord-btn ndc-${category}`}
                  onClick={() => onChordClick(nonDiatonicToPalette(chord))}
                  title={`${chord.label}: ${chord.name}`}
                >
                  <span className="ndc-chord-label">{chord.label}</span>
                  <span className="ndc-chord-name">{chord.name}</span>
                  <span className={`ndc-chord-tag ${FUNCTION_TAG_CLASS[chord.function] || ""}`}>
                    {chord.function === "D" ? "Dom" : "SD"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
