import { useState, useEffect } from "react";
import type { PaletteChord } from "../utils/musicTheory";

interface CompositionPaletteProps {
  palette: PaletteChord[];
  bpm: number;
  onBpmChange: (bpm: number) => void;
  drumPattern: "none" | "4beat" | "8beat" | "16beat";
  onDrumPatternChange: (pattern: "none" | "4beat" | "8beat" | "16beat") => void;
  isPlaying: boolean;
  onRemove: (index: number) => void;
  onPlayAll: () => void;
  onStop: () => void;
  isLooping: boolean;
  onToggleLoop: () => void;
  history: PaletteChord[][];
  onLoadFromHistory: (index: number) => void;
  onRemoveFromHistory: (index: number) => void;
  editingIndex: number | null;
  onEditingIndexChange: (index: number | null) => void;
  currentPlayingIndex: number | null;
  chordDurationMode: "1" | "1/2" | "1/4";
  onToggleDurationMode: () => void;
  onCopyProgression?: () => void;
  emptyHint?: string;
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
  onPlayAll,
  onStop,
  isLooping,
  onToggleLoop,
  history,
  onLoadFromHistory,
  onRemoveFromHistory,
  editingIndex,
  onEditingIndexChange,
  currentPlayingIndex,
  chordDurationMode,
  onToggleDurationMode,
  onCopyProgression,
  emptyHint = "下のコードから選んで追加",
}: CompositionPaletteProps) {
  const [localBpm, setLocalBpm] = useState<string>(bpm.toString());

  useEffect(() => {
    setLocalBpm(bpm.toString());
  }, [bpm]);

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || /^\d+$/.test(val)) {
      setLocalBpm(val);
    }
  };

  const handleBpmBlur = () => {
    let num = parseInt(localBpm, 10);
    if (isNaN(num)) num = 100;
    const clamped = Math.min(200, Math.max(10, num));
    setLocalBpm(clamped.toString());
    onBpmChange(clamped);
  };

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
      <div className="playback-bar">
        <div className="playback-bar-row playback-bar-settings">
          <button
            className={`btn-half-beat ${chordDurationMode !== "1" ? "active" : ""}`}
            onClick={onToggleDurationMode}
            title="コードの長さを切り替え (1 → 1/2 → 1/4)"
            aria-label="コードの長さ"
          >
            {chordDurationMode}
          </button>
          <div className="playback-item">
            <label className="playback-label" htmlFor="bpm-input">BPM</label>
            <input
              id="bpm-input"
              type="text"
              inputMode="numeric"
              placeholder="BPM"
              value={localBpm}
              onChange={handleBpmChange}
              onBlur={handleBpmBlur}
              className="bpm-number-input"
            />
          </div>
          <div className="playback-item">
            <label className="playback-label" htmlFor="drum-select">Drum</label>
            <select
              id="drum-select"
              className="drum-select"
              value={drumPattern}
              onChange={(e) => onDrumPatternChange(e.target.value as "none" | "4beat" | "8beat" | "16beat")}
            >
              <option value="none">なし</option>
              <option value="4beat">4</option>
              <option value="8beat">8</option>
              <option value="16beat">16</option>
            </select>
          </div>
        </div>
        <div className="playback-bar-row playback-bar-transport">
          {onCopyProgression && palette.length > 0 && (
            <button className="btn-playback btn-copy" onClick={onCopyProgression} title="進行をコピー" aria-label="進行をコピー">
              📋
            </button>
          )}
          <button
            className={`btn-playback btn-loop ${isLooping ? "active" : ""}`}
            onClick={onToggleLoop}
            title="ループ再生"
            aria-label="ループ再生"
          >
            🔁
          </button>
          {!isPlaying ? (
            <button
              className="btn-playback btn-play"
              onClick={onPlayAll}
              disabled={palette.length === 0}
              aria-label="再生"
            >
              ▶
            </button>
          ) : (
            <button className="btn-playback btn-stop" onClick={onStop} aria-label="停止">
              ■
            </button>
          )}
        </div>
      </div>

      <div className="palette-canvas">
        {palette.length === 0 ? (
          <div className="palette-empty-canvas">
            <p className="hint">{emptyHint}</p>
            <span className="empty-hint-arrow" aria-hidden="true">↓</span>
          </div>
        ) : (
          <div className="palette-chords center">
            {(() => {
              const segments: { key: string; chords: { chord: PaletteChord; originalIndex: number }[] }[] = [];
              palette.forEach((chord, idx) => {
                const currentKey = chord.key || "C";
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
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="palette-history">
          <div className="history-header">
            <span className="history-icon">🕒</span>
            <h3 className="history-title">履歴</h3>
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
                    {item.slice(0, 3).map((c) => c.displayName).join(" → ")}
                    {item.length > 3 ? " …" : ""}
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
