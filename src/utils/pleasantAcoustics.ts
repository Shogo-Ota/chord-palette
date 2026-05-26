/**
 * 心地よい音色のための音響設計（研究に基づく要約）
 *
 * 1. ハーモニシティ — 整数比に近い倍音（2,3,4,5次）を強めると協和感が増す
 *    (Terhardt / Bowling et al.; Nature Communications 2024)
 * 2. 適度なビート — わずかなデチューン（数セント）によるゆっくりしたうねりは
 *    「少しのテクスチャ」として快く感じられることがある (Jacoby et al., MPIEA)
 * 3. ラフネス回避 — 20Hz超のビート（干渉）は不快になりやすい → デチューンは ±6〜10セント以内
 * 4. 温かみ — 低次倍音を厚く、高域は控えめ（スペクトル重心を下げる）
 * 5. 空間の厚み — 短い残響で「楽器らしさ」と満足感（ゲーム音・DAWの慣習）
 */

/** 心地よいコーラス幅（セント）。遅いビート域に収まる程度 */
export const PLEASANT_CHORUS_CENTS = 7;

/**
 * 自然倍音列の相対強度（基音〜6次）。
 * v2.6: 高次倍音（5〜6 次）をさらに弱め、200Hz〜4kHz にエネルギーを集中させる。
 */
export const NATURAL_HARMONIC_GAINS = [1, 0.52, 0.28, 0.15, 0.07, 0.035, 0.018] as const;

/**
 * v2.6: 共有マスターチェーンに使用する 80Hz HPF。
 * サブベース帯のモゴモゴ・ボワつきを除去してモバイルスピーカー上のクリア感を出す。
 * biquad 1 段、Q≈0.7（-12 dB/oct）。
 */
export function createCleanupHighpass(ctx: AudioContext): BiquadFilterNode {
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 80;
  hp.Q.value = 0.707;
  return hp;
}

/**
 * v2.6: 共有マスターチェーンに使用する 5kHz 以上の high-shelf。
 * シャリつき・歯擦音的なエッジを抑える（-4 dB 程度）。
 */
export function createTrebleShelf(ctx: AudioContext, gainDb = -4): BiquadFilterNode {
  const shelf = ctx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 5000;
  shelf.gain.value = gainDb;
  return shelf;
}

export function centsToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

let softClipCurve: Float32Array | null = null;

export function getSoftClipCurve(): Float32Array {
  if (softClipCurve) return softClipCurve;
  const samples = 256;
  const curve = new Float32Array(samples);
  const drive = 1.6;
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  softClipCurve = curve;
  return curve;
}

export interface PleasantReverbBus {
  input: GainNode;
  wet: GainNode;
  dispose: () => void;
}

/**
 * 軽量なアルゴリズム残響（モバイル向け・共有1本）
 */
export function createPleasantReverbBus(ctx: AudioContext, wetLevel = 0.2): PleasantReverbBus {
  const input = ctx.createGain();
  input.gain.value = 1;

  const wet = ctx.createGain();
  wet.gain.value = wetLevel;

  const delays = [0.031, 0.047, 0.061].map((t) => {
    const d = ctx.createDelay(0.12);
    d.delayTime.value = t;
    return d;
  });

  const feedbacks = [0.32, 0.28, 0.24].map((g) => {
    const fb = ctx.createGain();
    fb.gain.value = g;
    return fb;
  });

  const sum = ctx.createGain();
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  // v2.6: 4200Hz → 3800Hz に下げ、リバーブテイルの刺さりを抑える
  damp.frequency.value = 3800;
  damp.Q.value = 0.5;

  delays.forEach((delay, i) => {
    input.connect(delay);
    delay.connect(feedbacks[i]);
    feedbacks[i].connect(delay);
    delay.connect(sum);
  });

  sum.connect(damp);
  damp.connect(wet);

  return {
    input,
    wet,
    dispose: () => {
      try {
        input.disconnect();
        wet.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}
