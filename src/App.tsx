import { useState, useMemo, useEffect, useCallback } from "react";
import Header from "./components/Header";
import CompositionPalette from "./components/CompositionPalette";
import ChordSelectorSheet from "./components/ChordSelectorSheet";
import TheoryExplainer from "./components/TheoryExplainer";
import OnboardingOverlay from "./components/OnboardingOverlay";
import { useOnboarding } from "./hooks/useOnboarding";
import {
  getDiatonicChords,
  getNonDiatonicChords,
  getRecommendedIndices,
  diatonicToPalette,
  type Key,
  type DiatonicChord,
  type DiatonicChordType,
  type PaletteChord,
} from "./utils/musicTheory";
import {
  playChord,
  playPaletteSequence,
  stopPaletteSequence,
  installAudioLifecycleHandlers,
  setAudioInterruptedCallback,
  getAudioContextState,
} from "./utils/audioEngine";
import { loadPersistedState, savePersistedState } from "./utils/storage";

const ChordDurationOptions = ["1", "1/2", "1/4"] as const;

let cachedInitialState: ReturnType<typeof loadPersistedState> | undefined;

function getInitialState() {
  if (cachedInitialState === undefined) {
    cachedInitialState = loadPersistedState();
  }
  return cachedInitialState;
}

function App() {
  const [selectedKey, setSelectedKey] = useState<Key>(
    () => getInitialState()?.selectedKey ?? "C"
  );
  const [palette, setPalette] = useState<PaletteChord[]>(
    () => getInitialState()?.palette ?? []
  );
  const [activeTab, setActiveTab] = useState<"diatonic" | "non-diatonic" | "on-chord">("diatonic");
  const [bpm, setBpm] = useState<number>(() => getInitialState()?.bpm ?? 100);
  const [drumPattern, setDrumPattern] = useState<"none" | "4beat" | "8beat" | "16beat">(
    () => getInitialState()?.drumPattern ?? "none"
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(
    () => getInitialState()?.isLooping ?? false
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<PaletteChord[][]>([]);
  const [chordDurationMode, setChordDurationMode] = useState<"1" | "1/2" | "1/4">(
    () => getInitialState()?.chordDurationMode ?? "1"
  );
  const [audioToast, setAudioToast] = useState<string | null>(null);

  const { showOnboarding, dismissOnboarding } = useOnboarding();

  const diatonicChords = useMemo(() => getDiatonicChords(selectedKey), [selectedKey]);
  const nonDiatonicChords = useMemo(() => getNonDiatonicChords(selectedKey), [selectedKey]);

  const lastChord = palette.length > 0 ? palette[palette.length - 1] : null;
  const recommendedIndices = useMemo(() => getRecommendedIndices(lastChord), [lastChord]);

  const hasExplainApi = import.meta.env.VITE_ENABLE_EXPLAIN === "true";

  useEffect(() => {
    savePersistedState({
      selectedKey,
      palette,
      bpm,
      drumPattern,
      chordDurationMode,
      isLooping,
    });
  }, [selectedKey, palette, bpm, drumPattern, chordDurationMode, isLooping]);

  useEffect(() => {
    const cleanup = installAudioLifecycleHandlers();
    setAudioInterruptedCallback(() => {
      setIsPlaying(false);
      setCurrentPlayingIndex(null);
      const state = getAudioContextState();
      if (state === "interrupted" || state === "suspended") {
        setAudioToast("音声を再開するには ▶ をタップしてください");
      }
    });
    return () => {
      cleanup();
      setAudioInterruptedCallback(null);
    };
  }, []);

  const handleDiatonicClick = (chord: DiatonicChord, type: DiatonicChordType, key: Key) => {
    const beats = chordDurationMode === "1" ? 2 : chordDurationMode === "1/2" ? 1 : 0.5;
    const paletteChord = diatonicToPalette(chord, type, key, beats);
    const sustainSec = (60 / bpm) * beats;
    void playChord(paletteChord, sustainSec);

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
    setAudioToast(null);
  };

  const handleNonDiatonicClick = (paletteChord: PaletteChord) => {
    const beats = chordDurationMode === "1" ? 2 : chordDurationMode === "1/2" ? 1 : 0.5;
    const adjustedChord = { ...paletteChord, beats };
    const sustainSec = (60 / bpm) * beats;
    void playChord(adjustedChord, sustainSec);

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
    setAudioToast(null);
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
    setEditingIndex(null);
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
    void playChord(newPalette[targetIdx], sustainSec);
  };

  const handlePlayAll = () => {
    setAudioToast(null);
    setIsPlaying(true);
    setCurrentPlayingIndex(0);
    playPaletteSequence(
      palette,
      bpm,
      drumPattern,
      isLooping,
      () => {
        setIsPlaying(false);
        setCurrentPlayingIndex(null);
      },
      (idx) => {
        setCurrentPlayingIndex(idx);
      }
    );
  };

  const handleStop = () => {
    stopPaletteSequence();
    setIsPlaying(false);
    setCurrentPlayingIndex(null);
  };

  const handleSaveToHistory = () => {
    if (palette.length === 0) return;
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
    setEditingIndex(null);
  };

  const handleCopyProgression = useCallback(async () => {
    const text = palette.map((c) => c.displayName).join(" - ");
    try {
      await navigator.clipboard.writeText(text);
      setAudioToast("進行をコピーしました");
      window.setTimeout(() => setAudioToast(null), 2000);
    } catch {
      setAudioToast("コピーに失敗しました");
    }
  }, [palette]);

  const progressionString = palette.map((c) => c.displayName).join(" - ");

  const keyMismatch =
    palette.length > 0 && palette.some((c) => c.key && c.key !== selectedKey);

  return (
    <div className="app">
      <Header
        selectedKey={selectedKey}
        onKeyChange={handleKeyChange}
        onUndo={handleUndo}
        onSaveToHistory={handleSaveToHistory}
        onClear={handleClear}
        canUndo={palette.length > 0}
        canSave={palette.length > 0}
        canClear={palette.length > 0}
      />

      {keyMismatch && (
        <div className="key-mismatch-banner" role="status">
          キーを変更しました。パレット内に以前のキーのコードが含まれています。
        </div>
      )}

      {audioToast && (
        <div className="audio-toast" role="status">
          {audioToast}
          <button type="button" className="audio-toast-close" onClick={() => setAudioToast(null)} aria-label="閉じる">
            ✕
          </button>
        </div>
      )}

      <section className="workspace-center">
        <CompositionPalette
          palette={palette}
          bpm={bpm}
          onBpmChange={setBpm}
          drumPattern={drumPattern}
          onDrumPatternChange={setDrumPattern}
          isPlaying={isPlaying}
          onRemove={handleRemove}
          onPlayAll={handlePlayAll}
          onStop={handleStop}
          isLooping={isLooping}
          onToggleLoop={() => setIsLooping(!isLooping)}
          history={history}
          onLoadFromHistory={handleLoadFromHistory}
          onRemoveFromHistory={handleRemoveFromHistory}
          editingIndex={editingIndex}
          onEditingIndexChange={(idx) => setEditingIndex((prev) => (prev === idx ? null : idx))}
          currentPlayingIndex={currentPlayingIndex}
          chordDurationMode={chordDurationMode}
          onToggleDurationMode={() => {
            const currentIdx = ChordDurationOptions.indexOf(chordDurationMode);
            const nextIdx = (currentIdx + 1) % ChordDurationOptions.length;
            setChordDurationMode(ChordDurationOptions[nextIdx]);
          }}
          onCopyProgression={handleCopyProgression}
          emptyHint="下のコードから選んで追加 ↓"
        />
        {palette.length > 0 && hasExplainApi && (
          <TheoryExplainer progression={progressionString} />
        )}
      </section>

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

      {showOnboarding && <OnboardingOverlay onDismiss={dismissOnboarding} />}
    </div>
  );
}

export default App;
