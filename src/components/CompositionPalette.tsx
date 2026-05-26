import { useState, useEffect } from "react";
import type { PaletteChord } from "../utils/musicTheory";
import { INSTRUMENT_IDS, INSTRUMENT_PRESETS, type InstrumentId } from "../utils/instrumentPresets";
import type { BeatPattern, DrumPattern } from "../utils/audioEngine";

interface CompositionPaletteProps {
  palette: PaletteChord[];
  bpm: number;
  onBpmChange: (bpm: number) => void;
  drumPattern: DrumPattern;
  onDrumPatternChange: (pattern: DrumPattern) => void;
  beatPattern: BeatPattern;
  onBeatPatternChange: (pattern: BeatPattern) => void;
  instrumentId: InstrumentId;
  onInstrumentIdChange: (id: InstrumentId) => void;
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
  onExportVideo?: () => void;
  isExportingVideo?: boolean;
  emptyHint?: string;
  heroTagline?: string;
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
  beatPattern,
  onBeatPatternChange,
  instrumentId,
  onInstrumentIdChange,
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
  onExportVideo,
  isExportingVideo = false,
  emptyHint = "下のコードから選んで追加",
  heroTagline,
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
        {/* Sprint 13 (designer): 2+3+3 構成
            行1 = 時間軸（分割 / BPM）、行2 = 音色軸（Drum / Beat / Tone）、行3 = トランスポート */}
        <div className="playback-bar-row playback-bar-settings playback-bar-settings-time">
          <div className="playback-item playback-item--length">
            <span className="playback-label" aria-hidden="true">LEN</span>
            <button
              className={`btn-half-beat ${chordDurationMode !== "1" ? "active" : ""}`}
              onClick={onToggleDurationMode}
              title="コードの長さを切り替え (1 → 1/2 → 1/4)"
              aria-label="コードの長さ"
            >
              {chordDurationMode}
            </button>
          </div>
          <div className="playback-item playback-item--bpm">
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
        </div>
        <div className="playback-bar-row playback-bar-settings playback-bar-settings-tone">
          <div className="playback-item">
            <label className="playback-label" htmlFor="drum-select">Drum</label>
            <select
              id="drum-select"
              className="drum-select"
              value={drumPattern}
              onChange={(e) => onDrumPatternChange(e.target.value as DrumPattern)}
            >
              <option value="none">---</option>
              <option value="rock">Rock</option>
              <option value="jazz">Jazz</option>
              <option value="funk">Funk</option>
              <option value="pop">Pop</option>
              <option value="soul">Soul</option>
            </select>
          </div>
          <div className="playback-item">
            <label className="playback-label" htmlFor="beat-select">Beat</label>
            <select
              id="beat-select"
              className="beat-select drum-select"
              value={beatPattern}
              onChange={(e) => onBeatPatternChange(e.target.value as BeatPattern)}
            >
              <option value="none">---</option>
              <option value="4beat">4 Beat</option>
              <option value="8beat">8 Beat</option>
              <option value="16beat">16 Beat</option>
            </select>
          </div>
          <div className="playback-item">
            <label className="playback-label" htmlFor="tone-select">Tone</label>
            <select
              id="tone-select"
              className="tone-select drum-select"
              value={instrumentId}
              onChange={(e) => onInstrumentIdChange(e.target.value as InstrumentId)}
              disabled={isExportingVideo}
            >
              {INSTRUMENT_IDS.map((id) => (
                <option key={id} value={id}>
                  {INSTRUMENT_PRESETS[id].label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="playback-bar-row playback-bar-transport">
          {onExportVideo && palette.length > 0 && (
            <button
              className={`btn-playback btn-share ${isExportingVideo ? "recording" : ""}`}
              onClick={() => {
                if (isPlaying) onStop();
                onExportVideo?.();
              }}
              disabled={isExportingVideo}
              title="縦型動画を作成して共有"
              aria-label="動画として共有"
            >
              {isExportingVideo ? "⏺" : "🎬"}
            </button>
          )}
          <button
            className={`btn-playback btn-loop ${isLooping ? "active" : ""}`}
            onClick={onToggleLoop}
            disabled={isExportingVideo}
            title="ループ再生"
            aria-label="ループ再生"
          >
            🔁
          </button>
          {!isPlaying ? (
            <button
              className="btn-playback btn-play"
              onClick={onPlayAll}
              disabled={palette.length === 0 || isExportingVideo}
              aria-label="再生"
              title={isExportingVideo ? "動画作成中は再生できません" : "再生"}
            >
              ▶
            </button>
          ) : (
            <button
              className="btn-playback btn-stop"
              onClick={onStop}
              disabled={isExportingVideo}
              aria-label="停止"
            >
              ■
            </button>
          )}
        </div>
      </div>

      {heroTagline && (
        <p className="workspace-hero-tagline" role="doc-subtitle">
          {heroTagline}
        </p>
      )}

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
                            className={`palette-pill ${isHalf ? "half-beat" : ""} ${isQuarter ? "quarter-beat" : ""} ${FUNCTION_CLASSES[chord.function] || ""} ${!chord.isDiatonic ? "pill-nondiatonic" : ""} ${isEditing ? "editing" : ""} ${isActive ? "playing" : ""} ${isExportingVideo ? "locked" : ""}`}
                            onClick={() => {
                              if (isExportingVideo) return;
                              onEditingIndexChange(idx);
                            }}
                          >
                            <span className="pill-degree">{chord.label}</span>
                            <span className="pill-name">{chord.displayName}</span>
                            {!isExportingVideo && (
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
                            )}
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
