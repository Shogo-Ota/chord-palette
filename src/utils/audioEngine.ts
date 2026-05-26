// === Web Audio API コードプレビューエンジン ===
// v2.5.0: 音色プリセット + 統一ボイシング
// v2.7.0 (Sprint 12): 808 系ドラム + 5 ジャンルパターン
// v2.8.0 (Sprint 13): Drum（ジャンル：Kick/Snare/特徴音）と Beat（ハイハット密度）を 2 軸に分離

import type { PaletteChord } from "./musicTheory";

/** v2.7: ドラムパターン（5 ジャンル + なし） — Kick/Snare/ジャンル特有のパーカッションを担当 */
export type DrumPattern = "none" | "rock" | "jazz" | "funk" | "pop" | "soul";

/**
 * v2.8 (Sprint 13): Beat パターン — HiHat Closed の密度を制御する独立軸。
 *
 * - `none`   : ハイハットなし
 * - `4beat`  : step % 4 === 0 （0,4,8,12）
 * - `8beat`  : step % 2 === 0 （0,2,4,6,8,10,12,14）
 * - `16beat` : 全 16 ステップ
 *
 * Drum 側のスウィング（jazz/soul: 三連、funk: 軽）はこちらにも適用される。
 */
export type BeatPattern = "none" | "4beat" | "8beat" | "16beat";
import {
  type InstrumentId,
  getInstrumentPreset,
  scheduleNoteVoice,
  type StoppableNode,
} from "./instrumentPresets";
import {
  createCleanupHighpass,
  createPleasantReverbBus,
  createTrebleShelf,
  type PleasantReverbBus,
} from "./pleasantAcoustics";
import { resetVoicingState, voiceChordForPlayback } from "./voicing";

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let drumGain: GainNode | null = null;
let limiter: DynamicsCompressorNode | null = null;
// v2.6: 共有マスターチェーン上のクリーンアップ・トーンシェイピング段
let masterTrebleShelf: BiquadFilterNode | null = null;
let masterCleanupHighpass: BiquadFilterNode | null = null;
let pleasantReverb: PleasantReverbBus | null = null;

const activeNodes: StoppableNode[] = [];

let resumeRetryCount = 0;
const MAX_RESUME_RETRIES = 3;

let onAudioInterrupted: (() => void) | null = null;

let defaultInstrumentId: InstrumentId = "rush";
let sequenceInstrumentId: InstrumentId = "rush";
let sequenceUseVoiceLeading = true;

/** UI の Tone 選択と同期（playChord のデフォルト音色） */
export function setPlaybackInstrument(id: InstrumentId): void {
  defaultInstrumentId = id;
  sequenceInstrumentId = id;
}

export interface PlayChordOptions {
  instrumentId?: InstrumentId;
  useVoiceLeading?: boolean;
}

function clampScheduleTime(ctx: AudioContext, time?: number): number {
  if (time !== undefined) {
    return Math.max(time, ctx.currentTime + 0.005);
  }
  return ctx.currentTime;
}

function trackNode(node: StoppableNode) {
  activeNodes.push(node);
}

function stopAllActiveNodes() {
  const now = audioContext?.currentTime ?? 0;
  activeNodes.forEach((node) => {
    try {
      node.stop(now + 0.01);
    } catch {
      /* already stopped */
    }
  });
  activeNodes.length = 0;
}

function getAudioContext(): AudioContext {
  if (!audioContext) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    audioContext = new AudioCtx();

    limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-14, audioContext.currentTime);
    limiter.knee.setValueAtTime(8, audioContext.currentTime);
    limiter.ratio.setValueAtTime(2.5, audioContext.currentTime);
    limiter.attack.setValueAtTime(0.008, audioContext.currentTime);
    limiter.release.setValueAtTime(0.22, audioContext.currentTime);

    masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(0.34, audioContext.currentTime);

    drumGain = audioContext.createGain();
    drumGain.gain.setValueAtTime(0.6, audioContext.currentTime);

    // v2.6: 共有マスターチェーン
    // (voice / drum / reverb wet) → masterGain → trebleShelf(-4dB@5kHz)
    //   → cleanupHighpass(80Hz HPF) → limiter → destination
    masterTrebleShelf = createTrebleShelf(audioContext, -4);
    masterCleanupHighpass = createCleanupHighpass(audioContext);

    masterGain.connect(masterTrebleShelf);
    masterTrebleShelf.connect(masterCleanupHighpass);
    masterCleanupHighpass.connect(limiter);

    // ドラムは低域成分が重要だが、80Hz 以下のサブブーストは依然不要なので
    // クリーンアップ HPF を経由してリミッターへ送る（mastergain は通さない）
    drumGain.connect(masterCleanupHighpass);

    limiter.connect(audioContext.destination);

    pleasantReverb = createPleasantReverbBus(audioContext, 0.24);
    // reverb wet も masterGain 経由で trebleShelf / cleanupHPF を通過する
    pleasantReverb.wet.connect(masterGain);

    audioContext.addEventListener("statechange", handleContextStateChange);
  }
  return audioContext;
}

