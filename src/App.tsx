import { useState, useMemo, useEffect, useCallback } from "react";
import Header from "./components/Header";
import CompositionPalette from "./components/CompositionPalette";
import ChordSelectorSheet from "./components/ChordSelectorSheet";
import TheoryExplainer from "./components/TheoryExplainer";
import OnboardingOverlay from "./components/OnboardingOverlay";
import ProModal from "./components/ProModal";
import { useOnboarding } from "./hooks/useOnboarding";
import { useProLicense } from "./hooks/useProLicense";
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
  setPlaybackInstrument,
  triggerRushSamplerLoad,
  type BeatPattern,
  type DrumPattern,
} from "./utils/audioEngine";
import { resetVoicingState } from "./utils/voicing";
import {
  getRushSamplerState,
  onRushSamplerStateChange,
  type RushSamplerState,
} from "./utils/rushSampler";
import type { InstrumentId } from "./utils/instrumentPresets";
import { loadPersistedState, savePersistedState } from "./utils/storage";
import {
  exportProgressionVideo,
  isVideoExportSupported,
} from "./utils/videoExporter";
import { shareVideoFile, buildShareText } from "./utils/shareVideo";
import { copyTextToClipboard } from "./utils/clipboard";
import { trackEvent } from "./utils/analytics";

const ChordDurationOptions = ["1", "1/2", "1/4"] as const;

function classifyToast(message: string): string {
  if (message.includes("作成中") || message.includes("…")) {
    return "toast-progress";
  }
  if (
    message.includes("失敗") ||
    message.includes("エラー") ||
    message.includes("再開") ||
    message.includes("対応していません") ||
    // Sprint 7: MediaRecorder 非対応時の半失敗（動画は作れないがテキストはコピー成功した状態）も error 系で見せる
    message.includes("作れませんでした")
  ) {
    return "toast-error";
  }
  if (message.includes("保存しました") || message.includes("開きました")) {
    return "toast-success";
  }
  return "toast-info";
}

function toastIcon(message: string): string {
  const kind = classifyToast(message);
  switch (kind) {
    case "toast-progress":
      return "●";
    case "toast-error":
      return "!";
    case "toast-success":
      return "✓";
    default:
      return "i";
  }
}

let cachedInitialState: ReturnType<typeof loadPersistedState> | undefined;

function getInitialState() {
  if (cachedInitialState === undefined) {
    cachedInitialState = loadPersistedState();
  }
  return cachedInitialState;
}

