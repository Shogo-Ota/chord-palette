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
import { playChord, playPaletteSequence, stopPaletteSequence } from "./utils/audioEngine";

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

  const handleDiatonicClick = (chord: DiatonicChord, type: "triad" | "7th" | "sus2" | "sus4" | "9" | "11" | "13" | "b9" | "#9" | "#11" | "b13", key: Key) => {
    const paletteChord = diatonicToPalette(chord, type, key);
    const sustainSec = (60 / bpm) * 2;
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
    const sustainSec = (60 / bpm) * 2;
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
    const sustainSec = (60 / bpm) * 2;
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
    </div>
  );
}

export default App;
