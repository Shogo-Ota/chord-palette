import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import TheoryPane from "./TheoryPane";
import NonDiatonicPane from "./NonDiatonicPane";
import OnChordPane from "./OnChordPane";
import type { DiatonicChord, NonDiatonicChord, PaletteChord, Key } from "../utils/musicTheory";

interface ChordSelectorSheetProps {
  activeTab: "diatonic" | "non-diatonic" | "on-chord";
  onTabChange: (tab: "diatonic" | "non-diatonic" | "on-chord") => void;
  diatonicChords: DiatonicChord[];
  nonDiatonicChords: NonDiatonicChord[];

  recommendedIndices: number[];
  lastChord: PaletteChord | null;
  onDiatonicClick: (chord: DiatonicChord, type: "triad" | "7th" | "6" | "sus2" | "sus4" | "9" | "11" | "13" | "b9" | "#9" | "#11" | "b13", key: Key) => void;
  onNonDiatonicClick: (chord: PaletteChord) => void;
  onBassSelect: (bassNote: number, noteName: string) => void;
  selectedKey: Key;
}

export default function ChordSelectorSheet({
  activeTab,
  onTabChange,
  diatonicChords,
  nonDiatonicChords,
  recommendedIndices,
  lastChord,
  onDiatonicClick,
  onNonDiatonicClick,
  onBassSelect,
  selectedKey,
}: ChordSelectorSheetProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.section
      className={`chord-selector-sheet ${isExpanded ? "expanded" : ""}`}
      initial={false}
      animate={{
        height: isExpanded ? "auto" : "88px",
        maxHeight: isExpanded ? "60vh" : "88px",
      }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
    >
      {/* ドロワーハンドル */}
      <div className="sheet-handle-wrapper" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="sheet-handle" />
      </div>

      {/* コンパクトヘッダー（折り畳み時に表示） */}
      <div className="selector-header-compact" onClick={() => setIsExpanded(!isExpanded)}>
        <h2 className="section-title mini">CHORDS</h2>

        <div className="selector-tab-pills">
          <button
            className={`selector-tab-pill ${activeTab === "diatonic" ? "active" : ""}`}
            onClick={(e) => { e.stopPropagation(); onTabChange("diatonic"); if (!isExpanded) setIsExpanded(true); }}
          >
            Diatonic
          </button>
          <button
            className={`selector-tab-pill ${activeTab === "non-diatonic" ? "active" : ""}`}
            onClick={(e) => { e.stopPropagation(); onTabChange("non-diatonic"); if (!isExpanded) setIsExpanded(true); }}
          >
            Non-Dia
          </button>
          <button
            className={`selector-tab-pill ${activeTab === "on-chord" ? "active" : ""}`}
            onClick={(e) => { e.stopPropagation(); onTabChange("on-chord"); if (!isExpanded) setIsExpanded(true); }}
          >
            On-Chord
          </button>
        </div>
        <button className={`btn-toggle ${isExpanded ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}>
          <span className="toggle-icon">{isExpanded ? "↓" : "↑"}</span>
        </button>
      </div>

      {/* 展開時のコード選択エリア */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="selector-expanded-content"
          >
            {activeTab === "diatonic" && (
              <TheoryPane
                chords={diatonicChords}
                recommendedIndices={recommendedIndices}
                onChordClick={onDiatonicClick}
                selectedKey={selectedKey}
              />
            )}
            {activeTab === "non-diatonic" && (
              <NonDiatonicPane
                chords={nonDiatonicChords}
                onChordClick={onNonDiatonicClick}
                selectedKey={selectedKey}
              />
            )}
            {activeTab === "on-chord" && (
              <OnChordPane
                targetChord={lastChord}
                onBassSelect={onBassSelect}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
