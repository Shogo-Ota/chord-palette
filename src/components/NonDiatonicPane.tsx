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

const FUNCTION_CLASSES: Record<string, string> = {
  D: "card-dominant",
  SD: "card-subdominant",
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
      <div className="pane-info-row">
        <div className="pane-info-main">
          <span className="pane-info-label">Non-Diatonic</span>
          <p className="section-desc">借用・セカンダリードミナント・裏コード</p>
        </div>
        <div className="function-legend">
          <span className="legend-item dominant">D: DOMINANT</span>
          <span className="legend-item subdominant">SD: SUB-DOM</span>
        </div>
      </div>
      
      <div className="ndc-categories">
        {grouped.map(({ category, label, icon, chords: catChords }) => (
          <div key={category} className="ndc-category">
            <div className="ndc-category-header">
              <span className="ndc-category-icon">{icon}</span>
              <span className="ndc-category-label">{label}</span>
            </div>
            {/* Grid for cards */}
            <div className="ndc-card-grid">
              {catChords.map((chord, idx) => {
                const fnClass = FUNCTION_CLASSES[chord.function] || "";
                return (
                  <div key={idx} className={`chord-card ndc-card ${fnClass}`}>
                    <span className="chord-degree">{chord.label}</span>
                    <button
                      className="chord-name-btn"
                      onClick={() => onChordClick(nonDiatonicToPalette(chord, "triad"))}
                      title={`${chord.name} を追加`}
                    >
                      {chord.name}
                    </button>
                    {chord.name7th && (
                      <button
                        className="chord-7th-btn"
                        onClick={() => onChordClick(nonDiatonicToPalette(chord, "7th"))}
                        title={`${chord.name7th} を追加`}
                      >
                        {chord.name7th}
                      </button>
                    )}
                    <span className="chord-function">
                      {chord.function === "D" ? "D" : "SD"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