function App() {
  const [selectedKey, setSelectedKey] = useState<Key>(
    () => getInitialState()?.selectedKey ?? "C",
  );
  const [palette, setPalette] = useState<PaletteChord[]>(
    () => getInitialState()?.palette ?? [],
  );
  const [activeTab, setActiveTab] = useState<
    "diatonic" | "non-diatonic" | "on-chord"
  >("diatonic");
  const [bpm, setBpm] = useState<number>(() => getInitialState()?.bpm ?? 100);
  const [drumPattern, setDrumPattern] = useState<DrumPattern>(
    () => getInitialState()?.drumPattern ?? "none",
  );
  const [beatPattern, setBeatPattern] = useState<BeatPattern>(
    () => getInitialState()?.beatPattern ?? "none",
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(
    () => getInitialState()?.isLooping ?? false,
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number | null>(
    null,
  );
  const [history, setHistory] = useState<PaletteChord[][]>([]);
  const [chordDurationMode, setChordDurationMode] = useState<
    "1" | "1/2" | "1/4"
  >(() => getInitialState()?.chordDurationMode ?? "1");
  const [instrumentId, setInstrumentId] = useState<InstrumentId>(
    () => getInitialState()?.instrumentId ?? "piano",
  );
  const [audioToast, setAudioToast] = useState<string | null>(null);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  // Sprint 16: Pro 機能 / MIDI 書き出し
  const [proModalOpen, setProModalOpen] = useState(false);
  const [isExportingMidi, setIsExportingMidi] = useState(false);
  const proLicense = useProLicense();
  // v2.9 (Sprint 14): Rush サンプラーのロード状態。UI のロード中インジケータに使う。
  const [rushSamplerState, setRushSamplerState] = useState<RushSamplerState>(
    () => getRushSamplerState(),
  );

  const { showOnboarding, dismissOnboarding } = useOnboarding();

  // 購入失敗時のフォールバック: /?open_pro=1 で Pro モーダルを開く
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("open_pro") === "1") {
      setProModalOpen(true);
      params.delete("open_pro");
      const next = params.toString();
      const path = window.location.pathname;
      window.history.replaceState({}, "", next ? `${path}?${next}` : path);
    }
  }, []);

  const diatonicChords = useMemo(
    () => getDiatonicChords(selectedKey),
    [selectedKey],
  );
  const nonDiatonicChords = useMemo(
    () => getNonDiatonicChords(selectedKey),
    [selectedKey],
  );

  const lastChord = palette.length > 0 ? palette[palette.length - 1] : null;
  const recommendedIndices = useMemo(
    () => getRecommendedIndices(lastChord),
    [lastChord],
  );

  const hasExplainApi = import.meta.env.VITE_ENABLE_EXPLAIN === "true";

  useEffect(() => {
    savePersistedState({
      selectedKey,
      palette,
      bpm,
      drumPattern,
      beatPattern,
      chordDurationMode,
      isLooping,
      instrumentId,
    });
  }, [
    selectedKey,
    palette,
    bpm,
    drumPattern,
    beatPattern,
    chordDurationMode,
    isLooping,
    instrumentId,
  ]);

  useEffect(() => {
    setPlaybackInstrument(instrumentId);
  }, [instrumentId]);

  // v2.9 (Sprint 14): Rush サンプラーのロード状態を購読
  useEffect(() => {
    const unsubscribe = onRushSamplerStateChange((state) => {
      setRushSamplerState(state);
    });
    // 初回マウント時の現在 state を取り込む（ストレージ復元時に "ready" の場合に備えて）
    setRushSamplerState(getRushSamplerState());
    return unsubscribe;
  }, []);

  // Piano 選択時のみサンプラーロードをトリガする。
  // リリースカットピアノ / エレクトリックピアノ選択中は CDN 通信を発生させない。
  useEffect(() => {
    if (instrumentId !== "piano") return;
    // fire-and-forget; ensureRushSamplerLoaded は Singleton なので何度呼んでも安全
    void triggerRushSamplerLoad();
  }, [instrumentId]);

  const handleInstrumentIdChange = useCallback(
    (id: InstrumentId) => {
      setInstrumentId(id);
      setPlaybackInstrument(id);
      trackEvent("tone_change", { tone: id });
      if (isPlaying || isExportingVideo) return;
      const previewChord =
        editingIndex !== null && palette[editingIndex]
          ? palette[editingIndex]
          : palette.length > 0
            ? palette[palette.length - 1]
            : null;
      if (previewChord) {
        const beats = previewChord.beats || 2;
        void playChord(
          previewChord,
          Math.min(0.55, (60 / bpm) * beats),
          undefined,
          {
            instrumentId: id,
            useVoiceLeading: false,
          },
        );
      }
    },
    [palette, editingIndex, isPlaying, isExportingVideo, bpm],
  );

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

  const handleDiatonicClick = (
    chord: DiatonicChord,
    type: DiatonicChordType,
    key: Key,
  ) => {
    const beats =
      chordDurationMode === "1" ? 2 : chordDurationMode === "1/2" ? 1 : 0.5;
    let paletteChord = diatonicToPalette(chord, type, key, beats);

    // 編集中: 既存コードの inversion を引き継ぐ（テトラッド↔トライアドで範囲を clamp）
    if (editingIndex !== null && palette[editingIndex]) {
      const prev = palette[editingIndex];
      const maxInv: 0 | 1 | 2 | 3 =
        paletteChord.intervals.length >= 4
          ? 3
          : paletteChord.intervals.length === 3
            ? 2
            : 0;
      const carried = Math.min(prev.inversion ?? 0, maxInv) as 0 | 1 | 2 | 3;
      paletteChord = { ...paletteChord, inversion: carried };
    }

    const sustainSec = (60 / bpm) * beats;
    void playChord(paletteChord, sustainSec, undefined, {
      instrumentId,
      useVoiceLeading: true,
    });

    if (editingIndex !== null) {
      setPalette((prev) => {
        const next = [...prev];
        next[editingIndex] = paletteChord;
        return next;
      });
      setEditingIndex(null);
    } else {
      setPalette((prev) => [...prev, paletteChord]);
      trackEvent("chord_add", { source: "diatonic" });
    }
    setAudioToast(null);
  };

  const handleNonDiatonicClick = (paletteChord: PaletteChord) => {
    const beats =
      chordDurationMode === "1" ? 2 : chordDurationMode === "1/2" ? 1 : 0.5;
    let adjustedChord: PaletteChord = { ...paletteChord, beats };

    // 編集中: 既存コードの inversion を引き継ぐ
    if (editingIndex !== null && palette[editingIndex]) {
      const prev = palette[editingIndex];
      const maxInv: 0 | 1 | 2 | 3 =
        adjustedChord.intervals.length >= 4
          ? 3
          : adjustedChord.intervals.length === 3
            ? 2
            : 0;
      const carried = Math.min(prev.inversion ?? 0, maxInv) as 0 | 1 | 2 | 3;
      adjustedChord = { ...adjustedChord, inversion: carried };
    }

    const sustainSec = (60 / bpm) * beats;
    void playChord(adjustedChord, sustainSec, undefined, {
      instrumentId,
      useVoiceLeading: true,
    });

    if (editingIndex !== null) {
      setPalette((prev) => {
        const next = [...prev];
        next[editingIndex] = adjustedChord;
        return next;
      });
      setEditingIndex(null);
    } else {
      setPalette((prev) => [...prev, adjustedChord]);
      trackEvent("chord_add", { source: "non_diatonic" });
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
    resetVoicingState();
  };

  const handleInversionChange = (index: number, inversion: 0 | 1 | 2 | 3) => {
    if (index < 0 || index >= palette.length) return;
    const target = palette[index];
    // オンコードのときは転回を変更しない（仕様上競合）
    if (
      target.bassNoteOverride !== undefined &&
      target.bassNoteOverride !== null
    )
      return;
    // トライアド時に 3rd は不可
    const maxInv =
      target.intervals.length >= 4 ? 3 : target.intervals.length === 3 ? 2 : 0;
    if (inversion > maxInv) return;

    const updated: PaletteChord = { ...target, inversion };
    setPalette((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });

    // 単音プレビュー（タップ時に転回を反映）
    if (!isPlaying && !isExportingVideo) {
      const beats = updated.beats || 2;
      const sustainSec = Math.min(0.55, (60 / bpm) * beats);
      void playChord(updated, sustainSec, undefined, {
        instrumentId,
        useVoiceLeading: false,
      });
    }
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
    void playChord(newPalette[targetIdx], sustainSec, undefined, {
      instrumentId,
      useVoiceLeading: true,
    });
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
      },
      { instrumentId, beatPattern },
    );
    trackEvent("play_sequence", { chords: palette.length, bpm });
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

  const handleAppendFromHistory = (index: number) => {
    const source = history[index];
    if (!source || source.length === 0) return;
    setPalette((prev) => [...prev, ...source]);
    setEditingIndex(null);
  };

  const handleRemoveFromHistory = (index: number) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyChange = (key: Key) => {
    setSelectedKey(key);
    setEditingIndex(null);
  };

  const handleExportVideo = useCallback(async () => {
    if (palette.length === 0 || isExportingVideo) return;

    // 動画書き出し非対応環境 → テキストコピーのみで fallback
    if (!isVideoExportSupported()) {
      const text = buildShareText(palette, selectedKey, bpm);
      const ok = await copyTextToClipboard(text);
      setAudioToast(
        ok
          ? "動画は作れませんでした。テキストだけコピーしました"
          : "コピーに失敗しました",
      );
      window.setTimeout(() => setAudioToast(null), 3500);
      return;
    }

    setIsExportingVideo(true);
    setAudioToast("動画を作成中…\n画面はそのままにしてください");

    try {
      const result = await exportProgressionVideo({
        palette,
        selectedKey,
        bpm,
        drumPattern,
        beatPattern,
        instrumentId,
        onTick: (idx) => setCurrentPlayingIndex(idx),
      });

      setCurrentPlayingIndex(null);

      const text = buildShareText(palette, selectedKey, bpm);

      try {
        const mode = await shareVideoFile(result.file, text);
        trackEvent("video_export", { chords: palette.length, mode });
        trackEvent("share_video", { mode });
        switch (mode) {
          case "shared":
            setAudioToast("共有シートを開きました");
            break;
          case "shared-text-only":
            setAudioToast("動画を保存しました（共有シートでテキストを送信）");
            break;
          case "downloaded-copied":
            setAudioToast("動画を保存しました（テキストをコピーしました）");
            break;
          case "downloaded-only":
            // 動画 DL はできたがクリップボードコピーに失敗 → ユーザーに伝える
            setAudioToast("動画を保存しました（テキストのコピーに失敗）");
            break;
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setAudioToast(null);
        } else {
          // shareVideoFile 自体の例外（AbortError 以外）
          const msg = err instanceof Error ? err.message : "共有に失敗しました";
          setAudioToast(`共有に失敗しました: ${msg}`);
        }
      }
      window.setTimeout(() => setAudioToast(null), 3000);
    } catch (err) {
      setCurrentPlayingIndex(null);
      if (err instanceof Error && err.name === "AbortError") {
        setAudioToast(null);
      } else {
        const msg =
          err instanceof Error ? err.message : "動画の作成に失敗しました";
        setAudioToast(
          msg.includes("動画") ? msg : `動画の作成に失敗しました: ${msg}`,
        );
        window.setTimeout(() => setAudioToast(null), 3500);
      }
    } finally {
      setIsExportingVideo(false);
    }
  }, [
    palette,
    selectedKey,
    bpm,
    drumPattern,
    beatPattern,
    instrumentId,
    isExportingVideo,
  ]);

  // Sprint 16: URL クエリ ?license= の取り込みが成功したらトーストで通知
  useEffect(() => {
    if (proLicense.urlAutoVerified) {
      setAudioToast("Pro 機能が有効になりました");
      trackEvent("pro_activated", { source: "url_query" });
      window.setTimeout(() => setAudioToast(null), 3000);
      proLicense.consumeUrlAutoVerified();
    }
  }, [proLicense.urlAutoVerified, proLicense]);

  // Sprint 16: MIDI 書き出しハンドラ（Pro 機能）
  const handleExportMidi = useCallback(async () => {
    if (!proLicense.isPro) {
      setProModalOpen(true);
      return;
    }
    if (palette.length === 0 || isExportingMidi) return;

    setIsExportingMidi(true);
    setAudioToast("MIDI を書き出し中…");

    try {
      // 動的 import: midiExporter は @tonejs/midi を遅延ロードする
      const { exportPaletteToMidi, deliverMidiBlob } =
        await import("./utils/midiExporter");
      const { blob, fileName } = await exportPaletteToMidi({
        palette,
        bpm,
        drumPattern,
        beatPattern,
      });

      try {
        const mode = await deliverMidiBlob(blob, fileName);
        trackEvent("midi_export", { chords: palette.length, mode });
        setAudioToast(
          mode === "shared"
            ? "共有シートを開きました"
            : "MIDI ファイルを保存しました",
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setAudioToast(null);
        } else {
          const msg = err instanceof Error ? err.message : "共有に失敗しました";
          setAudioToast(`共有に失敗しました: ${msg}`);
        }
      }
      window.setTimeout(() => setAudioToast(null), 3000);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "MIDI 書き出しに失敗しました";
      setAudioToast(msg);
      window.setTimeout(() => setAudioToast(null), 3500);
    } finally {
      setIsExportingMidi(false);
    }
  }, [
    proLicense.isPro,
    palette,
    bpm,
    drumPattern,
    beatPattern,
    isExportingMidi,
  ]);

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
        <div
          className={`audio-toast ${classifyToast(audioToast)}`}
          role="status"
        >
          <span className="audio-toast-icon" aria-hidden="true">
            {toastIcon(audioToast)}
          </span>
          <span className="audio-toast-text">{audioToast}</span>
          <button
            type="button"
            className="audio-toast-close"
            onClick={() => setAudioToast(null)}
            aria-label="閉じる"
          >
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
          beatPattern={beatPattern}
          onBeatPatternChange={setBeatPattern}
          instrumentId={instrumentId}
          onInstrumentIdChange={handleInstrumentIdChange}
          rushSamplerState={rushSamplerState}
          isPlaying={isPlaying}
          onRemove={handleRemove}
          onPlayAll={handlePlayAll}
          onStop={handleStop}
          isLooping={isLooping}
          onToggleLoop={() => setIsLooping(!isLooping)}
          history={history}
          onLoadFromHistory={handleLoadFromHistory}
          onAppendFromHistory={handleAppendFromHistory}
          onRemoveFromHistory={handleRemoveFromHistory}
          editingIndex={editingIndex}
          onEditingIndexChange={(idx) =>
            setEditingIndex((prev) => (prev === idx ? null : idx))
          }
          currentPlayingIndex={currentPlayingIndex}
          chordDurationMode={chordDurationMode}
          onToggleDurationMode={() => {
            const currentIdx = ChordDurationOptions.indexOf(chordDurationMode);
            const nextIdx = (currentIdx + 1) % ChordDurationOptions.length;
            setChordDurationMode(ChordDurationOptions[nextIdx]);
          }}
          onExportVideo={handleExportVideo}
          isExportingVideo={isExportingVideo}
          onExportMidi={handleExportMidi}
          isExportingMidi={isExportingMidi}
          isProUser={proLicense.isPro}
          onOpenProModal={() => setProModalOpen(true)}
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
        editingChord={
          editingIndex !== null ? (palette[editingIndex] ?? null) : null
        }
        editingIndex={editingIndex}
        onInversionChange={handleInversionChange}
      />

      {showOnboarding && <OnboardingOverlay onDismiss={dismissOnboarding} />}

      <ProModal
        isOpen={proModalOpen}
        onClose={() => setProModalOpen(false)}
        isPro={proLicense.isPro}
        license={proLicense.license}
        isVerifying={proLicense.isVerifying}
        error={proLicense.error}
        onVerify={proLicense.verify}
        onClear={proLicense.clear}
      />
    </div>
  );
}

export default App;