function handleContextStateChange() {
  if (!audioContext) return;
  const state = audioContext.state;
  if (state === "suspended" || state === "interrupted") {
    if (isPlaying && !isExportingVideo) {
      stopPaletteSequenceInternal(false);
      onAudioInterrupted?.();
    }
  }
  if (state === "running") {
    resumeRetryCount = 0;
  }
}

function connectToMaster(node: AudioNode, isDrum = false) {
  const target = isDrum ? drumGain : masterGain;
  if (target) {
    node.connect(target);
  } else {
    node.connect(getAudioContext().destination);
  }
}

export function getAudioContextState(): AudioContextState | "uninitialized" {
  return audioContext?.state ?? "uninitialized";
}

export function setAudioInterruptedCallback(cb: (() => void) | null) {
  onAudioInterrupted = cb;
}

export function installAudioLifecycleHandlers(): () => void {
  const onVisibility = () => {
    if (isExportingVideo) return;
    if (document.visibilityState === "hidden" && isPlaying) {
      stopPaletteSequenceInternal(false);
    }
    if (document.visibilityState === "visible" && audioContext?.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
  };

  const onPageHide = () => {
    if (isExportingVideo) return;
    stopPaletteSequenceInternal(false);
    resetAudioEngine();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  };
}

export async function playChord(
  chord: PaletteChord,
  durationSec: number = 0.8,
  time?: number,
  options?: PlayChordOptions
): Promise<void> {
  const ctx = getAudioContext();

  if (ctx.state === "suspended" || ctx.state === "interrupted") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }

  const now = clampScheduleTime(ctx, time);
  const instrumentId = options?.instrumentId ?? defaultInstrumentId;
  const useVoiceLeading = options?.useVoiceLeading ?? false;
  const preset = getInstrumentPreset(instrumentId);

  const notes = voiceChordForPlayback(chord, { useVoiceLeading });
  const bassMidi = Math.min(...notes);
  const gainScale = 1 / Math.sqrt(notes.length);

  const reverbInput = pleasantReverb?.input ?? null;

  notes.forEach((note) => {
    const isBass = note === bassMidi;
    scheduleNoteVoice(
      ctx,
      note,
      now,
      durationSec,
      preset,
      (node) => connectToMaster(node),
      reverbInput ? (send) => send.connect(reverbInput) : null,
      isBass,
      gainScale,
      trackNode
    );
  });
}

// === v2.7 (Sprint 12): 808 系パーカッション合成 ===
//
// 全パーカッションは `connectToMaster(node, true)` 経由で drumGain → 80Hz HPF
// → limiter のドラムバスに接続される。マスターチェーン（v2.6）には触らない。

/** ホワイトノイズ AudioBuffer（指定秒数）。 */
function createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Kick (TR-808 系)
 * - sine osc、ピッチ envelope 150Hz → 50Hz exp 80ms → 終端 0.01
 * - アンプ envelope decay 450ms
 * - 任意でクリック用 triangle 5ms を加算
 *
 * @param velocity 1.0 = 通常、0.4〜0.5 = ゴースト
 */
function playKick(ctx: AudioContext, time: number, velocity = 1.0) {
  const t = clampScheduleTime(ctx, time);
  const decay = 0.45; // 450ms

  // ピッチエンベロープ付きの sine 本体
  const osc = ctx.createOscillator();
  osc.type = "sine";
  const gain = ctx.createGain();
  osc.connect(gain);
  connectToMaster(gain, true);

  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(50, t + 0.08);
  osc.frequency.exponentialRampToValueAtTime(0.01, t + decay);

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.55 * velocity, t + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.001, t + decay);

  osc.start(t);
  osc.stop(t + decay + 0.02);
  trackNode(osc);

  // クリック（triangle 5ms）
  const click = ctx.createOscillator();
  click.type = "triangle";
  click.frequency.setValueAtTime(1800, t);
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.0001, t);
  clickGain.gain.exponentialRampToValueAtTime(0.12 * velocity, t + 0.0008);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.005);
  click.connect(clickGain);
  connectToMaster(clickGain, true);
  click.start(t);
  click.stop(t + 0.01);
  trackNode(click);
}

