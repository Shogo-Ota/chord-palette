import type { PaletteChord } from "../utils/musicTheory";

interface CompositionPaletteProps {
  palette: PaletteChord[];
  bpm: number;
  onBpmChange: (bpm: number) => void;
  drumPattern: "none" | "4beat" | "8beat" | "16beat";
  onDrumPatternChange: (pattern: "none" | "4beat" | "8beat" | "16beat") => void;
  isPlaying: boolean;
  onRemove: (index: number) => void;
  onUndo: () => void;
  onClear: () => void;
  onPlayAll: () => void;
  onStop: () => void;
  history: PaletteChord[][];
  onSaveToHistory: () => void;
  onLoadFromHistory: (index: number) => void;
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
  onRemove,
  onUndo,
  onClear,
  onPlayAll,
  onStop,
  history,
  onSaveToHistory,
  onLoadFromHistory,
}: CompositionPaletteProps) {
  return (
    <section className="composition-palette">
      <div className="section-header">
        <div className="palette-header-left">
          <h2 className="section-title">Composition Palette</h2>
          <div className="playback-controls">
            <div className="bpm-control">
              <label className="bpm-label">BPM: <span className="bpm-value">{bpm}</span></label>
              <input
                type="range"
                min="40"
                max="240"
                value={bpm}
                onChange={(e) => onBpmChange(Number(e.target.value))}
                className="bpm-slider"
              />
            </div>
            <div className="drum-control">
              <label className="drum-label">Drum:</label>
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
          <p className="section-desc">
            {palette.length === 0
              ? "上のコードをクリックして進行を組み立てましょう"
              : `${palette.length} コード`}
          </p>
        </div>
        <div className="palette-actions">
          {!isPlaying ? (
            <button className="btn-action btn-play" onClick={onPlayAll} disabled={palette.length === 0}>
              <span className="btn-icon">▶</span>
              再生
            </button>
          ) : (
            <button className="btn-action btn-stop" onClick={onStop}>
              <span className="btn-icon">■</span>
              停止
            </button>
          )}
          <button className="btn-action btn-save" onClick={onSaveToHistory} disabled={palette.length === 0}>
            <span className="btn-icon">💾</span>
            保存
          </button>
          <button className="btn-action btn-undo" onClick={onUndo}>
            <span className="btn-icon">↩</span>
            戻る
          </button>
          <button className="btn-action btn-clear" onClick={onClear} disabled={palette.length === 0}>
            <span className="btn-icon">✕</span>
            クリア
          </button>
        </div>
      </div>

      <div className="palette-area">
        {palette.length === 0 ? (
          <div className="palette-empty">
            <div className="empty-icon">🎵</div>
            <p>コードをクリックして進行を作成</p>
          </div>
        ) : (
          <div className="palette-chords">
            {palette.map((chord, index) => (
              <div key={index} className="palette-item-wrapper">
                {index > 0 && <span className="palette-arrow">→</span>}
                <button
                  className={`palette-pill ${FUNCTION_CLASSES[chord.function]} ${!chord.isDiatonic ? "pill-nondiatonic" : ""}`}
                  onClick={() => onRemove(index)}
                  title="クリックで削除"
                >
                  <span className="pill-degree">{chord.label}</span>
                  <span className="pill-name">{chord.displayName}</span>
                  <span className="pill-remove">✕</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 履歴セクション */}
      {history.length > 0 && (
        <div className="palette-history">
          <div className="history-header">
            <span className="history-icon">🕒</span>
            <h3 className="history-title">History (Latest 5)</h3>
          </div>
          <div className="history-list">
            {history.map((item, idx) => (
              <button
                key={idx}
                className="history-item"
                onClick={() => onLoadFromHistory(idx)}
                title="この進行を復元"
              >
                <span className="history-number">#{history.length - idx}</span>
                <span className="history-summary">
                  {item.map((c) => c.displayName).join(" → ")}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
