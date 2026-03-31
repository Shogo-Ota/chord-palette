import { useState, useEffect } from "react";
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
  onEditingIndexChange: (index: number | null) => void;
  currentPlayingIndex: number | null;
  chordDurationMode: "1" | "1/2" | "1/4";
  onToggleDurationMode: () => void;
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
  currentPlayingIndex,
  chordDurationMode,
  onToggleDurationMode,
}: CompositionPaletteProps) {
  // モバイル入力改善のためのローカルステート
  const [localBpm, setLocalBpm] = useState<string>(bpm.toString());

  // 外部からのBPM変更（履歴ロード等）に同期
  useEffect(() => {
    setLocalBpm(bpm.toString());
  }, [bpm]);

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // 数字のみ許可（空文字も許可してタイピングしやすくする）
    if (val === "" || /^\d+$/.test(val)) {
      setLocalBpm(val);
    }
  };

  const handleBpmBlur = () => {
    let num = parseInt(localBpm, 10);
    if (isNaN(num)) num = 100;
    
    // ユーザー指定の範囲 10-200 でクランプ
    const clamped = Math.min(200, Math.max(10, num));
    setLocalBpm(clamped.toString());
    onBpmChange(clamped);
  };

  // 再生中のオートスクロール
  useEffect(() => {
    if (currentPlayingIndex !== null) {
      const activePill = document.querySelector(".palette-pill.playing");
      if (activePill) {
        activePill.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [currentPlayingIndex]);

  return (
    <div className="workspace-palette">
      <div className="palette-header-title">
        <h2 className="section-title mini">PALETTE</h2>
      </div>
      {/* アクションバー */}
      <div className="palette-action-bar">
        <div className="palette-actions-left">
          <button className="btn-header-action" onClick={onUndo} title="戻る">
            <span className="btn-icon">↩</span>
            <span className="btn-text">戻る</span>
          </button>
          <button className="btn-header-action" onClick={onSaveToHistory} disabled={palette.length === 0} title="保存">
            <span className="btn-icon">💾</span>
            <span className="btn-text">保存</span>
          </button>
          <button className="btn-header-action btn-clear-text" onClick={onClear} disabled={palette.length === 0} title="クリア">
            <span className="btn-icon">✕</span>
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
              type="text"
              inputMode="numeric"
              value={localBpm}
              onChange={handleBpmChange}
              onBlur={handleBpmBlur}
              className="bpm-number-input mini"
            />
          </div>
          <div className="playback-item mini group-drum">
            <label className="playback-label mini">Drum</label>
            <select 
              className="drum-select mini"
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

        <div className="palette-actions-right">
          <button 
            className={`btn-toggle btn-loop ${isLooping ? "active" : ""}`} 
            onClick={onToggleLoop}
            title="ループ再生"
          >
            <span className="toggle-icon">🔁</span>
          </button>
          {!isPlaying ? (
            <button 
              className="btn-action btn-play mini" 
              onClick={onPlayAll} 
              disabled={palette.length === 0}
            >
              <span className="btn-icon">▶</span>
            </button>
          ) : (
            <button className="btn-action btn-stop mini" onClick={onStop}>
              <span className="btn-icon">■</span>
            </button>
          )}
        </div>
      </div>

      {/* コード進行表示エリア */}
      <div className="palette-canvas">
        {palette.length === 0 ? (
          <div className="palette-empty-canvas">
            <p className="hint">コードを選択して追加</p>
          </div>
        ) : (
          <div className="palette-chords center">
            {/* キーごとにグループ化して表示 */}
            {(() => {
              const segments: { key: string; chords: { chord: PaletteChord; originalIndex: number }[] }[] = [];
              palette.forEach((chord, idx) => {
                const currentKey = chord.key || "C"; // フォールバック
                if (segments.length === 0 || segments[segments.length - 1].key !== currentKey) {
                  segments.push({ key: currentKey, chords: [] });
                }
                segments[segments.length - 1].chords.push({ chord, originalIndex: idx });
              });

              return segments.map((segment, sIdx) => (
                <div key={sIdx} className="palette-key-segment">
                  <div className="segment-key-label">Key: {segment.key}</div>
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
              ));
            })()}
            {palette.length > 0 && palette.length < 8 && (
              <div className="palette-item-wrapper">
                <span className="palette-arrow">→</span>
                <div className="palette-empty-spot mini">
                  <p className="hint">+</p>
                </div>
              </div>
            )}
          </div>
        )}
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
    </div>
  );
}