/**
 * Snare (TR-808 系)
 * - sine 180Hz + sine 330Hz の 2 トーン（attack 1ms / decay 80ms）
 * - バンドパスノイズ 1.5–2.5kHz / Q 0.7（decay 180ms）
 */
function playSnare(ctx: AudioContext, time: number, velocity = 1.0) {
  const t = clampScheduleTime(ctx, time);
  const toneDecay = 0.08;
  const noiseDecay = 0.18;

  // 2 つの sine トーン (180Hz, 330Hz)
  for (const freq of [180, 330]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 * velocity, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + toneDecay);
    osc.connect(g);
    connectToMaster(g, true);
    osc.start(t);
    osc.stop(t + toneDecay + 0.02);
    trackNode(osc);
  }

  // バンドパスノイズ (1.5–2.5kHz center=2kHz)
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, noiseDecay + 0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(2000, t);
  bp.Q.setValueAtTime(0.7, t);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.22 * velocity, t + 0.001);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + noiseDecay);
  noise.connect(bp);
  bp.connect(ng);
  connectToMaster(ng, true);
  noise.start(t);
  noise.stop(t + noiseDecay + 0.05);
  trackNode(noise);
}

/**
 * 6 矩形 osc + noise の共有 HiHat コア。
 * Closed と Open は decay の長さのみで差別化する。
 *
 * 基準 ~320Hz、ratios = [2, 3, 4.16, 5.43, 6.79, 8.21]（非調和）
 * HPF 7kHz を全体にかける。
 */
function playHiHatCore(
  ctx: AudioContext,
  time: number,
  decay: number,
  velocity: number
) {
  const t = clampScheduleTime(ctx, time);
  const base = 320;
  const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];

  // 集約ゲインノードに 6 osc + noise をミックスし、最後に HPF 7kHz を通す
  const mixer = ctx.createGain();
  mixer.gain.setValueAtTime(1, t);

  for (const r of ratios) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(base * r, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06 * velocity, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g);
    g.connect(mixer);
    osc.start(t);
    osc.stop(t + decay + 0.02);
    trackNode(osc);
  }

  // 補助ノイズ（金属感の擦れ）
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, decay + 0.02);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.04 * velocity, t + 0.001);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  noise.connect(ng);
  ng.connect(mixer);
  noise.start(t);
  noise.stop(t + decay + 0.05);
  trackNode(noise);

  // HPF 7kHz
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.setValueAtTime(7000, t);
  mixer.connect(hpf);
  connectToMaster(hpf, true);
}

/** HiHat Closed: decay 60ms（Open と同じコアを共有） */
function playHiHatClosed(ctx: AudioContext, time: number, velocity = 1.0) {
  playHiHatCore(ctx, time, 0.06, velocity);
}

/** HiHat Open: decay 350ms（Closed と同じコアを共有） */
function playHiHatOpen(ctx: AudioContext, time: number, velocity = 1.0) {
  playHiHatCore(ctx, time, 0.35, velocity);
}

/**
 * Clap (TR-808 系)
 * - ノイズ × 3 短バースト (0ms / 10ms / 20ms、各 decay 20ms)
 * - 加えて長め 1 本 (40ms ピーク、decay 200ms)
 * - バンドパス 1.2–1.5kHz / Q 1.0
 *
 * v2.7: 7 種以上のパーカッションを揃える要件に従い実装。
 * 5 ジャンルの基本パターンでは現状未使用だが、ユーザー試聴用にエクスポートしておく。
 */
export function playClap(ctx: AudioContext, time: number, velocity = 1.0) {
  const t = clampScheduleTime(ctx, time);

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(1350, t);
  bp.Q.setValueAtTime(1.0, t);
  connectToMaster(bp, true);

  // 3 短バースト
  for (const offset of [0, 0.01, 0.02]) {
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 0.03);
    const g = ctx.createGain();
    const start = t + offset;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.28 * velocity, start + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.02);
    noise.connect(g);
    g.connect(bp);
    noise.start(start);
    noise.stop(start + 0.03);
    trackNode(noise);
  }

  // 長め 1 本（40ms にピーク、200ms decay）
  const longNoise = ctx.createBufferSource();
  longNoise.buffer = createNoiseBuffer(ctx, 0.25);
  const lg = ctx.createGain();
  const longStart = t + 0.03;
  lg.gain.setValueAtTime(0.0001, longStart);
  lg.gain.exponentialRampToValueAtTime(0.18 * velocity, longStart + 0.01);
  lg.gain.exponentialRampToValueAtTime(0.0001, longStart + 0.2);
  longNoise.connect(lg);
  lg.connect(bp);
  longNoise.start(longStart);
  longNoise.stop(longStart + 0.25);
  trackNode(longNoise);
}

