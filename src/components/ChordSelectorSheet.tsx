import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import TheoryPane from "./TheoryPane";
import NonDiatonicPane from "./NonDiatonicPane";
import OnChordPane from "./OnChordPane";
import type { DiatonicChord, NonDiatonicChord, PaletteChord, Key, DiatonicChordType } from "../utils/musicTheory";
import { getMaxInversion } from "../utils/musicTheory";

interface ChordSelectorSheetProps {
  activeTab: "diatonic" | "non-diatonic" | "on-chord";
  onTabChange: (tab: "diatonic" | "non-diatonic" | "on-chord") => void;
  diatonicChords: DiatonicChord[];
  nonDiatonicChords: NonDiatonicChord[];
  recommendedIndices: number[];
  lastChord: PaletteChord | null;
  onDiatonicClick: (chord: DiatonicChord, type: DiatonicChordType, key: Key) => void;
  onNonDiatonicClick: (chord: PaletteChord) => void;
  onBassSelect: (bassNote: number, noteName: string) => void;
  selectedKey: Key;
  /** Sprint 10: 編集中のコード（Inversion トグル表示用）。null のときは非表示 */
  editingChord?: PaletteChord | null;
  /** Sprint 10: 編集中インデックス */
  editingIndex?: number | null;
  /** Sprint 10: Inversion 変更ハンドラ */
  onInversionChange?: (index: number, inversion: 0 | 1 | 2 | 3) => void;
}

const INVERSION_LABELS: { value: 0 | 1 | 2 | 3; label: string }[] = [
  { value: 0, label: "Root" },
  { value: 1, label: "1st" },
  { value: 2, label: "2nd" },
  { value: 3, label: "3rd" },
];

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
  editingChord,
  editingIndex,
  onInversionChange,
}: ChordSelectorSheetProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Sprint 10: Inversion トグル表示条件
  const showInversionToggle =
    editingChord != null &&
    editingIndex != null &&
    editingIndex >= 0 &&
    onInversionChange != null;

  const isOnChord =
    showInversionToggle &&
    editingChord!.bassNoteOverride !== undefined &&
    editingChord!.bassNoteOverride !== null;

  const maxInversion = showInversionToggle ? getMaxInversion(editingChord!) : 0;
  const currentInversion = (editingChord?.inversion ?? 0) as 0 | 1 | 2 | 3;

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
        <h2 className="section-title mini">コード</h2>

        <div className="selector-tab-pills">
          <button
            className={`selector-tab-pill ${activeTab === "diatonic" ? "active" : ""}`}
            onClick={(e) => { e.stopPropagation(); onTabChange("diatonic"); if (!isExpanded) setIsExpanded(true); }}
          >
            ダイアトニック
          </button>
          <button
            className={`selector-tab-pill ${activeTab === "non-diatonic" ? "active" : ""}`}
            onClick={(e) => { e.stopPropagation(); onTabChange("non-diatonic"); if (!isExpanded) setIsExpanded(true); }}
          >
            応用
          </button>
          <button
            className={`selector-tab-pill ${activeTab === "on-chord" ? "active" : ""}`}
            onClick={(e) => { e.stopPropagation(); onTabChange("on-chord"); if (!isExpanded) setIsExpanded(true); }}
          >
            オンコード
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
            {/* Sprint 10: Inversion トグル（編集中のみ表示） */}
            {showInversionToggle && !isOnChord && (
              <div
                className="inversion-toggle"
                role="group"
                aria-label="転回形（Inversion）"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="inversion-toggle-label">転回</span>
                <div className="inversion-toggle-buttons">
                  {INVERSION_LABELS.map(({ value, label }) => {
                    const disabled = value > maxInversion;
                    const active = value === currentInversion;
                    return (
                      <button
                        key={value}
                        type="button"
                        className={`inversion-btn ${active ? "active" : ""} ${disabled ? "disabled" : ""}`}
                        disabled={disabled}
                        aria-pressed={active}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (disabled) return;
                          onInversionChange!(editingIndex!, value);
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showInversionToggle && isOnChord && (
              <div
                className="inversion-toggle on-chord-locked"
                role="group"
                aria-label="転回形（Inversion）— オンコード適用中のため無効"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="inversion-toggle-label">転回</span>
                <span
                  className="inversion-toggle-hint"
                  role="status"
                  aria-live="polite"
                >
                  オンコード適用中
                </span>
              </div>
            )}

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
