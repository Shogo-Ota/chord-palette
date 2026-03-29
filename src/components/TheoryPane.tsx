import type { DiatonicChord } from "../utils/musicTheory";

interface TheoryPaneProps {
  chords: DiatonicChord[];
  recommendedIndices: number[];
  onChordClick: (chord: DiatonicChord, type: "triad" | "7th" | "sus2" | "sus4" | "9" | "11" | "13" | "b9" | "#9" | "#11" | "b13") => void;
}

const FUNCTION_CLASSES: Record<string, string> = {
  T: "card-tonic",
  SD: "card-subdominant",
  D: "card-dominant",
};

// カード内は短縮記名にする
const FUNCTION_LABELS: Record<string, string> = {
  T: "T",
  SD: "SD",
  D: "D",
};

const ALLOWED_TENSIONS: Record<number, string[]> = {
  0: ["9", "13"],
  1: ["9", "11"],
  2: ["11"],
  3: ["9", "#11", "13"],
  4: ["9", "13", "b9", "#9", "#11", "b13"],
  5: ["9", "11"],
  6: ["11", "b13"],
};


export default function TheoryPane({
  chords,
  recommendedIndices,
  onChordClick,
}: TheoryPaneProps) {
  return (
    <section className="theory-pane">
      <div className="pane-info-row">
        <div className="pane-info-main">
          <span className="pane-info-label">Diatonic Chords</span>
          <p className="section-desc">コードをクリックしてパレットに追加</p>
        </div>
        <div className="function-legend">
          <span className="legend-item tonic">T: TONIC</span>
          <span className="legend-item subdominant">SD: SUB-DOM</span>
          <span className="legend-item dominant">D: DOMINANT</span>
        </div>
      </div>
      <div className="chord-grid">
        {chords.map((chord) => {
          const isRecommended = recommendedIndices.includes(chord.degreeIndex);
          const fnClass = FUNCTION_CLASSES[chord.function] || "";
          return (
            <div
              key={chord.degreeIndex}
              className={`chord-card ${fnClass} ${isRecommended ? "recommended" : "dimmed"}`}
            >
              <span className="chord-degree">{chord.degree}</span>
              <button
                className="chord-name-btn"
                onClick={() => onChordClick(chord, "triad")}
                title={`${chord.name} をパレットに追加`}
              >
                {chord.name}
              </button>
              <button
                className="chord-7th-btn"
                onClick={() => onChordClick(chord, "7th")}
                title={`${chord.name7th} をパレットに追加`}
              >
                {chord.name7th}
              </button>
              <div className="chord-sus-group">
                <button
                  className="chord-sus-btn"
                  onClick={() => onChordClick(chord, "sus2")}
                  title={`${chord.name.replace(/m($|\(♭5\))/, "")}sus2 をパレットに追加`}
                >
                  sus2
                </button>
                <button
                  className="chord-sus-btn"
                  onClick={() => onChordClick(chord, "sus4")}
                  title={`${chord.name.replace(/m($|\(♭5\))/, "")}sus4 をパレットに追加`}
                >
                  sus4
                </button>
              </div>
              
              {["9", "11", "13"].some(t => ALLOWED_TENSIONS[chord.degreeIndex].includes(t)) && (
                <div className="chord-tension-group">
                  {["9", "11", "13"].map(t => (
                    ALLOWED_TENSIONS[chord.degreeIndex].includes(t) && (
                      <button
                        key={t}
                        className="chord-tension-btn"
                        onClick={() => onChordClick(chord, t as any)}
                        title={`${chord.name7th}(${t}) をパレットに追加`}
                      >
                        {t}
                      </button>
                    )
                  ))}
                </div>
              )}

              {["b9", "#9", "#11", "b13"].some(t => ALLOWED_TENSIONS[chord.degreeIndex].includes(t)) && (
                <div className="chord-alter-group">
                  {["b9", "#9", "#11", "b13"].map(t => (
                    ALLOWED_TENSIONS[chord.degreeIndex].includes(t) && (
                      <button
                        key={t}
                        className="chord-alter-btn"
                        onClick={() => onChordClick(chord, t as any)}
                        title={`${chord.name7th}(${t.replace("b", "♭").replace("#", "♯")}) をパレットに追加`}
                      >
                        {t.replace("b", "♭").replace("#", "♯")}
                      </button>
                    )
                  ))}
                </div>
              )}

              <span className={`chord-function fn-${chord.function.toLowerCase()}`}>
                {FUNCTION_LABELS[chord.function]}
              </span>
              {isRecommended && (
                <span className="recommended-dot" />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