/**
 * Tom (TR-808 系)
 * - sine osc、ピッチ envelope 200Hz → 80Hz exp 100ms
 * - decay 250ms、ローパス 800Hz
 */
export function playTom(ctx: AudioContext, time: number, velocity = 1.0) {
  const t = clampScheduleTime(ctx, time);
  const decay = 0.25;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.1);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(800, t);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35 * velocity, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);

  osc.connect(lp);
  lp.connect(g);
  connectToMaster(g, true);

  osc.start(t);
  osc.stop(t + decay + 0.02);
  trackNode(osc);
}

/**
 * Rim shot (TR-808 系)
 * - triangle 1.6kHz 短音 + noise 短バースト
 * - decay 40ms、HPF 1kHz
 */
export function playRim(ctx: AudioContext, time: number, velocity = 1.0) {
  const t = clampScheduleTime(ctx, time);
  const decay = 0.04;

  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.setValueAtTime(1000, t);
  connectToMaster(hpf, true);

  // triangle 1.6kHz
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(1600, t);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.25 * velocity, t + 0.001);
  og.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.connect(og);
  og.connect(hpf);
  osc.start(t);
  osc.stop(t + decay + 0.02);
  trackNode(osc);

  // noise 短バースト
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, decay + 0.02);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.12 * velocity, t + 0.001);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  noise.connect(ng);
  ng.connect(hpf);
  noise.start(t);
  noise.stop(t + decay + 0.05);
  trackNode(noise);
}

/**
 * Cowbell (TR-808 系)
 * - 矩形 800Hz + 矩形 540Hz の混合
 * - decay 200ms、バンドパス 800Hz / Q 2.0
 */
export function playCowbell(ctx: AudioContext, time: number, velocity = 1.0) {
  const t = clampScheduleTime(ctx, time);
  const decay = 0.2;

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(800, t);
  bp.Q.setValueAtTime(2.0, t);
  connectToMaster(bp, true);

  for (const freq of [800, 540]) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * velocity, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g);
    g.connect(bp);
    osc.start(t);
    osc.stop(t + decay + 0.02);
    trackNode(osc);
  }
}

let sequenceTimerId: number | null = null;
let nextNoteTime = 0;
let current16thNote = 0;
let currentChordIndex = 0;
let nextChordTick = 0;
let isPlaying = false;
let sequencePalette: PaletteChord[] = [];
let sequenceBpm = 120;
let sequencePattern: DrumPattern = "none";
let sequenceBeat: BeatPattern = "none";
let sequenceOnStop: (() => void) | null = null;
let sequenceOnTick: ((index: number) => void) | null = null;
let sequenceIsLooping = false;
let isExportingVideo = false;
let captureDestination: MediaStreamAudioDestinationNode | null = null;

export function setExportingVideo(flag: boolean): void {
  isExportingVideo = flag;
}

export function isExportingVideoActive(): boolean {
  return isExportingVideo;
}

export function attachCaptureDestination(): MediaStream {
  const ctx = getAudioContext();
  if (captureDestination) {
    return captureDestination.stream;
  }
  captureDestination = ctx.createMediaStreamDestination();
  if (limiter) {
    try {
      limiter.connect(captureDestination);
    } catch {
      /* ignore */
    }
  }
  return captureDestination.stream;
}

export function detachCaptureDestination(): void {
  cleanupCapture();
}

/**
 * v2.8 (Sprint 13): Drum 軸（ジャンル）と Beat 軸（ハイハット密度）の 2 軸を組み合わせて発音する。
 *
 * - beatNumber は 16th 単位（1 小節 = 16 ステップ）
 * - step = beatNumber % 16 で小節内位置を取得
 * - スウィング: 16th 裏ステップを規定量だけ後方にシフト（Beat 側のハイハットにも適用）
 *   - 三連符フィール（jazz / soul）: step % 4 === 3 のとき + sixteenthSec * (1/3)
 *   - 軽いスウィング（funk）: step % 2 === 1 のとき + sixteenthSec * (1/6)
 *   - ストレート（rock / pop）: 遅延なし
 * - ゴーストノートはベロシティ 0.45
 *
 * Drum 側は Kick / Snare / ジャンル特有のパーカッション（Funk Open Hat）のみ。
 * ハイハット Closed は Beat 軸が担当し、密度（4/8/16）を制御する。
 *
 * 同一ステップで Funk の Open Hat と Beat の Closed が衝突する場合は **Open を優先**。
 */
