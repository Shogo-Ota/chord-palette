// Sprint 11 sound-critic 数値解析スクリプト
// instrumentPresets.ts / pleasantAcoustics.ts / voicing.ts のロジックを Node で再現し
// 各プリセットの周波数分布・差別化指標・ボイシング音域を客観評価する。
//
// 実行: node scripts/sound-critic-analysis.mjs

// --- 1) instrumentPresets.ts と同じ値 -------------------------------------------------
const NATURAL_HARMONIC_GAINS = [1, 0.52, 0.28, 0.15, 0.07, 0.035, 0.018];

function naturalHarmonicOscillators(maxPartial, scale = 1) {
  const specs = [];
  for (let i = 0; i <= maxPartial; i++) {
    if (NATURAL_HARMONIC_GAINS[i] === undefined) break;
    specs.push({ type: "sine", ratio: i + 1, gain: NATURAL_HARMONIC_GAINS[i] * scale });
  }
  return specs;
}

const PRESETS = {
  rush: {
    label: "Rush",
    oscillators: naturalHarmonicOscillators(6, 0.15),
    filterCutoffBass: 780, filterCutoffTreble: 5800, filterQ: 0.55,
    trebleBrightnessDb: 3,
    attack: 0.008, decay: 0.14, sustain: 0.58, release: 0.14,
    gainMultiplier: 1.1, bassGainRatio: 1.18,
    chorusDepth: 1, reverbSend: 0.28,
  },
  senseEp: {
    label: "SenseElepix",
    oscillators: [
      { type: "sine", ratio: 1, gain: 0.78 },
      { type: "triangle", ratio: 2, gain: 0.3 },
      { type: "sine", ratio: 3, gain: 0.1 },
      { type: "sine", ratio: 4, gain: 0.04 },
    ],
    filterCutoffBass: 720, filterCutoffTreble: 5000, filterQ: 0.65,
    trebleBrightnessDb: 2.5,
    attack: 0.015, decay: 0.12, sustain: 0.55, release: 0.12,
    gainMultiplier: 1.05, bassGainRatio: 1.2,
    chorusDepth: 0.5, reverbSend: 0.4,
  },
  upright: {
    label: "Upright",
    oscillators: [
      { type: "sine", ratio: 1, gain: 0.72 },
      { type: "triangle", ratio: 2, gain: 0.16 },
      { type: "sine", ratio: 3, gain: 0.07 },
      { type: "sine", ratio: 4, gain: 0.025 },
    ],
    filterCutoffBass: 620, filterCutoffTreble: 3900, filterQ: 0.7,
    trebleBrightnessDb: 1.5,
    attack: 0.01, decay: 0.2, sustain: 0.48, release: 0.18,
    gainMultiplier: 1.06, bassGainRatio: 1.35,
    chorusDepth: 0.4, reverbSend: 0.18,
  },
};

// --- 2) フィルタ伝達関数（biquad の振幅特性） --------------------------------------
// RBJ Cookbook formulas（評価には振幅のみ必要）
function biquadCoeffs(type, f0, Q, gainDb, fs = 48000) {
  const A = Math.pow(10, gainDb / 40);
  const w0 = 2 * Math.PI * f0 / fs;
  const cosw0 = Math.cos(w0), sinw0 = Math.sin(w0);
  const alpha = sinw0 / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case "lowpass":
      b0 = (1 - cosw0) / 2; b1 = 1 - cosw0; b2 = (1 - cosw0) / 2;
      a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
      break;
    case "highpass":
      b0 = (1 + cosw0) / 2; b1 = -(1 + cosw0); b2 = (1 + cosw0) / 2;
      a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
      break;
    case "highshelf": {
      const beta = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cosw0 + beta);
      b1 = -2 * A * ((A - 1) + (A + 1) * cosw0);
      b2 = A * ((A + 1) + (A - 1) * cosw0 - beta);
      a0 = (A + 1) - (A - 1) * cosw0 + beta;
      a1 = 2 * ((A - 1) - (A + 1) * cosw0);
      a2 = (A + 1) - (A - 1) * cosw0 - beta;
      break;
    }
  }
  return { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 };
}

