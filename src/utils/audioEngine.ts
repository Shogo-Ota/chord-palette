// === Web Audio API コードプレビューエンジン ===
// v2.3.0: 画面録画・iOS suspend 対応強化版

import type { PaletteChord } from "./musicTheory";

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let drumGain: GainNode | null = null;
let limiter: DynamicsCompressorNode | null = null;

type StoppableNode = { stop: (when?: number) => void };
const activeNodes: StoppableNode[] = [];

let resumeRetryCount = 0;
const MAX_RESUME_RETRIES = 3;

let onAudioInterrupted: (() => void) | null = null;

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
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    audioContext = new AudioCtx();

    limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-6, audioContext.currentTime);
    limiter.knee.setValueAtTime(6, audioContext.currentTime);
    limiter.ratio.setValueAtTime(2, audioContext.currentTime);
    limiter.attack.setValueAtTime(0.010, audioContext.currentTime);
    limiter.release.setValueAtTime(0.25, audioContext.currentTime);

    masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(0.25, audioContext.currentTime);

    drumGain = audioContext.createGain();
    drumGain.gain.setValueAtTime(0.6, audioContext.currentTime);

    masterGain.connect(limiter);
    drumGain.connect(limiter);
    limiter.connect(audioContext.destination);

    audioContext.addEventListener("statechange", handleContextStateChange);
  }
  return audioContext;
}

