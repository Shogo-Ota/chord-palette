import {
  NATURAL_HARMONIC_GAINS,
  PLEASANT_CHORUS_CENTS,
  centsToRatio,
  getSoftClipCurve,
} from "./pleasantAcoustics";

export type InstrumentId = "rush" | "senseEp" | "upright";

export type FilterMode = "lowpass" | "bandpass";

export interface OscillatorSpec {
  type: OscillatorType;
  ratio: number;
  gain: number;
  detuneCents?: number;
}

export interface InstrumentPreset {
  id: InstrumentId;
  label: string;
  description: string;
  oscillators: OscillatorSpec[];
  filterMode: FilterMode;
  filterCutoffBass: number;
  filterCutoffTreble: number;
  filterQ: number;
  trebleBrightnessDb: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  gainMultiplier: number;
  bassGainRatio: number;
  /** 微デチューン・コーラス（心地よいうねり） */
  chorusDepth: number;
  /** 共有リバーブへのセンド量 */
  reverbSend: number;
  useSoftClip: boolean;
  tremoloHz?: number;
  tremoloDepth?: number;
}

function naturalHarmonicOscillators(
  maxPartial: number,
  scale = 1
): OscillatorSpec[] {
  const specs: OscillatorSpec[] = [];
  for (let i = 0; i <= maxPartial; i++) {
    if (NATURAL_HARMONIC_GAINS[i] === undefined) break;
    specs.push({
      type: "sine",
      ratio: i + 1,
      gain: NATURAL_HARMONIC_GAINS[i] * scale,
    });
  }
  return specs;
}

/**
 * v2.6 で再チューニングした 3 プリセット。
 * 目標: 200Hz〜4kHz にエネルギーを集中させ、最低 3 指標で値が異なるよう差別化する。
 *
 * 差別化指標:
 *   filterCutoffTreble: 5800 (Rush) / 5000 (SenseElepix) / 3900 (Upright)
 *   attack:             0.008 (Rush) / 0.015 (SenseElepix) / 0.010 (Upright)
 *   decay:              0.14  (Rush) / 0.12  (SenseElepix) / 0.20  (Upright)
 *   release:            0.14  (Rush) / 0.12  (SenseElepix) / 0.18  (Upright)
 *   chorusDepth:        1.0   (Rush) / 0.5   (SenseElepix) / 0.4   (Upright)
 *   reverbSend:         0.28  (Rush) / 0.40  (SenseElepix) / 0.18  (Upright)
 */
export const INSTRUMENT_PRESETS: Record<InstrumentId, InstrumentPreset> = {
  rush: {
    id: "rush",
    label: "Rush",
    description: "明るく前に出るポップピアノ（J-POP / シティポップ）",
    // 2〜4 次倍音を厚めにし、ポップピアノらしいキャラクターを強調
    oscillators: naturalHarmonicOscillators(6, 0.15),
    filterMode: "lowpass",
    filterCutoffBass: 780,
    filterCutoffTreble: 5800,
    filterQ: 0.55,
    // 高域 shelf は共有マスターでも -4dB 入るので、ここは控えめに +3dB
    trebleBrightnessDb: 3,
    attack: 0.008,
    decay: 0.14,
    sustain: 0.58,
    release: 0.14,
    gainMultiplier: 1.1,
    bassGainRatio: 1.18,
    chorusDepth: 1,
    reverbSend: 0.28,
    useSoftClip: true,
  },
  senseEp: {
    id: "senseEp",
    label: "Synth El. Piano",
    description: "上品で透明感のあるエレピ寄り（バラード / アンビエント）",
    // 基音 + 2 次中心、4 次以上控えめで透明感を出す
    oscillators: [
      { type: "sine", ratio: 1, gain: 0.78 },
      { type: "triangle", ratio: 2, gain: 0.3 },
      { type: "sine", ratio: 3, gain: 0.1 },
      { type: "sine", ratio: 4, gain: 0.04 },
    ],
    filterMode: "lowpass",
    filterCutoffBass: 720,
    filterCutoffTreble: 5000,
    // 中域 1〜2kHz をわずかに凹ませる代わりに Q をやや上げ、上品な質感を作る
    filterQ: 0.65,
    trebleBrightnessDb: 2.5,
    // アタックを柔らかく（タッチが優しい）
    attack: 0.015,
    decay: 0.12,
    sustain: 0.55,
    release: 0.12,
    gainMultiplier: 0.98,
    bassGainRatio: 1.2,
    // コーラスは控えめ、リバーブセンドは最大で広い余韻
    chorusDepth: 0.5,
    reverbSend: 0.4,
    useSoftClip: true,
  },
  upright: {
    id: "upright",
    label: "Upright",
    description: "暗くウォームなアップライト（ジャズ / ローファイ）",
    // 高次倍音を弱め、低中域の厚みを残す
    oscillators: [
      { type: "sine", ratio: 1, gain: 0.72 },
      { type: "triangle", ratio: 2, gain: 0.16 },
      { type: "sine", ratio: 3, gain: 0.07 },
      { type: "sine", ratio: 4, gain: 0.025 },
    ],
    filterMode: "lowpass",
    filterCutoffBass: 620,
    // 高域 LP を 3900Hz に下げ、Rush より明確に暗く
    filterCutoffTreble: 3900,
    filterQ: 0.7,
    // 高域 shelf も僅か（暗めの基調を保つ）
    trebleBrightnessDb: 1.5,
    attack: 0.01,
    // 長めの decay / release でウォームなアップライト感
    decay: 0.2,
    sustain: 0.48,
    release: 0.18,
    gainMultiplier: 1.06,
    // 低中域（200〜500Hz）の厚みを足すためベース比率を高め
    bassGainRatio: 1.35,
    chorusDepth: 0.4,
    // リバーブセンドは最少
    reverbSend: 0.18,
    useSoftClip: true,
  },
};

