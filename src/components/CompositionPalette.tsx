import { useState, useRef, useEffect } from "react";
import type { PaletteChord, Key } from "../utils/musicTheory";

interface CompositionPaletteProps {
  palette: PaletteChord[];
  bpm: number;
  onBpmChange: (bpm: number) => void;
  drumPattern: "none" | "4beat" | "8beat" | "16beat";
  onDrumChange: (pattern: "none" | "4beat" | "8beat" | "16beat") => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  onPlay: () => void;
  onStop: () => void;
  isPlaying: boolean;
  onSave: () => void;
  history: PaletteChord[][];
  onLoadFromHistory: (index: number) => void;
  onRemoveFromHistory: (index: number) => void;
  editingIndex: number | null;
  onEditingIndexChange: (index: number | null) => void;
  currentPlayingIndex: number | null;
  chordDurationMode: "1" | "1/2" | "1/4";
  onToggleDurationMode: () => void;
}

const FUNCTION_CLASSES: Record<string, string> = {
  T: "card-tonic",
  SD: "card-subdominant",
  D: "card-dominant",
};

export default function CompositionPalette({
  palette,
  bpm,
  onBpmChange,
  drumPattern,
  onDrumChange,
  onRemove,
  onClear,
  onPlay,
  onStop,
  isPlaying,
  onSave,
  history,
  onLoadFromHistory,
  onRemoveFromHistory,
  editingIndex,
  onEditingIndexChange,
  currentPlayingIndex,
  chordDurationMode,
  onToggleDurationMode,
}: CompositionPaletteProps) {
  // モバイル入力改善のためのローカルステート
  const [localBpm, setLocalBpm] = useState<string>(bpm.toString());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalBpm(bpm.toString());
  }, [bpm]);

  // パレットが更新されたら末尾にスクロール
  useEffect(() => {
    if (scrollRef.current && !isPlaying) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [palette.length, isPlaying]);

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalBpm(e.target.value);
    const val = parseInt(e.target.value);
    if (!isNaN(val) && val >= 20 && val <= 300) {
      onBpmChange(val);
    }
  };

  // キーが変わったタイミングでセグメント化する（転調の視覚化）
  const segments = palette.reduce((acc, chord, index) => {
    if (acc.length === 0 || acc[acc.length - 1].key !== chord.key) {
      acc.push({ key: chord.key, chords: [] });
    }
    acc[acc.length - 1].chords.push({ chord, originalIndex: index });
    return acc;
  }, [] as { key: Key; chords: { chord: PaletteChord; originalIndex: number }[] }[]);

  return (
    <div className="composition-palette">
      <div className="palette-action-bar">
        {/* 左側: 保存・管理系 */}
        <div className="palette-actions-left">
          <button className="btn-header-action" onClick={() => window.history.back()} title="戻る">
            <span className="btn-icon">⬅️</span>
            <span className="btn-text">戻る</span>
          </button>
          <button className="btn-header-action" onClick={onSave} title="今の進行を保存">
            <span className="btn-icon">💾</span>
            <span className="btn-text">保存</span>
          </button>
          <button className="btn-header-action btn-danger" onClick={onClear} title="全削除">
            <span className="btn-icon">🗑️</span>
            <span className="btn-text">クリア</span>
          </button>
        </div>

        {/* 中央: 再生設定 (BPM / Drum / 1/2) */}
        <div className="palette-actions-center">
          <button 
            className={`btn-half-beat ${chordDurationMode !== "1" ? "active" : ""}`}
            onClick={onToggleDurationMode}
            title="コードの長さを切り替え (1 -> 1/2 -> 1/4)"
          >
            {chordDurationMode}
          </button>
          <div className="playback-item mini">
            <label className="playback-label mini">BPM</label>
            <input
              type="number"
              value={localBpm}
              onChange={handleBpmChange}
              className="bpm-number-input mini"
              min="20"
              max="300"
            />
          </div>
          <div className="playback-item mini">
            <label className="playback-label mini">DRUM</label>
            <select
              value={drumPattern}
              onChange={(e) => onDrumChange(e.target.value as any)}
              className="drum-select mini"
            >
              <option value="none">OFF</option>
              <option value="4beat">4 Beat</option>
              <option value="8beat">8 Beat</option>
              <option value="16beat">16 Beat</option>
            </select>
          </div>
        </div>

        {/* 右側: 再生コントロール */}
        <div className="palette-actions-right">
          {isPlaying ? (
            <button className="btn-playback-toggle stop pulse" onClick={onStop} title="停止">
              停止 ⏹
            </button>
          ) : (
            <button 
              className="btn-playback-toggle play" 
              onClick={onPlay} 
              disabled={palette.length === 0}
              title="最初から再生"
            >
              再生 ▶
            </button>
          )}
        </div>
      </div>

      <div className="palette-scroll-container" ref={scrollRef}>
        {palette.length === 0 ? (
          <div className="palette-empty-state">
            <span className="empty-icon">🎼</span>
            <p>コードを選択して進行を作成しましょう</p>
          </div>
        ) : (
          <div className="palette-display">
            {segments.map((segment, sIdx) => (
              <div key={sIdx} className="palette-key-segment">
                <div className="segment-key-label">{segment.key}</div>
                <div className="segment-chords">
                  {segment.chords.map(({ chord, originalIndex: idx }, cIdx) => {
                    const isHalf = chord.beats === 1;
                    const isQuarter = chord.beats === 0.5;
                    const isEditing = editingIndex === idx;
                    const isActive = currentPlayingIndex === idx;

                    return (
                      <div key={idx} className="palette-item-wrapper">
                        {cIdx > 0 && <span className="palette-arrow">→</span>}
                        <div 
                          className={`palette-pill ${isHalf ? "half-beat" : ""} ${isQuarter ? "quarter-beat" : ""} ${FUNCTION_CLASSES[chord.function] || ""} ${!chord.isDiatonic ? "pill-nondiatonic" : ""} ${isEditing ? "editing" : ""} ${isActive ? "playing" : ""}`}
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
                    );
                  })}
                </div>
                {sIdx < segments.length - 1 && <span className="palette-arrow segment-arrow">→</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="palette-history">
          <div className="history-header">
            <span className="history-icon">🕒</span>
            <h3 className="history-title">History</h3>
          </div>
          <div className="history-list">
            {history.map((prog, idx) => (
              <div key={idx} className="history-item">
                <div className="history-item-info" onClick={() => onLoadFromHistory(idx)}>
                  <span className="history-item-count">{prog.length} chords</span>
                  <div className="history-item-preview">
                    {prog.slice(0, 4).map(c => c.displayName).join(" → ")}
                    {prog.length > 4 && " ..."}
                  </div>
                </div>
                <button 
                  className="btn-history-remove" 
                  onClick={() => onRemoveFromHistory(idx)}
                  title="履歴から削除"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