function biquadMagnitudeDb(coeffs, f, fs = 48000) {
  const w = 2 * Math.PI * f / fs;
  const cosw = Math.cos(w), sinw = Math.sin(w);
  const cos2w = Math.cos(2 * w), sin2w = Math.sin(2 * w);
  const numRe = coeffs.b0 + coeffs.b1 * cosw + coeffs.b2 * cos2w;
  const numIm = -(coeffs.b1 * sinw + coeffs.b2 * sin2w);
  const denRe = 1 + coeffs.a1 * cosw + coeffs.a2 * cos2w;
  const denIm = -(coeffs.a1 * sinw + coeffs.a2 * sin2w);
  const mag = Math.sqrt((numRe**2 + numIm**2) / (denRe**2 + denIm**2));
  return 20 * Math.log10(Math.max(mag, 1e-9));
}

// --- 3) voicing.ts と同じロジック ----------------------------------------------------
const BASS_MIN = 48, BASS_MAX = 57;
const UPPER_MIN = 60, UPPER_MAX = 79;
const MAX_UPPER_SPAN = 12;
const pc = (m) => ((m % 12) + 12) % 12;

function midiCandidatesForPc(pcv, lo, hi) {
  const out = [];
  for (let m = lo; m <= hi; m++) if (pc(m) === pcv) out.push(m);
  return out;
}

function compressUpperSpan(voices) {
  if (!voices.length) return voices;
  let v = [...voices].sort((a, b) => a - b);
  while (v[v.length - 1] - v[0] > MAX_UPPER_SPAN) {
    const next = v.map((n) => n - 12);
    if (next[0] < UPPER_MIN) break;
    v = next;
  }
  return v;
}

function voiceBass(pcv, prev) {
  const cands = midiCandidatesForPc(pcv, BASS_MIN, BASS_MAX);
  if (!cands.length) return BASS_MIN + pcv;
  if (!prev?.length) return cands[Math.floor(cands.length / 2)] ?? cands[0];
  const pb = Math.min(...prev);
  let best = cands[0], bd = Infinity;
  for (const c of cands) { const d = Math.abs(c - pb); if (d < bd) { bd = d; best = c; } }
  return best;
}

function voiceUpperClose(pcs, prev) {
  const sorted = [...pcs].sort((a, b) => a - b);
  if (!sorted.length) return [];
  const prevUpper = prev?.length ? prev.filter(n => n !== Math.min(...prev)) : undefined;

  if (!prevUpper?.length) {
    const voices = [];
    const first = midiCandidatesForPc(sorted[0], UPPER_MIN, UPPER_MAX);
    const anchor = first[Math.floor(first.length / 2)] ?? first[0] ?? 64;
    voices.push(anchor);
    for (let i = 1; i < sorted.length; i++) {
      const pcv = sorted[i];
      let midi = voices[i - 1] + 1;
      while (midi <= UPPER_MAX && pc(midi) !== pcv) midi++;
      if (midi > UPPER_MAX || pc(midi) !== pcv) {
        const fb = midiCandidatesForPc(pcv, UPPER_MIN, UPPER_MAX).find(m => m > voices[i-1]) ??
                   midiCandidatesForPc(pcv, UPPER_MIN, UPPER_MAX)[0];
        midi = fb ?? UPPER_MIN + pcv;
      }
      voices.push(midi);
    }
    return compressUpperSpan(voices);
  }
  const used = new Set(); const voices = [];
  for (const pcv of sorted) {
    const cands = midiCandidatesForPc(pcv, UPPER_MIN, UPPER_MAX);
    let best = cands[0], bc = Infinity;
    for (const c of cands) {
      if (used.has(c)) continue;
      const cost = Math.min(...prevUpper.map(p => Math.abs(c - p)));
      if (cost < bc) { bc = cost; best = c; }
    }
    voices.push(best); used.add(best);
  }
  return compressUpperSpan(voices.sort((a, b) => a - b));
}