export const INSTRUMENT_IDS: InstrumentId[] = ["rush", "senseEp", "upright"];

const LEGACY_ID_MAP: Record<string, InstrumentId> = {
  lush: "rush",
  rush: "rush",
  synthEp: "senseEp",
  senseEp: "senseEp",
  upright: "upright",
  grand: "rush",
  rhodes: "rush",
  wurli: "rush",
};

/** localStorage 等の旧 ID を現行3種へマップ */
export function normalizeInstrumentId(value: string | undefined): InstrumentId {
  if (!value) return "rush";
  return LEGACY_ID_MAP[value] ?? "rush";
}

export function getInstrumentPreset(id: InstrumentId): InstrumentPreset {
  return INSTRUMENT_PRESETS[id];
}

export type StoppableNode = { stop: (when?: number) => void };

function spawnOscillator(
  ctx: AudioContext,
  spec: OscillatorSpec,
  freq: number,
  startTime: number,
  stopAt: number,
  gainNode: GainNode,
  trackNode: (node: StoppableNode) => void
): void {
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = spec.type;
  const detune = spec.detuneCents ?? 0;
  osc.frequency.setValueAtTime(freq * spec.ratio * centsToRatio(detune), startTime);
  oscGain.gain.setValueAtTime(spec.gain, startTime);
  osc.connect(oscGain);
  oscGain.connect(gainNode);
  osc.start(startTime);
  osc.stop(stopAt);
  trackNode(osc);
}

export function scheduleNoteVoice(
  ctx: AudioContext,
  midi: number,
  startTime: number,
  duration: number,
  preset: InstrumentPreset,
  connectDry: (node: AudioNode) => void,
  connectReverb: ((node: AudioNode) => void) | null,
  isBass: boolean,
  gainScale: number,
  trackNode: (node: StoppableNode) => void
): void {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const { attack, decay, sustain, release } = preset;
  const filterCutoff = isBass ? preset.filterCutoffBass : preset.filterCutoffTreble;

  const gainNode = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = preset.filterMode;
  filter.frequency.setValueAtTime(filterCutoff, startTime);
  filter.Q.setValueAtTime(preset.filterQ, startTime);

  const baseGain = isBass ? 0.16 * preset.bassGainRatio : 0.14;
  const maxGain = baseGain * preset.gainMultiplier * gainScale;

  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(maxGain, startTime + attack);
  gainNode.gain.exponentialRampToValueAtTime(
    Math.max(maxGain * sustain, 0.0001),
    startTime + attack + decay
  );
  gainNode.gain.setValueAtTime(maxGain * sustain, startTime + duration - release);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  const stopAt = startTime + duration + 0.2;

  let outputNode: AudioNode = gainNode;

  if (preset.tremoloHz && preset.tremoloDepth) {
    const tremGain = ctx.createGain();
    tremGain.gain.setValueAtTime(1 - preset.tremoloDepth, startTime);
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(preset.tremoloHz, startTime);
    lfoDepth.gain.setValueAtTime(preset.tremoloDepth, startTime);
    lfo.connect(lfoDepth);
    lfoDepth.connect(tremGain.gain);
    gainNode.connect(tremGain);
    outputNode = tremGain;
    lfo.start(startTime);
    lfo.stop(stopAt);
    trackNode(lfo);
  }

  const chorusGain = 0.22 * preset.chorusDepth * (isBass ? 0.5 : 1);
  const chorusCents = PLEASANT_CHORUS_CENTS;

  for (const spec of preset.oscillators) {
    spawnOscillator(ctx, spec, freq, startTime, stopAt, gainNode, trackNode);
    if (chorusGain > 0.01 && spec.ratio <= 4) {
      spawnOscillator(
        ctx,
        { ...spec, gain: spec.gain * chorusGain, detuneCents: chorusCents },
        freq,
        startTime,
        stopAt,
        gainNode,
        trackNode
      );
      spawnOscillator(
        ctx,
        { ...spec, gain: spec.gain * chorusGain, detuneCents: -chorusCents },
        freq,
        startTime,
        stopAt,
        gainNode,
        trackNode
      );
    }
  }

  outputNode.connect(filter);

  let chainEnd: AudioNode = filter;

  if (preset.useSoftClip) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = new Float32Array(getSoftClipCurve());
    shaper.oversample = "2x";
    filter.connect(shaper);
    chainEnd = shaper;
  }

  if (!isBass && preset.trebleBrightnessDb > 0) {
    const shelf = ctx.createBiquadFilter();
    shelf.type = "highshelf";
    shelf.frequency.setValueAtTime(2800, startTime);
    shelf.gain.setValueAtTime(preset.trebleBrightnessDb, startTime);
    chainEnd.connect(shelf);
    chainEnd = shelf;
  }

  // v2.6: ベース音には明示的に 80Hz HPF を入れて、共有マスター HPF と二段でモゴモゴを抑える
  if (isBass) {
    const bassHpf = ctx.createBiquadFilter();
    bassHpf.type = "highpass";
    bassHpf.frequency.setValueAtTime(80, startTime);
    bassHpf.Q.setValueAtTime(0.707, startTime);
    chainEnd.connect(bassHpf);
    chainEnd = bassHpf;
  }

  connectDry(chainEnd);

  if (connectReverb && preset.reverbSend > 0 && !isBass) {
    const send = ctx.createGain();
    send.gain.setValueAtTime(preset.reverbSend, startTime);
    chainEnd.connect(send);
    connectReverb(send);
  }
}
