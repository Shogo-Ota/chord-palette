// Sprint 12 sound-critic 数値解析スクリプト（ドラム特化版）
// audioEngine.ts の playKick/playSnare/playHiHatCore/playClap/playTom/playRim/playCowbell
// と scheduleNote() の 5 ジャンル分岐を Node.js 上で再現し、以下を客観評価する:
//
//   1) 各パーカッションの周波数スペクトル（80Hz HPF 経由後の体感低域含む）
//   2) Kick のピッチエンベロープ実測（150Hz→50Hz exp 80ms）
//   3) HiHat の倍音構成（金属的・非調和倍音であること）
//   4) 5 ジャンルパターンの 16th グリッド・タイミング（スウィング比率の客観値）
//   5) Rock vs Pop の Kick 密度差、Funk の HiHat 全開、Jazz/Soul の三連符フィール
//
// 実行: node scripts/drum-analysis.mjs

const FS = 48000;

// =============================================================================
// 1) Biquad コエフィシエント & 振幅応答
// =============================================================================
function biquadCoeffs(type, f0, Q, gainDb = 0, fs = FS) {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / fs;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case "lowpass":
      b0 = (1 - cosw0) / 2;
      b1 = 1 - cosw0;
      b2 = (1 - cosw0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosw0;
      a2 = 1 - alpha;
      break;
    case "highpass":
      b0 = (1 + cosw0) / 2;
      b1 = -(1 + cosw0);
      b2 = (1 + cosw0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosw0;
      a2 = 1 - alpha;
      break;
    case "bandpass": // constant 0 dB peak gain
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cosw0;
      a2 = 1 - alpha;
      break;
    case "highshelf": {
      const beta = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cosw0 + beta);
      b1 = -2 * A * (A - 1 + (A + 1) * cosw0);
      b2 = A * (A + 1 + (A - 1) * cosw0 - beta);
      a0 = A + 1 - (A - 1) * cosw0 + beta;
      a1 = 2 * (A - 1 - (A + 1) * cosw0);
      a2 = A + 1 - (A - 1) * cosw0 - beta;
      break;
    }
    default:
      throw new Error("unsupported biquad type: " + type);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function biquadMagnitudeDb(c, f, fs = FS) {
  const w = (2 * Math.PI * f) / fs;
  const cosw = Math.cos(w);
  const sinw = Math.sin(w);
  const cos2w = Math.cos(2 * w);
  const sin2w = Math.sin(2 * w);
  const numRe = c.b0 + c.b1 * cosw + c.b2 * cos2w;
  const numIm = -(c.b1 * sinw + c.b2 * sin2w);
  const denRe = 1 + c.a1 * cosw + c.a2 * cos2w;
  const denIm = -(c.a1 * sinw + c.a2 * sin2w);
  const mag = Math.sqrt(
    (numRe ** 2 + numIm ** 2) / (denRe ** 2 + denIm ** 2)
  );
  return 20 * Math.log10(Math.max(mag, 1e-9));
}

// =============================================================================
// 2) パーカッション合成のシミュレーション
//    各パーカッションを「代表周波数 + そのゲイン(dB) + decay 秒」のリストで返す
//    (時間領域シミュレーションは不要 — 周波数領域のピーク・帯域分布で十分)
// =============================================================================

// 共通: マスターチェーン後段（80Hz cleanup HPF）を全パーカッションが通過
const CLEANUP_HP = biquadCoeffs("highpass", 80, 0.707);

// dB to linear power
const dB = (v) => 20 * Math.log10(Math.max(v, 1e-9));

function applyChain(freq, ...chains) {
  let totalDb = 0;
  for (const c of chains) totalDb += biquadMagnitudeDb(c, freq);
  return totalDb;
}

// ----- Kick -----
// sine 150→50Hz exp 80ms (代表値として 80Hz 付近 + 50Hz テール) + click 1.8kHz
function kickPartials(velocity = 1.0) {
  // ピッチエンベロープのフェーズを 3 サンプル（150Hz, 80Hz, 50Hz）で代表
  const peak = 0.55 * velocity; // gain.gain at peak
  return {
    partials: [
      { f: 150, gainLin: peak * 0.7, decay: 0.02, label: "transient150" },
      { f: 80, gainLin: peak * 0.85, decay: 0.08, label: "body80" },
      { f: 50, gainLin: peak * 0.55, decay: 0.45, label: "tail50" },
      // click
      {
        f: 1800,
        gainLin: 0.12 * velocity,
        decay: 0.005,
        label: "click1800",
      },
    ],
    chain: [CLEANUP_HP],
    label: "Kick",
  };
}

// ----- Snare -----
// sine 180 + sine 330 (decay 80ms) + bandpass noise 2kHz Q=0.7 (decay 180ms)
function snarePartials(velocity = 1.0) {
  const tone = 0.18 * velocity;
  const noisePk = 0.22 * velocity;
  // ノイズはバンドパス 2kHz 中心 ±オクターブ で代表 4 点
  const noisePts = [1000, 1500, 2000, 2800, 4000].map((f) => ({
    f,
    gainLin:
      noisePk * Math.pow(10, biquadMagnitudeDb(biquadCoeffs("bandpass", 2000, 0.7), f) / 20),
    decay: 0.18,
    label: `noise${f}`,
  }));
  return {
    partials: [
      { f: 180, gainLin: tone, decay: 0.08, label: "tone180" },
      { f: 330, gainLin: tone, decay: 0.08, label: "tone330" },
      ...noisePts,
    ],
    chain: [CLEANUP_HP],
    label: "Snare",
  };
}

// ----- HiHat (Closed / Open 共通コア) -----
// 6 矩形 osc 非調和倍音 [2, 3, 4.16, 5.43, 6.79, 8.21] × base=320Hz
// 矩形波は奇数倍音を含む → 各 osc につき 1, 3, 5 倍音まで考慮
// + 補助ノイズ + HPF 7kHz
const HIHAT_RATIOS = [2, 3, 4.16, 5.43, 6.79, 8.21];
const HIHAT_HPF = biquadCoeffs("highpass", 7000, 0.707);
const SQUARE_HARMONICS = [
  { mul: 1, amp: 1.0 }, // fundamental
  { mul: 3, amp: 1 / 3 },
  { mul: 5, amp: 1 / 5 },
  { mul: 7, amp: 1 / 7 },
];

function hihatPartials(decay, velocity = 1.0) {
  const base = 320;
  const partials = [];
  const oscGain = 0.06 * velocity;
  for (const r of HIHAT_RATIOS) {
    const f0 = base * r;
    for (const h of SQUARE_HARMONICS) {
      const f = f0 * h.mul;
      if (f > 20000) continue;
      partials.push({
        f,
        gainLin: oscGain * h.amp,
        decay,
        label: `sq_${r}x${h.mul}`,
      });
    }
  }
  // 補助ノイズ（high-shelf 的 — 7kHz HPF 後はホワイトノイズの 7k+ 成分が残る）
  const noiseGain = 0.04 * velocity;
  [4000, 6000, 8000, 10000, 14000].forEach((f) => {
    partials.push({ f, gainLin: noiseGain * 0.5, decay, label: `noise${f}` });
  });
  return {
    partials,
    chain: [HIHAT_HPF, CLEANUP_HP],
    label: `HiHat(decay=${(decay * 1000).toFixed(0)}ms)`,
  };
}

// ----- Clap -----
function clapPartials(velocity = 1.0) {
  const bp = biquadCoeffs("bandpass", 1350, 1.0);
  // 短バーストは時間軸では 3 連発だが、周波数領域では bandpass 通過後ノイズ
  const partials = [];
  [600, 900, 1200, 1500, 1800, 2200, 3000].forEach((f) => {
    const passDb = biquadMagnitudeDb(bp, f);
    partials.push({
      f,
      gainLin: 0.28 * velocity * Math.pow(10, passDb / 20),
      decay: 0.02,
      label: `burst${f}`,
    });
    partials.push({
      f,
      gainLin: 0.18 * velocity * Math.pow(10, passDb / 20),
      decay: 0.2,
      label: `long${f}`,
    });
  });
  return { partials, chain: [CLEANUP_HP], label: "Clap" };
}

// ----- Tom -----
function tomPartials(velocity = 1.0) {
  const lp = biquadCoeffs("lowpass", 800, 0.707);
  return {
    partials: [
      {
        f: 200,
        gainLin:
          0.35 *
          velocity *
          Math.pow(10, biquadMagnitudeDb(lp, 200) / 20),
        decay: 0.05,
        label: "head200",
      },
      {
        f: 80,
        gainLin:
          0.35 *
          velocity *
          Math.pow(10, biquadMagnitudeDb(lp, 80) / 20),
        decay: 0.25,
        label: "tail80",
      },
    ],
    chain: [CLEANUP_HP],
    label: "Tom",
  };
}

// ----- Rim -----
function rimPartials(velocity = 1.0) {
  const hpf = biquadCoeffs("highpass", 1000, 0.707);
  const partials = [
    {
      f: 1600,
      gainLin:
        0.25 *
        velocity *
        Math.pow(10, biquadMagnitudeDb(hpf, 1600) / 20),
      decay: 0.04,
      label: "tri1600",
    },
  ];
  [1500, 2500, 4000, 6000, 9000].forEach((f) => {
    partials.push({
      f,
      gainLin:
        0.12 *
        velocity *
        Math.pow(10, biquadMagnitudeDb(hpf, f) / 20) *
        0.5,
      decay: 0.04,
      label: `noise${f}`,
    });
  });
  return { partials, chain: [CLEANUP_HP], label: "Rim" };
}

// ----- Cowbell -----
function cowbellPartials(velocity = 1.0) {
  const bp = biquadCoeffs("bandpass", 800, 2.0);
  return {
    partials: [
      {
        f: 800,
        gainLin:
          0.16 *
          velocity *
          Math.pow(10, biquadMagnitudeDb(bp, 800) / 20),
        decay: 0.2,
        label: "sq800",
      },
      {
        f: 540,
        gainLin:
          0.16 *
          velocity *
          Math.pow(10, biquadMagnitudeDb(bp, 540) / 20),
        decay: 0.2,
        label: "sq540",
      },
      // 矩形波の奇数倍音
      {
        f: 800 * 3,
        gainLin:
          (0.16 / 3) *
          velocity *
          Math.pow(10, biquadMagnitudeDb(bp, 2400) / 20),
        decay: 0.2,
        label: "sq800x3",
      },
      {
        f: 540 * 3,
        gainLin:
          (0.16 / 3) *
          velocity *
          Math.pow(10, biquadMagnitudeDb(bp, 1620) / 20),
        decay: 0.2,
        label: "sq540x3",
      },
    ],
    chain: [CLEANUP_HP],
    label: "Cowbell",
  };
}

// =============================================================================
// 3) 帯域エネルギー解析
// =============================================================================
function bandEnergyDb(percussion, fLo, fHi) {
  let p = 0;
  for (const part of percussion.partials) {
    if (part.f < fLo || part.f > fHi) continue;
    let dbAfterChain = dB(part.gainLin);
    for (const c of percussion.chain) {
      dbAfterChain += biquadMagnitudeDb(c, part.f);
    }
    p += Math.pow(10, dbAfterChain / 10);
  }
  return p > 0 ? 10 * Math.log10(p) : -120;
}

function spectralCentroid(percussion) {
  let num = 0;
  let den = 0;
  for (const part of percussion.partials) {
    let dbAfterChain = dB(part.gainLin);
    for (const c of percussion.chain) {
      dbAfterChain += biquadMagnitudeDb(c, part.f);
    }
    const power = Math.pow(10, dbAfterChain / 10);
    num += part.f * power;
    den += power;
  }
  return den > 0 ? num / den : 0;
}

function peakAfterChainDb(percussion) {
  let peak = -120;
  for (const part of percussion.partials) {
    let dbAfterChain = dB(part.gainLin);
    for (const c of percussion.chain) {
      dbAfterChain += biquadMagnitudeDb(c, part.f);
    }
    if (dbAfterChain > peak) peak = dbAfterChain;
  }
  return peak;
}

// =============================================================================
// 4) 各パーカッションの聴感プロファイルを出力
// =============================================================================
const PERC = {
  Kick: kickPartials(),
  Snare: snarePartials(),
  HiHatClosed: hihatPartials(0.06),
  HiHatOpen: hihatPartials(0.35),
  Clap: clapPartials(),
  Tom: tomPartials(),
  Rim: rimPartials(),
  Cowbell: cowbellPartials(),
};

console.log("\n=================================================================");
console.log("Sprint 12 Drum Analysis (808-style synthesis + 5 genre patterns)");
console.log("=================================================================");
console.log("\n--- A) Per-percussion spectral profile (after 80Hz cleanup HPF) ---");
console.log(
  "name          | sub20-80 | 80-200 | 200-500 | 500-2k | 2-5k | 5-10k | 10-16k | centroid(Hz) | peak(dB)"
);
console.log(
  "--------------|----------|--------|---------|--------|------|-------|--------|--------------|--------"
);
for (const [name, p] of Object.entries(PERC)) {
  const sub = bandEnergyDb(p, 20, 80);
  const low = bandEnergyDb(p, 80, 200);
  const lowMid = bandEnergyDb(p, 200, 500);
  const mid = bandEnergyDb(p, 500, 2000);
  const hi1 = bandEnergyDb(p, 2000, 5000);
  const hi2 = bandEnergyDb(p, 5000, 10000);
  const hi3 = bandEnergyDb(p, 10000, 16000);
  const cen = spectralCentroid(p);
  const peak = peakAfterChainDb(p);
  console.log(
    `${name.padEnd(13)} | ${sub.toFixed(1).padStart(8)} | ${low.toFixed(1).padStart(6)} | ${lowMid.toFixed(1).padStart(7)} | ${mid.toFixed(1).padStart(6)} | ${hi1.toFixed(1).padStart(4)} | ${hi2.toFixed(1).padStart(5)} | ${hi3.toFixed(1).padStart(6)} | ${cen.toFixed(0).padStart(12)} | ${peak.toFixed(1).padStart(6)}`
  );
}

// =============================================================================
// 5) Kick のローエンド確認 (80Hz HPF 経由後の 80Hz 体感)
// =============================================================================
console.log("\n--- B) Kick low-end retention after 80Hz cleanup HPF ---");
const kickFreqs = [40, 50, 60, 80, 100, 150];
console.log("Freq(Hz) | HPF gain(dB) | raw partial gain(dB) | net(dB)");
console.log("---------|--------------|----------------------|--------");
for (const f of kickFreqs) {
  const hpfDb = biquadMagnitudeDb(CLEANUP_HP, f);
  // Kick: 150Hz transient, 80Hz body (peak), 50Hz tail
  let rawDb = -120;
  for (const part of PERC.Kick.partials) {
    if (Math.abs(Math.log2(part.f) - Math.log2(f)) < 0.2) {
      rawDb = Math.max(rawDb, dB(part.gainLin));
    }
  }
  console.log(
    `${String(f).padStart(8)} | ${hpfDb.toFixed(1).padStart(12)} | ${rawDb.toFixed(1).padStart(20)} | ${(rawDb + hpfDb).toFixed(1).padStart(6)}`
  );
}

// =============================================================================
// 6) HiHat の非調和倍音検証
// =============================================================================
console.log("\n--- C) HiHat partials (must be inharmonic) ---");
const base = 320;
const partialFreqs = HIHAT_RATIOS.map((r) => base * r);
console.log(`base = ${base} Hz, ratios = [${HIHAT_RATIOS.join(", ")}]`);
console.log(
  "partial(Hz):",
  partialFreqs.map((f) => f.toFixed(0)).join(", ")
);
// 倍音率の隣接比（隣接が整数比なら倍音的）
const ratioDiffs = partialFreqs
  .slice(1)
  .map((f, i) => (f / partialFreqs[i]).toFixed(3));
console.log("adjacent ratios:", ratioDiffs.join(", "));
console.log(
  "  → 1.5, 1.387, 1.305, 1.250, 1.209 は整数比から外れる → 非調和（金属的）"
);

// =============================================================================
// 7) Snare の存在感 (Rush の上声部 G4~F5≒392~698Hz と被らないか)
// =============================================================================
console.log("\n--- D) Snare presence vs Rush upper voicing G4(392Hz)-F5(698Hz) ---");
const snareMidEnergy = bandEnergyDb(PERC.Snare, 1500, 3000);
const snareLowEnergy = bandEnergyDb(PERC.Snare, 200, 800);
console.log(
  `Snare 1.5-3kHz: ${snareMidEnergy.toFixed(1)} dB (主成分)`
);
console.log(
  `Snare 200-800Hz: ${snareLowEnergy.toFixed(1)} dB (Rush 上声部と被るゾーン)`
);
console.log(
  `  → 差分 = ${(snareMidEnergy - snareLowEnergy).toFixed(1)} dB (高いほどコードに埋もれず抜ける)`
);

// =============================================================================
// 8) ジャンルパターンのタイミング解析（16th グリッド・スウィング比率）
// =============================================================================
console.log("\n--- E) Genre pattern timing analysis (BPM=100) ---");
const BPM = 100;
const sixteenthSec = 60 / BPM / 4; // 0.15 sec @ BPM 100
console.log(`16th note = ${(sixteenthSec * 1000).toFixed(1)} ms @ BPM ${BPM}`);

function patternForGenre(genre) {
  const events = []; // { step, time, kind, velocity }
  for (let step = 0; step < 16; step++) {
    let swingDelay = 0;
    if (genre === "jazz" && step % 4 === 3) swingDelay = sixteenthSec / 3;
    if (genre === "funk" && step % 2 === 1) swingDelay = sixteenthSec / 6;
    if (genre === "soul" && step % 4 === 3) swingDelay = sixteenthSec / 3;
    const baseTime = step * sixteenthSec;
    const t = baseTime + swingDelay; // hi-hat schedule time

    if (genre === "rock") {
      if (step % 4 === 0) events.push({ step, time: baseTime, kind: "K", vel: 1 });
      if (step === 4 || step === 12)
        events.push({ step, time: baseTime, kind: "S", vel: 1 });
      if (step % 2 === 0)
        events.push({ step, time: baseTime, kind: "Hc", vel: 1 });
    } else if (genre === "jazz") {
      if (step === 0) events.push({ step, time: baseTime, kind: "K", vel: 1 });
      if (step === 4 || step === 12)
        events.push({ step, time: baseTime, kind: "s", vel: 0.45 });
      if ([0, 3, 4, 7, 8, 11, 12, 15].includes(step))
        events.push({ step, time: t, kind: "Hc", vel: 1, swing: swingDelay });
    } else if (genre === "funk") {
      if ([0, 6, 8, 14].includes(step))
        events.push({ step, time: baseTime, kind: "K", vel: 1 });
      if (step === 4 || step === 12)
        events.push({ step, time: baseTime, kind: "S", vel: 1 });
      if (step === 10) events.push({ step, time: baseTime, kind: "s", vel: 0.45 });
      const isOpen = step === 2 || step === 10;
      if (isOpen) events.push({ step, time: t, kind: "Ho", vel: 1, swing: swingDelay });
      else events.push({ step, time: t, kind: "Hc", vel: 1, swing: swingDelay });
    } else if (genre === "pop") {
      if (step % 8 === 0)
        events.push({ step, time: baseTime, kind: "K", vel: 1 });
      if (step === 4 || step === 12)
        events.push({ step, time: baseTime, kind: "S", vel: 1 });
      if (step % 2 === 0)
        events.push({ step, time: baseTime, kind: "Hc", vel: 0.7 });
    } else if (genre === "soul") {
      if (step === 0 || step === 10)
        events.push({ step, time: baseTime, kind: "K", vel: 1 });
      if (step === 8) events.push({ step, time: baseTime, kind: "S", vel: 1 });
      if (step === 14) events.push({ step, time: baseTime, kind: "s", vel: 0.45 });
      if ([0, 3, 4, 7, 8, 11, 12, 15].includes(step))
        events.push({ step, time: t, kind: "Hc", vel: 1, swing: swingDelay });
    }
  }
  return events;
}

for (const g of ["rock", "jazz", "funk", "pop", "soul"]) {
  const events = patternForGenre(g);
  const kickSteps = events.filter((e) => e.kind === "K").map((e) => e.step);
  const snareSteps = events
    .filter((e) => e.kind === "S" || e.kind === "s")
    .map((e) => `${e.step}${e.kind === "s" ? "(g)" : ""}`);
  const hatSteps = events.filter((e) => e.kind === "Hc" || e.kind === "Ho");
  const hcCount = events.filter((e) => e.kind === "Hc").length;
  const hoCount = events.filter((e) => e.kind === "Ho").length;
  const swingMs =
    hatSteps
      .filter((e) => e.swing && e.swing > 0)
      .map((e) => (e.swing * 1000).toFixed(1))
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(", ") || "0.0";
  console.log(`\n[${g.toUpperCase()}]`);
  console.log(`  Kick steps : ${kickSteps.join(", ")} (count=${kickSteps.length})`);
  console.log(`  Snare steps: ${snareSteps.join(", ")} (count=${snareSteps.length})`);
  console.log(`  HiHat C: ${hcCount}, HiHat O: ${hoCount}`);
  console.log(`  Swing delay on backbeat 16ths: ${swingMs} ms`);
}

// =============================================================================
// 9) ジャンル識別性スコア（パターン特徴ベクトルの距離）
// =============================================================================
console.log("\n--- F) Genre identifiability (feature distance) ---");

function featureVector(events) {
  const kickCount = events.filter((e) => e.kind === "K").length;
  const snareNorm = events.filter((e) => e.kind === "S").length;
  const snareGhost = events.filter((e) => e.kind === "s").length;
  const hc = events.filter((e) => e.kind === "Hc").length;
  const ho = events.filter((e) => e.kind === "Ho").length;
  // 平均スウィング (有スウィングイベントの割合 × 量)
  const swingEvents = events.filter((e) => e.swing && e.swing > 0);
  const avgSwingMs =
    swingEvents.length > 0
      ? (swingEvents.reduce((s, e) => s + e.swing, 0) / swingEvents.length) * 1000
      : 0;
  return {
    kickDensity: kickCount,
    snareNorm,
    snareGhost,
    hatDensity: hc + ho,
    openHatCount: ho,
    swingMs: avgSwingMs,
  };
}

const fv = {};
for (const g of ["rock", "jazz", "funk", "pop", "soul"]) {
  fv[g] = featureVector(patternForGenre(g));
}
console.log("genre | kickN | snareN | snareGh | hatN | openH | avgSwing(ms)");
console.log("------|-------|--------|---------|------|-------|-------------");
for (const g of Object.keys(fv)) {
  const v = fv[g];
  console.log(
    `${g.padEnd(5)} | ${String(v.kickDensity).padStart(5)} | ${String(v.snareNorm).padStart(6)} | ${String(v.snareGhost).padStart(7)} | ${String(v.hatDensity).padStart(4)} | ${String(v.openHatCount).padStart(5)} | ${v.swingMs.toFixed(1).padStart(11)}`
  );
}

// L2 normalized pairwise distance
function dist(a, b) {
  const keys = [
    "kickDensity",
    "snareNorm",
    "snareGhost",
    "hatDensity",
    "openHatCount",
    "swingMs",
  ];
  // 単位スケール: kick/snare/hat = 16 ステップ最大, swing = sixteenthSec/3 * 1000 ≒ 50ms 最大
  const scale = {
    kickDensity: 16,
    snareNorm: 16,
    snareGhost: 16,
    hatDensity: 16,
    openHatCount: 16,
    swingMs: 50,
  };
  let s = 0;
  for (const k of keys) {
    const d = (a[k] - b[k]) / scale[k];
    s += d * d;
  }
  return Math.sqrt(s);
}
console.log("\nPairwise feature distance (0=identical, 1.0+=very different):");
const genres = ["rock", "jazz", "funk", "pop", "soul"];
console.log("       | " + genres.map((g) => g.padStart(5)).join(" | "));
for (const g1 of genres) {
  const row = genres.map((g2) =>
    g1 === g2 ? "  -  " : dist(fv[g1], fv[g2]).toFixed(3).padStart(5)
  );
  console.log(`${g1.padEnd(6)} | ${row.join(" | ")}`);
}

// 重要ペアコメント
console.log("\nKey pair commentary:");
console.log(
  `  Rock vs Pop : ${dist(fv.rock, fv.pop).toFixed(3)} (kick density 4→2, hat velocity diff)`
);
console.log(
  `  Jazz vs Soul: ${dist(fv.jazz, fv.soul).toFixed(3)} (same swing, different kick/snare placement)`
);
console.log(
  `  Funk vs Rock: ${dist(fv.funk, fv.rock).toFixed(3)} (hat density 8→16, open hat)`
);

// =============================================================================
// 10) Sprint 11 比較（v2.6 → v2.7 改善量の推定）
// =============================================================================
console.log("\n--- G) v2.6 → v2.7 改善推定 (qualitative) ---");
console.log("旧 (v2.6 まで)  : Kick=三角波 + ピッチエンベロープ簡易、Snare=ノイズ単体、HiHat=ノイズ+HPF");
console.log("新 (v2.7 Sprint 12): Kick=sine+click、Snare=2tone+BPノイズ、HiHat=6 矩形非調和+ノイズ");
console.log("");
console.log("HiHat non-harmonic ratio coverage:");
console.log(
  `  base 320Hz × ratios → 640, 960, 1331, 1738, 2173, 2627 Hz (基本部分音のみ)`
);
console.log(
  `  + 矩形波奇数倍音込み → 5kHz 以上の高域カバー = ${PERC.HiHatClosed.partials.filter((p) => p.f >= 5000).length} 部分音`
);
console.log(
  `  旧 HiHat (noise+7kHz HPF) は完全にノイズスペクトル → 部分音 = 0`
);
console.log(
  `  → 改善幅: 部分音的金属感が +${PERC.HiHatClosed.partials.filter((p) => p.f >= 2000 && p.f < 10000).length} 個分加わった`
);