function voiceChord(chord, prev) {
  const allPcs = Array.from(new Set(chord.intervals.map(i => pc(chord.rootNote + i))));
  const bassPc = pc(chord.bassNoteOverride ?? chord.rootNote);
  const upperPcs = allPcs.filter(x => x !== bassPc);
  const bassMidi = voiceBass(bassPc, prev);
  const upper = voiceUpperClose(upperPcs, prev);
  return [bassMidi, ...upper].sort((a, b) => a - b);
}

// --- 4) シナリオ A / B のコード進行を直接定義 ----------------------------------------
// C key、ルート MIDI は C5(60) ベース。コード進行が key C で意図する pitch class が出るよう調整
// Cmaj7=I (CEGB), Am7=vi (ACEG), Fmaj7=IV (FACE), G7=V7 (GBDF)
// Fmaj7=IV, Em7=iii (EGBD), Dm7=ii (DFAC), Cmaj7=I
function chord(root, intervals) { return { rootNote: root, intervals }; }
const scenarioA = [
  chord(60, [0,4,7,11]),   // Cmaj7
  chord(57, [0,3,7,10]),   // Am7  (A3=57)
  chord(53, [0,4,7,11]),   // Fmaj7 (F3=53)
  chord(55, [0,4,7,10]),   // G7    (G3=55)
];
const scenarioB = [
  chord(53, [0,4,7,11]),   // Fmaj7
  chord(52, [0,3,7,10]),   // Em7
  chord(50, [0,3,7,10]),   // Dm7
  chord(60, [0,4,7,11]),   // Cmaj7
];

// --- 5) 解析: 各プリセットのスペクトル指標 -------------------------------------------
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function presetSpectrum(preset, midiNotes) {
  // 各オシレータ部分音 × ベース/上声部のフィルタ → トーン形成後の振幅
  // 共有マスター: trebleShelf(-4dB@5kHz) → cleanupHPF(80Hz, Q0.707)
  const bassMidi = Math.min(...midiNotes);
  const trebShelf = biquadCoeffs("highshelf", 5000, 0.707, -4);
  const cleanHP = biquadCoeffs("highpass", 80, 0.707);

  // 周波数ビン（30Hz〜16kHz 対数）
  const bins = [];
  const nBins = 120;
  for (let i = 0; i < nBins; i++) {
    const f = 30 * Math.pow(16000 / 30, i / (nBins - 1));
    bins.push(f);
  }
  const spec = new Array(nBins).fill(0);

  for (const m of midiNotes) {
    const isBass = m === bassMidi;
    const f0 = midiToHz(m);
    const lp = biquadCoeffs("lowpass",
      isBass ? preset.filterCutoffBass : preset.filterCutoffTreble,
      preset.filterQ);
    const trebBright = !isBass && preset.trebleBrightnessDb > 0
      ? biquadCoeffs("highshelf", 2800, 0.707, preset.trebleBrightnessDb) : null;
    const bassHP = isBass ? biquadCoeffs("highpass", 80, 0.707) : null;

    const baseGain = isBass ? 0.16 * preset.bassGainRatio : 0.14;
    const totalGain = baseGain * preset.gainMultiplier / Math.sqrt(midiNotes.length);

    for (const osc of preset.oscillators) {
      const partial = f0 * osc.ratio;
      if (partial > 20000) continue;
      // フィルタチェイン: 部分音単体 → LP → (softclip≒線形近似) → trebBright → bassHP → masterShelf → cleanupHP
      let gainDb = 20 * Math.log10(osc.gain * totalGain);
      gainDb += biquadMagnitudeDb(lp, partial);
      if (trebBright) gainDb += biquadMagnitudeDb(trebBright, partial);
      if (bassHP) gainDb += biquadMagnitudeDb(bassHP, partial);
      gainDb += biquadMagnitudeDb(trebShelf, partial);
      gainDb += biquadMagnitudeDb(cleanHP, partial);

      // 最も近いビンに加算（線形和）
      let bestIdx = 0, bestDist = Infinity;
      for (let i = 0; i < nBins; i++) {
        const d = Math.abs(Math.log(bins[i]) - Math.log(partial));
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      spec[bestIdx] += Math.pow(10, gainDb / 10); // 電力加算
    }
  }
  // dB 化
  const specDb = spec.map(p => p > 0 ? 10 * Math.log10(p) : -120);
  return { bins, specDb };
}

function bandEnergyDb(bins, specDb, fLo, fHi) {
  let p = 0;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] >= fLo && bins[i] <= fHi) p += Math.pow(10, specDb[i] / 10);
  }
  return p > 0 ? 10 * Math.log10(p) : -120;
}