function handleContextStateChange() {
  if (!audioContext) return;
  const state = audioContext.state;
  if (state === "suspended" || state === "interrupted") {
    if (isPlaying) {
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

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function getAudioContextState(): AudioContextState | "uninitialized" {
  return audioContext?.state ?? "uninitialized";
}

export function setAudioInterruptedCallback(cb: (() => void) | null) {
  onAudioInterrupted = cb;
}

export function installAudioLifecycleHandlers(): () => void {
  const onVisibility = () => {
    if (document.visibilityState === "hidden" && isPlaying) {
      stopPaletteSequenceInternal(false);
    }
    if (document.visibilityState === "visible" && audioContext?.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
  };

  const onPageHide = () => {
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

export async function playChord(chord: PaletteChord, durationSec: number = 0.8, time?: number): Promise<void> {
  const ctx = getAudioContext();

  if (ctx.state === "suspended" || ctx.state === "interrupted") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }

  const now = clampScheduleTime(ctx, time);

  const notes = chord.intervals.map((interval, index) => {
    let note = chord.rootNote + interval;
    if (index > 0) {
      while (note >= 72) {
        note -= 12;
      }
    }
    return note;
  });

  const bass = chord.bassNoteOverride !== undefined ? chord.bassNoteOverride : chord.rootNote;
  notes.push(bass - 12);

  const duration = durationSec;
  const attack = 0.015;
  const decay = 0.1;
  const sustain = 0.5;
  const release = 0.08;

  const noteCount = notes.length;
  const gainScale = 1 / Math.sqrt(noteCount);

  notes.forEach((note, i) => {
    const freq = midiToFreq(note);
    const isBass = i === notes.length - 1;

    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq, now);

    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(freq * 2.0, now);

    const osc1Gain = ctx.createGain();
    const osc2Gain = ctx.createGain();
    osc1Gain.gain.setValueAtTime(0.8, now);
    osc2Gain.gain.setValueAtTime(0.15, now);

    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(isBass ? 500 : 3500, now);
    filter.Q.setValueAtTime(0.7, now);

    const baseGain = isBass ? 0.18 : 0.12;
    const maxGain = baseGain * gainScale;

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(maxGain, now + attack);
    gainNode.gain.exponentialRampToValueAtTime(maxGain * sustain, now + attack + decay);
    gainNode.gain.setValueAtTime(maxGain * sustain, now + duration - release);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc1.connect(osc1Gain);
    osc2.connect(osc2Gain);
    osc1Gain.connect(gainNode);
    osc2Gain.connect(gainNode);

    gainNode.connect(filter);
    connectToMaster(filter);

    const stopAt = now + duration + 0.15;
    osc1.start(now);
    osc1.stop(stopAt);
    osc2.start(now);
    osc2.stop(stopAt);
    trackNode(osc1);
    trackNode(osc2);
  });
}

function playKick(ctx: AudioContext, time: number) {
  const t = clampScheduleTime(ctx, time);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  connectToMaster(gain, true);

  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
  osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.5);

  gain.gain.setValueAtTime(0.35, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);

  osc.start(t);
  osc.stop(t + 0.5);
  trackNode(osc);
}

function playSnare(ctx: AudioContext, time: number) {
  const t = clampScheduleTime(ctx, time);
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(180, t);
  osc.connect(oscGain);
  connectToMaster(oscGain, true);
  oscGain.gain.setValueAtTime(0.12, t);
  oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
  osc.start(t);
  osc.stop(t + 0.1);
  trackNode(osc);

  const bufferSize = Math.floor(ctx.sampleRate * 0.15);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.setValueAtTime(2000, t);
  noiseFilter.Q.setValueAtTime(0.8, t);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.12, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  connectToMaster(noiseGain, true);

  noise.start(t);
  noise.stop(t + 0.15);
  trackNode(noise);
}

function playHiHat(ctx: AudioContext, time: number) {
  const t = clampScheduleTime(ctx, time);
  const bufferSize = Math.floor(ctx.sampleRate * 0.05);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(7000, t);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.04, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);

  noise.connect(filter);
  filter.connect(gain);
  connectToMaster(gain, true);

  noise.start(t);
  noise.stop(t + 0.05);
  trackNode(noise);
}

let sequenceTimerId: number | null = null;
let nextNoteTime = 0;
let current16thNote = 0;
let currentChordIndex = 0;
let nextChordTick = 0;
let isPlaying = false;
let sequencePalette: PaletteChord[] = [];
let sequenceBpm = 120;
let sequencePattern: "none" | "4beat" | "8beat" | "16beat" = "none";
let sequenceOnStop: (() => void) | null = null;
let sequenceOnTick: ((index: number) => void) | null = null;
let sequenceIsLooping = false;

function scheduleNote(beatNumber: number, time: number) {
  const ctx = getAudioContext();

  if (sequencePattern === "4beat") {
    if (beatNumber % 4 === 0) {
      playKick(ctx, time);
      playHiHat(ctx, time);
    }
  } else if (sequencePattern === "8beat") {
    if (beatNumber % 2 === 0) {
      playHiHat(ctx, time);
    }
    if (beatNumber % 16 === 0 || beatNumber % 16 === 8) {
      playKick(ctx, time);
    }
    if (beatNumber % 16 === 4 || beatNumber % 16 === 12) {
      playSnare(ctx, time);
    }
  } else if (sequencePattern === "16beat") {
    playHiHat(ctx, time);
    if (beatNumber % 16 === 0 || beatNumber % 16 === 10) {
      playKick(ctx, time);
    }
    if (beatNumber % 16 === 4 || beatNumber % 16 === 12) {
      playSnare(ctx, time);
    }
  }

  if (beatNumber === nextChordTick) {
    if (currentChordIndex < sequencePalette.length) {
      sequenceOnTick?.(currentChordIndex);
      const chord = sequencePalette[currentChordIndex];
      const chordBeats = chord.beats || 2;
      const sustainSec = (60 / sequenceBpm) * chordBeats;

      void playChord(chord, sustainSec, time);

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
      } else {
        const lastChord = sequencePalette[sequencePalette.length - 1];
        const lastBeats = lastChord ? (lastChord.beats || 2) : 2;
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
  if (notifyStop && sequenceOnStop) {
    sequenceOnStop();
    sequenceOnStop = null;
  }
}

export function playPaletteSequence(
  palette: PaletteChord[],
  bpm: number,
  pattern: "none" | "4beat" | "8beat" | "16beat",
  isLooping: boolean,
  onStop: () => void,
  onTick: (index: number) => void
): void {
  const ctx = getAudioContext();
  if (ctx.state === "suspended" || ctx.state === "interrupted") {
    ctx.resume().catch(() => {});
  }

  stopPaletteSequenceInternal(false);
  resumeRetryCount = 0;

  if (palette.length === 0) {
    onStop();
    return;
  }

  sequencePalette = palette;
  sequenceBpm = bpm;
  sequencePattern = pattern;
  sequenceOnStop = onStop;
  sequenceOnTick = onTick;
  sequenceIsLooping = isLooping;

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

export function resetAudioEngine(): void {
  stopPaletteSequenceInternal(false);
  stopAllActiveNodes();
  if (audioContext) {
    audioContext.removeEventListener("statechange", handleContextStateChange);
    audioContext.close().catch(() => {});
    audioContext = null;
    masterGain = null;
    drumGain = null;
    limiter = null;
  }
}
