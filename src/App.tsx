import { useState, useMemo } from "react";
import Header from "./components/Header";
import TheoryPane from "./components/TheoryPane";
import NonDiatonicPane from "./components/NonDiatonicPane";
import CompositionPalette from "./components/CompositionPalette";
import OnChordPane from "./components/OnChordPane";
import {
  getDiatonicChords,
  getNonDiatonicChords,
  getRecommendedIndices,
  diatonicToPalette,
  type Key,
  type DiatonicChord,
  type PaletteChord,
} from "./utils/musicTheory";
import { playChord, playPaletteSequence, stopPaletteSequence } from "./utils/audioEngine";

function App() {
  const [selectedKey, setSelectedKey] = useState<Key>("C");
  const [palette, setPalette] = useState<PaletteChord[]>([]);
  const [activeTab, setActiveTab] = useState<"diatonic" | "non-diatonic" | "on-chord">("diatonic");
  const [bpm, setBpm] = useState<number>(100);
  const [drumPattern, setDrumPattern] = useState<"none" | "4beat" | "8beat" | "16beat">("none");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [history, setHistory] = useState<PaletteChord[][]>([]);


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

  const handleDiatonicClick = (chord: DiatonicChord, type: "triad" | "7th" | "sus2" | "sus4" | "9" | "11" | "13" | "b9" | "#9" | "#11" | "b13") => {
    const paletteChord = diatonicToPalette(chord, type);
    const sustainSec = (60 / bpm) * 2; // BPMから計算して同じ長さをデフォルトにする
    playChord(paletteChord, sustainSec);
    setPalette((prev) => [...prev, paletteChord]);
  };

  const handleNonDiatonicClick = (paletteChord: PaletteChord) => {
    const sustainSec = (60 / bpm) * 2;
    playChord(paletteChord, sustainSec);
    setPalette((prev) => [...prev, paletteChord]);
  };

  const handleRemove = (index: number) => {
    setPalette((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUndo = () => {
    setPalette((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPalette([]);
  };

  const handleBassChange = (bassNote: number, noteName: string) => {
    if (palette.length === 0) return;
    const newPalette = [...palette];
    const target = newPalette[newPalette.length - 1];
    
    const originalName = target.displayName.split("/")[0];
    
    newPalette[newPalette.length - 1] = {
      ...target,
      bassNoteOverride: bassNote,
      displayName: `${originalName}/${noteName}`,
    };
    
    setPalette(newPalette);
    const sustainSec = (60 / bpm) * 2;
    playChord(newPalette[newPalette.length - 1], sustainSec);
  };

  const handlePlayAll = () => {
    setIsPlaying(true);
    playPaletteSequence(palette, bpm, drumPattern, () => {
      setIsPlaying(false);
    });
  };

  const handleStop = () => {
    stopPaletteSequence();
    setIsPlaying(false);
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

  const handleKeyChange = (key: Key) => {
    setSelectedKey(key);
    setPalette([]);
  };

  return (
    <div className="app">
      <Header selectedKey={selectedKey} onKeyChange={handleKeyChange} />
      <main className="main-content">
        <div className="tab-navigation">
          <button
            className={`tab-btn ${activeTab === "diatonic" ? "active" : ""}`}
            onClick={() => setActiveTab("diatonic")}
          >
            Diatonic Chords
          </button>
          <button
            className={`tab-btn ${activeTab === "non-diatonic" ? "active" : ""}`}
            onClick={() => setActiveTab("non-diatonic")}
          >
            Non-Diatonic
          </button>
          <button
            className={`tab-btn ${activeTab === "on-chord" ? "active" : ""}`}
            onClick={() => setActiveTab("on-chord")}
          >
            On-Chord
          </button>
        </div>

        <div className="tab-content">
          {activeTab === "diatonic" && (
            <TheoryPane
              chords={diatonicChords}
              recommendedIndices={recommendedIndices}
              onChordClick={handleDiatonicClick}
            />
          )}
          {activeTab === "non-diatonic" && (
            <NonDiatonicPane
              chords={nonDiatonicChords}
              onChordClick={handleNonDiatonicClick}
            />
          )}
          {activeTab === "on-chord" && (
            <OnChordPane
              targetChord={lastChord}
              onBassSelect={handleBassChange}
            />
          )}
        </div>

        <div className="palette-container">
          <CompositionPalette
            palette={palette}
            bpm={bpm}
            onBpmChange={setBpm}
            drumPattern={drumPattern}
            onDrumPatternChange={setDrumPattern}
            isPlaying={isPlaying}
            onRemove={handleRemove}
            onUndo={handleUndo}
            onClear={handleClear}
            onPlayAll={handlePlayAll}
            onStop={handleStop}
            history={history}
            onSaveToHistory={handleSaveToHistory}
            onLoadFromHistory={handleLoadFromHistory}
          />
        </div>
      </main>
      <footer className="footer">
        <p>Chord Palette — 直感的にコード進行を組み立てよう</p>
      </footer>
    </div>
  );
}

export default App;