function spectralCentroidHz(bins, specDb) {
  let num = 0, den = 0;
  for (let i = 0; i < bins.length; i++) {
    const p = Math.pow(10, specDb[i] / 10);
    num += bins[i] * p; den += p;
  }
  return den > 0 ? num / den : 0;
}

// --- 6) 実行 ---------------------------------------------------------------------------
const labels = ["Cmaj7","Am7","Fmaj7","G7"];
const labelsB = ["Fmaj7","Em7","Dm7","Cmaj7"];

function analyzeScenario(name, progression, labels) {
  console.log(`\n============================================================`);
  console.log(`SCENARIO ${name}: ${labels.join(" → ")}`);
  console.log(`============================================================`);
  // ボイシング（VL on）を進行ベースで決定（1音色分でよい — 音域は音色非依存）
  let prev = null;
  const voicings = progression.map(c => { const v = voiceChord(c, prev); prev = v; return v; });
  voicings.forEach((v, i) => {
    const bass = Math.min(...v), top = Math.max(...v);
    console.log(`  ${labels[i].padEnd(7)} MIDI=${v.join(",").padEnd(20)} bass=${bass} top=${top} span=${top-bass} bass_Hz=${midiToHz(bass).toFixed(1)}`);
  });
  const bassMidis = voicings.map(v => Math.min(...v));
  const topMidis  = voicings.map(v => Math.max(...v));
  const bassJump = Math.max(...bassMidis) - Math.min(...bassMidis);
  const topJump  = Math.max(...topMidis)  - Math.min(...topMidis);
  console.log(`  -> bass jump=${bassJump} semitones, top jump=${topJump} semitones (close-voicing target: bass<=12, top<=12)`);

  // 各プリセットを Cmaj7 voicing 1 つで代表評価（最も特徴出やすい）
  const sampleVoicing = voicings[0];
  for (const id of ["rush","senseEp","upright"]) {
    const p = PRESETS[id];
    const { bins, specDb } = presetSpectrum(p, sampleVoicing);
    const eSub  = bandEnergyDb(bins, specDb, 20, 80);
    const eLow  = bandEnergyDb(bins, specDb, 80, 200);
    const eMid  = bandEnergyDb(bins, specDb, 200, 2000);
    const eHi1  = bandEnergyDb(bins, specDb, 2000, 5000);
    const eHi2  = bandEnergyDb(bins, specDb, 5000, 10000);
    const eHi3  = bandEnergyDb(bins, specDb, 10000, 16000);
    const cen   = spectralCentroidHz(bins, specDb);
    console.log(
      `  [${p.label.padEnd(11)}]  sub20-80:${eSub.toFixed(1).padStart(6)} dB | 80-200:${eLow.toFixed(1).padStart(6)} | mid200-2k:${eMid.toFixed(1).padStart(6)} | 2-5k:${eHi1.toFixed(1).padStart(6)} | 5-10k:${eHi2.toFixed(1).padStart(6)} | 10-16k:${eHi3.toFixed(1).padStart(6)} | centroid=${cen.toFixed(0)} Hz`
    );
  }
}

console.log("\n### 差別化指標サマリ（7 項目）");
const keys = ["filterCutoffBass","filterCutoffTreble","attack","decay","release","chorusDepth","reverbSend"];
console.log("preset      | bassLP | trebLP | atk   | dec   | rel   | chorus | rvb");
for (const id of ["rush","senseEp","upright"]) {
  const p = PRESETS[id];
  console.log(`${p.label.padEnd(11)} | ${String(p.filterCutoffBass).padStart(6)} | ${String(p.filterCutoffTreble).padStart(6)} | ${p.attack.toFixed(3)} | ${p.decay.toFixed(3)} | ${p.release.toFixed(3)} | ${p.chorusDepth.toFixed(2).padStart(6)} | ${p.reverbSend.toFixed(2)}`);
}

