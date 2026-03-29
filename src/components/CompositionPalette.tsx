import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PaletteChord } from "../utils/musicTheory";

interface CompositionPaletteProps {
  palette: PaletteChord[];
  bpm: number;
  onBpmChange: (bpm: number) => void;
  drumPattern: "none" | "4beat" | "8beat" | "16beat";
  onDrumPatternChange: (pattern: "none" | "4beat" | "8beat" | "16beat") => void;
  isPlaying: boolean;
  onUndo: () => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  onPlayAll: () => void;
  onStop: () => void;
  isLooping: boolean;
  onToggleLoop: () => void;
  history: PaletteChord[][];
  onSaveToHistory: () => void;
  onLoadFromHistory: (index: number) => void;
  onRemoveFromHistory: (index: number) => void;
  editingIndex: number | null;
  onEditingIndexChange: (index: number) => void;
}

const FUNCTION_CLASSES: Record<string, string> = {
  T: "pill-tonic",
  SD: "pill-subdominant",
  D: "pill-dominant",
};

export default function CompositionPalette({
  palette,
  bpm,
  onBpmChange,
  drumPattern,
  onDrumPatternChange,
  isPlaying,
  onUndo,
  onRemove,
  onClear,
  onPlayAll,
  onStop,
  isLooping,
  onToggleLoop,
  history,
  onSaveToHistory,
  onLoadFromHistory,
  onRemoveFromHistory,
  editingIndex,
  onEditingIndexChange,
}: CompositionPaletteProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpand = () => setIsExpanded(!isExpanded);

  return (
    <motion.section 
      className={`composition-palette ${isExpanded ? "expanded" : ""}`}
      initial={false}
      animate={{ 
        height: isExpanded ? "auto" : "120px",
        maxHeight: isExpanded ? "85vh" : "120px",
      }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
    >
      {/* ドロワーハンドル (スマホ向け) */}
      <div className="sheet-handle-wrapper" onClick={toggleExpand}>
        <div className="sheet-handle" />
      </div>

      <div className="sheet-content">
        {/* コンジット・ヘッダー: 常に表示 */}
        <div className="palette-header-compact">
          <div className="header-status">
            <h2 className="section-title mini">Palette</h2>
            <div className="header-main-actions">
              <button className="btn-header-action" onClick={(e) => { e.stopPropagation(); onUndo(); }} title="戻る">
                <span className="btn-icon">↩</span>
                <span className="btn-text">戻る</span>
              </button>
              <button className="btn-header-action" onClick={(e) => { e.stopPropagation(); onSaveToHistory(); }} disabled={palette.length === 0} title="保存">
                <span className="btn-icon">💾</span>
                <span className="btn-text">保存</span>
              </button>
              <button className="btn-header-action btn-clear-text" onClick={(e) => { e.stopPropagation(); onClear(); }} disabled={palette.length === 0} title="クリア">
                <span className="btn-icon">✕</span>
                <span className="btn-text">クリア</span>
              </button>
            </div>
          </div>
          <div className="header-actions">
            <button 
              className={`btn-toggle btn-loop ${isLooping ? "active" : ""}`} 
              onClick={(e) => {
                e.stopPropagation();
                onToggleLoop();
              }}
              title="ループ再生"
            >
              <span className="toggle-icon">🔁</span>
            </button>
            {!isPlaying ? (
              <button 
                className="btn-action btn-play mini" 
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayAll();
                }} 
                disabled={palette.length === 0}
              >
                <span className="btn-icon">▶</span>
              </button>
            ) : (
              <button className="btn-action btn-stop mini" onClick={onStop}>
                <span className="btn-icon">■</span>
              </button>
            )}
            <button className={`btn-toggle ${isExpanded ? "active" : ""}`} onClick={toggleExpand}>
              <span className="toggle-icon">{isExpanded ? "↓" : "↑"}</span>
            </button>
          </div>
        </div>

        {/* 展開時に表示される詳細セクション */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className="palette-expanded-content"
            >
              <div className="palette-main-row">
                <div className="palette-area expanded">
                  <div className="palette-chords">
                    {palette.length === 0 ? (
                      <div className="palette-empty-spot">
                        <p className="hint">コードを選択して追加</p>
                      </div>
                    ) : (
                      <div className="palette-main-row">
                        <div className="palette-chords">
                          {palette.map((chord, idx) => (
                            <div key={idx} className="palette-item-wrapper">
                              {idx > 0 && <span className="palette-arrow">→</span>}
                              <div 
                                className={`palette-pill ${FUNCTION_CLASSES[chord.function] || ""} ${!chord.isDiatonic ? "pill-nondiatonic" : ""} ${editingIndex === idx ? "editing" : ""}`}
                                onClick={() => onEditingIndexChange(idx)}
                              >
                                <span className="pill-degree">{chord.label}</span>
                                <span className="pill-name">{chord.displayName}</span>
                                <span 
                                  className="pill-remove" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRemove(idx);
                                  }}
                                  title="削除"
                                >
                                  ✕
                                </span>
                              </div>
                            </div>
                          ))}
                          {palette.length < 8 && (
                            <div className="palette-item-wrapper">
                              {palette.length > 0 && <span className="palette-arrow">→</span>}
                              <div className="palette-empty-spot">
                                <p className="hint">+</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="playback-controls">
                  <div className="playback-item">
                    <label className="playback-label">BPM</label>
                    <input
                      type="number"
                      min="40"
                      max="240"
                      value={bpm}
                      onChange={(e) => onBpmChange(Math.min(240, Math.max(40, Number(e.target.value))))}
                      className="bpm-number-input"
                    />
                  </div>
                  <div className="playback-item group-drum">
                    <label className="playback-label">Drum</label>
                    <select 
                      className="drum-select"
                      value={drumPattern}
                      onChange={(e) => onDrumPatternChange(e.target.value as any)}
                    >
                      <option value="none">None</option>
                      <option value="4beat">4 Beat</option>
                      <option value="8beat">8 Beat</option>
                      <option value="16beat">16 Beat</option>
                    </select>
                  </div>
                </div>
              </div>


              {/* 履歴セクション */}
              {history.length > 0 && (
                <div className="palette-history">
                  <div className="history-header">
                    <span className="history-icon">🕒</span>
                    <h3 className="history-title">History</h3>
                  </div>
                  <div className="history-list">
                    {history.map((item, idx) => (
                      <div key={idx} className="history-item-container">
                        <button
                          className="history-item"
                          onClick={() => onLoadFromHistory(idx)}
                        >
                          <span className="history-number">#{history.length - idx}</span>
                          <span className="history-summary">
                            {item.map((c) => c.displayName).join(" → ")}
                          </span>
                        </button>
                        <button 
                          className="btn-history-remove" 
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveFromHistory(idx);
                          }}
                          title="履歴から削除"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