function shouldPlayBeatHihat(step: number, beat: BeatPattern): boolean {
  switch (beat) {
    case "none":
      return false;
    case "4beat":
      return step % 4 === 0;
    case "8beat":
      return step % 2 === 0;
    case "16beat":
      return true;
  }
}

function scheduleNote(beatNumber: number, time: number) {
  const ctx = getAudioContext();

  const step = ((beatNumber % 16) + 16) % 16;
  const sixteenthSec = 60 / sequenceBpm / 4;
  const GHOST = 0.45;

  // ジャンルごとのスウィング量（裏 16th のみ後方シフト）。Beat ハイハットにも共通適用。
  let swingDelay = 0;
  if (sequencePattern === "jazz" || sequencePattern === "soul") {
    if (step % 4 === 3) swingDelay = sixteenthSec * (1 / 3);
  } else if (sequencePattern === "funk") {
    if (step % 2 === 1) swingDelay = sixteenthSec * (1 / 6);
  }
  const swungTime = time + swingDelay;

  // === Drum 軸: Kick / Snare / ジャンル特有のパーカッション ===
  if (sequencePattern === "rock") {
    // Kick: 0, 4, 8, 12 (4 分)
    if (step % 4 === 0) playKick(ctx, time);
    // Snare: 4, 12 (バックビート)
    if (step === 4 || step === 12) playSnare(ctx, time);
  } else if (sequencePattern === "jazz") {
    // Kick: 0 のみ
    if (step === 0) playKick(ctx, time);
    // Snare ゴースト: 4, 12（ブラシ感）
    if (step === 4 || step === 12) playSnare(ctx, time, GHOST);
  } else if (sequencePattern === "funk") {
    // Kick: 0, 6, 8, 14
    if (step === 0 || step === 6 || step === 8 || step === 14) {
      playKick(ctx, time);
    }
    // Snare: 4, 12 + ゴースト 10
    if (step === 4 || step === 12) playSnare(ctx, time);
    if (step === 10) playSnare(ctx, time, GHOST);
  } else if (sequencePattern === "pop") {
    // Kick: 0, 8 のみ
    if (step % 8 === 0) playKick(ctx, time);
    // Snare: 4, 12
    if (step === 4 || step === 12) playSnare(ctx, time);
  } else if (sequencePattern === "soul") {
    // Kick: 0, 10（ハーフタイム）
    if (step === 0 || step === 10) playKick(ctx, time);
    // Snare: 8 (バックビート 1 回) + ゴースト 14
    if (step === 8) playSnare(ctx, time);
    if (step === 14) playSnare(ctx, time, GHOST);
  }

  // === Beat 軸: ハイハットの密度制御 + Funk の Open Hat 衝突調停 ===
  // Drum=funk の step 2, 10 は Open Hat（特徴音）を Drum 側として常に発音し、
  // 同タイミングの Beat Closed はスキップして Open を優先する。
  const funkOpenStep =
    sequencePattern === "funk" && (step === 2 || step === 10);
  if (funkOpenStep) {
    playHiHatOpen(ctx, swungTime);
  } else if (shouldPlayBeatHihat(step, sequenceBeat)) {
    // Pop は Beat ハイハットを控えめに（velocity 0.55）。Sprint 12 までの「Pop=控えめ感」を継承。
    const hihatVelocity = sequencePattern === "pop" ? 0.55 : 1.0;
    playHiHatClosed(ctx, swungTime, hihatVelocity);
  }

  if (beatNumber === nextChordTick) {
    if (currentChordIndex < sequencePalette.length) {
      sequenceOnTick?.(currentChordIndex);
      const chord = sequencePalette[currentChordIndex];
      const chordBeats = chord.beats || 2;
      const sustainSec = (60 / sequenceBpm) * chordBeats;

      void playChord(chord, sustainSec, time, {
        instrumentId: sequenceInstrumentId,
        useVoiceLeading: sequenceUseVoiceLeading,
      });

      nextChordTick += chordBeats * 4;
      currentChordIndex++;
    }
  }
}