// ペア差を集計
function pairwiseDiff(a, b) {
  let n = 0;
  for (const k of keys) if (Math.abs(PRESETS[a][k] - PRESETS[b][k]) > 1e-6) n++;
  return n;
}
console.log(`\nペア間で値が異なる指標数:`);
console.log(`  Rush ↔ SenseElepix: ${pairwiseDiff("rush","senseEp")} / 7`);
console.log(`  Rush ↔ Upright:     ${pairwiseDiff("rush","upright")} / 7`);
console.log(`  SenseElepix ↔ Upright: ${pairwiseDiff("senseEp","upright")} / 7`);

analyzeScenario("A (BPM 90, Cmaj7-Am7-Fmaj7-G7)", scenarioA, labels);
analyzeScenario("B (BPM 70, Fmaj7-Em7-Dm7-Cmaj7)", scenarioB, labelsB);

// --- 7) 5kHz 以上の刺さり量 / 80Hz 以下のモゴモゴ量 -----------------------------------
console.log(`\n\n### 5kHz 以上の刺さりエネルギー比（[5k-10k] dB - [200-2k] dB）`);
for (const id of ["rush","senseEp","upright"]) {
  const p = PRESETS[id];
  const { bins, specDb } = presetSpectrum(p, voiceChord(scenarioA[0], null));
  const ratio = bandEnergyDb(bins, specDb, 5000, 10000) - bandEnergyDb(bins, specDb, 200, 2000);
  console.log(`  ${p.label.padEnd(11)}: ${ratio.toFixed(1)} dB (低いほど中域優位＝刺さりにくい)`);
}
console.log(`\n### 80Hz 以下のサブベース比（[20-80] dB - [80-500] dB）`);
for (const id of ["rush","senseEp","upright"]) {
  const p = PRESETS[id];
  const { bins, specDb } = presetSpectrum(p, voiceChord(scenarioA[0], null));
  const ratio = bandEnergyDb(bins, specDb, 20, 80) - bandEnergyDb(bins, specDb, 80, 500);
  console.log(`  ${p.label.padEnd(11)}: ${ratio.toFixed(1)} dB (低いほどモゴモゴが少ない)`);
}

// --- 8) リミッタ・クリップ余裕の概算 --------------------------------------------------
console.log(`\n\n### ピーク到達推定（リミッタ threshold = -14 dBFS, ratio = 2.5）`);
console.log(`  全プリセットで gainScale = 1/sqrt(4 voices) = 0.5`);
for (const id of ["rush","senseEp","upright"]) {
  const p = PRESETS[id];
  // 4 voice 同時打鍵時の理論ピーク（線形重ね合わせ最悪ケース）
  // baseGain * gainMul * sumOscGains × 4 voices × (1 + 2*chorus*0.22 for ratio<=4) × softclip圧縮 0.85
  const oscSum = p.oscillators.reduce((s, o) => s + o.gain, 0);
  const chorusFactor = 1 + 2 * 0.22 * p.chorusDepth;
  // バスはやや強め、上声3つは弱め平均
  const peakVoice = 0.14 * p.gainMultiplier * oscSum * chorusFactor; // 上声 1 つ分
  const peakBass  = 0.16 * p.bassGainRatio * p.gainMultiplier * oscSum * chorusFactor;
  const peakPolyphonic = (peakBass + 3 * peakVoice) * (1/Math.sqrt(4));
  const softclipped = Math.tanh(peakPolyphonic * 1.6) / Math.tanh(1.6);
  // masterGain (0.34)
  const masterOut = softclipped * 0.34;
  const dbfs = 20 * Math.log10(Math.max(masterOut, 1e-6));
  console.log(`  ${p.label.padEnd(11)}: estimated peak ${dbfs.toFixed(1)} dBFS  (softclipped voice peak=${softclipped.toFixed(3)})`);
}
console.log(`\n  -> threshold = -14 dBFS を上回るとリミッタが圧縮。マスター後 -14 〜 -6 dBFS が健全レンジ`);
