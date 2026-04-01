import { useState, useMemo } from "react";
import Header from "./components/Header";
import CompositionPalette from "./components/CompositionPalette";
import ChordSelectorSheet from "./components/ChordSelectorSheet";
import {

  getDiatonicChords,
  getNonDiatonicChords,
  getRecommendedIndices,
  diatonicToPalette,
  type Key,
  type DiatonicChord,
  type PaletteChord,
} from "./utils/musicTheory";
import { playChord, playPaletteSequence, stopPaletteSequence, resetAudioEngine, ensureAudioContextRunning } from "./utils/audioEngine";

const ChordDurationOptions = ["1", "1/2", "1/4"] as const;

function App() {
  const [selectedKey, setSelectedKey] = useState<Key>("C");
  const [palette, setPalette] = useState<PaletteChord[]>([]);
  const [activeTab, setActiveTab] = useState<"diatonic" | "non-diatonic" | "on-chord">("diatonic");
  const [bpm, setBpm] = useState<number>(100);
  const [drumPattern, setDrumPattern] = useState<"none" | "4beat" | "8beat" | "16beat">("none");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<PaletteChord[][]>([]);
  const [chordDurationMode, setChordDurationMode] = useState<"1" | "1/2" | "1/4">("1");

  // === デバッグパネル ===
  const [debugVisible, setDebugVisible] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const addDebugLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    setDebugLog(prev => [`[${time}] ${msg}`, ...prev].slice(0, 20));
  };

  const runAudioDiag = async () => {
    addDebugLog("=== 診断開始 ===");
    try {
      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!AudioCtx) { addDebugLog("❌ AudioContext 非対応"); return; }
      addDebugLog("✅ AudioContext 使用可能");
      await ensureAudioContextRunning();
      // AudioContext 情報は playChord 後に表示
      addDebugLog("▶ テスト音を再生します...");
      const testChord = {
        label: "C", displayName: "C", function: "T" as const,
        rootNote: 60, intervals: [0, 4, 7], beats: 2,
        isDiatonic: true, key: "C" as const,
      };
      playChord(testChord, 1.0);
      addDebugLog("✅ playChord() 呼び出し完了");
    } catch(e: any) {
      addDebugLog(`❌ エラー: ${e?.message ?? String(e)}`);
    }
  };


  const diatonicChords = useMemo(
    () => getDiatonicChords(selectedKey),
    [selectedKey]
  );

  const nonDiatonicChords = useMemo(
    () => getNonDiatonicChords(selectedKey),
    [selectedKey]
  );

  const lastChord = palette.length > 0 ? palette[palette.length - 1] : null;
  const recommendedIndices = useMemo(
    () => getRecommendedIndices(lastChord),
    [lastChord]
  );

  const handleDiatonicClick = (chord: DiatonicChord, type: "triad" | "7th" | "6" | "sus2" | "sus4" | "9" | "11" | "13" | "b9" | "#9" | "#11" | "b13", key: Key) => {
    const beats = chordDurationMode === "1" ? 2 : chordDurationMode === "1/2" ? 1 : 0.5;
    const paletteChord = diatonicToPalette(chord, type, key, beats);
    const sustainSec = (60 / bpm) * beats;
    playChord(paletteChord, sustainSec);
    
    if (editingIndex !== null) {
      setPalette((prev) => {
        const next = [...prev];
        next[editingIndex] = paletteChord;
        return next;
      });
      setEditingIndex(null);
    } else {
      setPalette((prev) => [...prev, paletteChord]);
    }
  };

  const handleNonDiatonicClick = (paletteChord: PaletteChord) => {
    // 既存の paletteChord に現在のリズムモード設定を適用
    const beats = chordDurationMode === "1" ? 2 : chordDurationMode === "1/2" ? 1 : 0.5;
    const adjustedChord = { ...paletteChord, beats };
    const sustainSec = (60 / bpm) * beats;
    playChord(adjustedChord, sustainSec);
    
    if (editingIndex !== null) {
      setPalette((prev) => {
        const next = [...prev];
        next[editingIndex] = adjustedChord;
        return next;
      });
      setEditingIndex(null);
    } else {
      setPalette((prev) => [...prev, adjustedChord]);
    }
  };


  const handleUndo = () => {
    setPalette((prev) => prev.slice(0, -1));
  };

  const handleRemove = (index: number) => {
    setPalette((prev) => prev.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
    } else if (editingIndex !== null && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
  };

  const handleClear = () => {
    setPalette([]);
  };

  const handleBassChange = (bassNote: number, noteName: string) => {
    if (palette.length === 0) return;
    const targetIdx = editingIndex !== null ? editingIndex : palette.length - 1;
    const newPalette = [...palette];
    const target = newPalette[targetIdx];
    
    const originalName = target.displayName.split("/")[0];
    
    newPalette[targetIdx] = {
      ...target,
      bassNoteOverride: bassNote,
      displayName: `${originalName}/${noteName}`,
    };
    
    setPalette(newPalette);
    const beats = target.beats || 2;
    const sustainSec = (60 / bpm) * beats;
    playChord(newPalette[targetIdx], sustainSec);
    
    // 分数コード変更後も編集モードは維持した方が使いやすい（色々なベース音を試すため）
  };

  const handlePlayAll = () => {
    setIsPlaying(true);
    setCurrentPlayingIndex(0);
    playPaletteSequence(palette, bpm, drumPattern, isLooping, () => {
      setIsPlaying(false);
      setCurrentPlayingIndex(null);
    }, (idx) => {
      setCurrentPlayingIndex(idx);
    });
  };

  const handleStop = () => {
    stopPaletteSequence();
    setIsPlaying(false);
    setCurrentPlayingIndex(null);
  };

  const handleSaveToHistory = () => {
    if (palette.length === 0) return;
    // 重複保存を防ぐため、最新の履歴と同じなら無視するなどの高度な処理も可能だが、
    // シンプルに「現在の状態を先頭に追加し最大5件にする」
    setHistory((prev) => [palette, ...prev].slice(0, 5));
  };

  const handleLoadFromHistory = (index: number) => {
    setPalette(history[index]);
  };

  const handleRemoveFromHistory = (index: number) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyChange = (key: Key) => {
    setSelectedKey(key);
    // setPalette([]); // キーを変えてもパレットを保持するように変更
    setEditingIndex(null);
  };

  return (
    <div className="app">
      <Header selectedKey={selectedKey} onKeyChange={handleKeyChange} />
      
      {/* 中央エリア：作品（パレット）*/}
      <section className="workspace-center">
        <CompositionPalette
          palette={palette}
          bpm={bpm}
          onBpmChange={setBpm}
          drumPattern={drumPattern}
          onDrumPatternChange={setDrumPattern}
          isPlaying={isPlaying}
          onUndo={handleUndo}
          onRemove={handleRemove}
          onClear={handleClear}
          onPlayAll={handlePlayAll}
          onStop={handleStop}
          isLooping={isLooping}
          onToggleLoop={() => setIsLooping(!isLooping)}
          history={history}
          onSaveToHistory={handleSaveToHistory}
          onLoadFromHistory={handleLoadFromHistory}
          onRemoveFromHistory={handleRemoveFromHistory}
          editingIndex={editingIndex}
          onEditingIndexChange={(idx) => setEditingIndex(prev => prev === idx ? null : idx)}
          currentPlayingIndex={currentPlayingIndex}
          chordDurationMode={chordDurationMode}
          onToggleDurationMode={() => {
            const currentIdx = ChordDurationOptions.indexOf(chordDurationMode);
            const nextIdx = (currentIdx + 1) % ChordDurationOptions.length;
            setChordDurationMode(ChordDurationOptions[nextIdx]);
          }}
        />
      </section>

      {/* ボトムシート：コード選択 */}
      <ChordSelectorSheet
        activeTab={activeTab}
        onTabChange={setActiveTab}
        diatonicChords={diatonicChords}
        nonDiatonicChords={nonDiatonicChords}
        recommendedIndices={recommendedIndices}
        lastChord={lastChord}
        onDiatonicClick={handleDiatonicClick}
        onNonDiatonicClick={handleNonDiatonicClick}
        onBassSelect={handleBassChange}
        selectedKey={selectedKey}
      />

      {/* ===  デバッグパネル（一時的） === */}
      <div style={{
        position: "fixed", bottom: 0, right: 0, zIndex: 9999,
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, padding: 8,
      }}>
        <button
          onClick={() => setDebugVisible(v => !v)}
          style={{
            background: "#ff4444", color: "#fff", border: "none", borderRadius: 6,
            padding: "6px 12px", fontSize: 12, fontWeight: "bold", cursor: "pointer",
          }}
        >
          🔧 DEBUG
        </button>
        {debugVisible && (
          <div style={{
            background: "rgba(0,0,0,0.92)", color: "#0f0", fontFamily: "monospace",
            fontSize: 11, padding: 10, borderRadius: 8, width: 320, maxHeight: 300,
            overflowY: "auto", border: "1px solid #0f0",
          }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button onClick={runAudioDiag} style={{
                background: "#0a0", color: "#fff", border: "none", borderRadius: 4,
                padding: "4px 10px", fontSize: 11, cursor: "pointer", flex: 1,
              }}>▶ 音テスト &amp; 診断</button>
              <button onClick={() => { resetAudioEngine(); addDebugLog("🔄 AudioEngine リセット"); }} style={{
                background: "#a60", color: "#fff", border: "none", borderRadius: 4,
                padding: "4px 10px", fontSize: 11, cursor: "pointer", flex: 1,
              }}>🔄 エンジンリセット</button>
            </div>
            <div style={{ color: "#aaa", marginBottom: 4 }}>ver: 2.2.1</div>
            {debugLog.length === 0 && <div style={{ color: "#888" }}>「音テスト &amp; 診断」を押してください</div>}
            {debugLog.map((line, i) => (
              <div key={i} style={{ borderBottom: "1px solid #222", paddingBottom: 2, marginBottom: 2 }}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