function nextNote() {
  const secondsPerBeat = 60.0 / sequenceBpm;
  nextNoteTime += 0.25 * secondsPerBeat;
  current16thNote++;
}

function scheduler() {
  const ctx = getAudioContext();

  if (ctx.state === "suspended" || ctx.state === "interrupted") {
    resumeRetryCount++;
    if (resumeRetryCount > MAX_RESUME_RETRIES) {
      stopPaletteSequenceInternal(true);
      onAudioInterrupted?.();
      return;
    }
    ctx.resume().catch(() => {});
    if (isPlaying) {
      sequenceTimerId = window.setTimeout(scheduler, 200);
    }
    return;
  }

  if (nextNoteTime < ctx.currentTime) {
    nextNoteTime = ctx.currentTime + 0.05;
  }

  while (nextNoteTime < ctx.currentTime + 0.2) {
    scheduleNote(current16thNote, nextNoteTime);
    nextNote();

    if (currentChordIndex >= sequencePalette.length && current16thNote >= nextChordTick) {
      if (sequenceIsLooping) {
        current16thNote = 0;
        currentChordIndex = 0;
        nextChordTick = 0;
        resetVoicingState();
      } else {
        const lastChord = sequencePalette[sequencePalette.length - 1];
        const lastBeats = lastChord ? lastChord.beats || 2 : 2;
        const sustainSec = (60 / sequenceBpm) * lastBeats;

        window.setTimeout(() => {
          if (isPlaying && sequenceOnStop) {
            sequenceOnStop();
          }
          stopPaletteSequenceInternal(true);
        }, sustainSec * 1000);
        return;
      }
    }
  }

  if (isPlaying) {
    sequenceTimerId = window.setTimeout(scheduler, 50);
  }
}

function stopPaletteSequenceInternal(notifyStop: boolean) {
  isPlaying = false;
  if (sequenceTimerId !== null) {
    window.clearTimeout(sequenceTimerId);
    sequenceTimerId = null;
  }
  stopAllActiveNodes();
  resetVoicingState();
  if (notifyStop && sequenceOnStop) {
    sequenceOnStop();
    sequenceOnStop = null;
  }
}

export interface PlayPaletteSequenceOptions {
  instrumentId?: InstrumentId;
  /** v2.8 (Sprint 13): Beat 軸（ハイハット密度）。省略時は "none" */
  beatPattern?: BeatPattern;
}

export function playPaletteSequence(
  palette: PaletteChord[],
  bpm: number,
  pattern: DrumPattern,
  isLooping: boolean,
  onStop: () => void,
  onTick: (index: number) => void,
  options?: PlayPaletteSequenceOptions
): void {
  const ctx = getAudioContext();
  if (ctx.state === "suspended" || ctx.state === "interrupted") {
    ctx.resume().catch(() => {});
  }

  stopPaletteSequenceInternal(false);
  resumeRetryCount = 0;
  resetVoicingState();

  if (palette.length === 0) {
    onStop();
    return;
  }

  sequencePalette = palette;
  sequenceBpm = bpm;
  sequencePattern = pattern;
  sequenceBeat = options?.beatPattern ?? "none";
  sequenceOnStop = onStop;
  sequenceOnTick = onTick;
  sequenceIsLooping = isLooping;
  sequenceInstrumentId = options?.instrumentId ?? defaultInstrumentId;
  sequenceUseVoiceLeading = true;

  current16thNote = 0;
  currentChordIndex = 0;
  nextChordTick = 0;
  nextNoteTime = ctx.currentTime + 0.1;
  isPlaying = true;

  scheduler();
}

export function stopPaletteSequence(): void {
  stopPaletteSequenceInternal(false);
}

function cleanupCapture() {
  if (limiter && captureDestination) {
    try {
      limiter.disconnect(captureDestination);
    } catch {
      /* ignore */
    }
  }
  captureDestination = null;
}

export function resetAudioEngine(): void {
  isExportingVideo = false;
  cleanupCapture();
  stopPaletteSequenceInternal(false);
  stopAllActiveNodes();
  resetVoicingState();
  if (pleasantReverb) {
    pleasantReverb.dispose();
    pleasantReverb = null;
  }
  if (audioContext) {
    audioContext.removeEventListener("statechange", handleContextStateChange);
    audioContext.close().catch(() => {});
    audioContext = null;
    masterGain = null;
    drumGain = null;
    limiter = null;
    masterTrebleShelf = null;
    masterCleanupHighpass = null;
  }
}
