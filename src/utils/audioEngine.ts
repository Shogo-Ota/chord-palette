// === Web Audio API コードプレビューエンジン ===

import type { PaletteChord } from "./musicTheory";

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // マスターコンプレッサー: 音割れを防ぎ、全体の音量を均一化する
    compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-15, audioContext.currentTime);
    compressor.knee.setValueAtTime(30, audioContext.currentTime);
    compressor.ratio.setValueAtTime(12, audioContext.currentTime);
    compressor.attack.setValueAtTime(0.003, audioContext.currentTime);
    compressor.release.setValueAtTime(0.25, audioContext.currentTime);
    
    // マスターゲイン: 全体の音量を微調整（ clipping 回避のため少し下げる）
    masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(0.8, audioContext.currentTime);
    
    // 接続: 各音源 -> masterGain -> compressor -> destination
    masterGain.connect(compressor);
    compressor.connect(audioContext.destination);
  }
  return audioContext;
}

/**
 * 音源をマスターゲインに接続するためのヘルパー
 */
function connectToMaster(node: AudioNode) {
  if (masterGain) {
    node.connect(masterGain);
  } else {
    node.connect(getAudioContext().destination);
  }
}

/**
 * MIDIノート番号から周波数を計算（A4=440Hz基準）
 */
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * PaletteChordを再生する（ピアノ風オシレーター）
 * intervals配列に基づいて構成音を計算
 */
export function playChord(chord: PaletteChord, durationSec: number = 0.8, time?: number): void {
  const ctx = getAudioContext();
  
  if (ctx.state === "suspended") {
    ctx.resume();
  }

  const now = time !== undefined ? time : ctx.currentTime;
  
  // ボイシングの最適化
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
  const attack = 0.05; // わずかなAttackで柔らかさを出す
  const release = duration * 0.6; // 余韻を長めに設定

  // 各ノートに対して音色を合成
  notes.forEach((note, i) => {
    const freq = midiToFreq(note);
    const isBass = i === notes.length - 1;

    // 1. ボディトーン (温かみのある中心)
    const osc1 = ctx.createOscillator();
    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(freq, now);

    // 2. デチューンレイヤー (厚みと艶を出す)
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(freq * 1.002, now); // わずかにデチューン

    // 3. サブレイヤー (煌びやかさを出す、ベース以外)
    const osc3 = !isBass ? ctx.createOscillator() : null;
    if (osc3) {
      osc3.type = "sine";
      osc3.frequency.setValueAtTime(freq * 2.0, now); // 1オクターブ上
    }

    // 各オシレーターを個別のGainでコントロール
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(isBass ? 400 : 2500, now); // 高域を抑えて温かみを出す
    filter.Q.setValueAtTime(1, now);

    // ADSR エンベロープ (Attack, Releaseのみの簡易版)
    const maxGain = isBass ? 0.15 : 0.08;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(maxGain, now + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration + release);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    if (osc3) osc3.connect(gainNode);

    gainNode.connect(filter);
    connectToMaster(filter);

    osc1.start(now);
    osc1.stop(now + duration + release + 0.1);
    osc2.start(now);
    osc2.stop(now + duration + release + 0.1);
    if (osc3) {
      osc3.start(now);
      osc3.stop(now + duration + release + 0.1);
    }
  });
}

// === ドラムシンセサイザー ===

function playKick(ctx: AudioContext, time: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.connect(gain);
  connectToMaster(gain);
  
  // アタックの瞬間に周波数を高くし、急激に落とす (thump音)
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);
  osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
  
  gain.gain.setValueAtTime(0.6, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
  
  osc.start(time);
  osc.stop(time + 0.5);
}

function playSnare(ctx: AudioContext, time: number) {
  // スネア本体のトーン (Body)
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(180, time);
  osc.connect(oscGain);
  connectToMaster(oscGain);
  oscGain.gain.setValueAtTime(0.3, time);
  oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
  osc.start(time);
  osc.stop(time + 0.1);

  // ホワイトノイズによるザラつき (Sizzle)
  const bufferSize = ctx.sampleRate * 0.2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "highpass";
  noiseFilter.frequency.setValueAtTime(1000, time);
  
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.4, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
  
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  connectToMaster(noiseGain);
  
  noise.start(time);
  noise.stop(time + 0.2);
}

function playHiHat(ctx: AudioContext, time: number) {
  // ホワイトノイズ成分
  const bufferSize = ctx.sampleRate * 0.05;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(7000, time);
  
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
  
  noise.connect(filter);
  filter.connect(gain);
  connectToMaster(gain);
  
  noise.start(time);
  noise.stop(time + 0.05);
}

// === シーケンサー (Look-ahead スケジューリング) ===

let sequenceTimerId: number | null = null;
let nextNoteTime = 0;
let current16thNote = 0; 
let currentChordIndex = 0;
let isPlaying = false;
let sequencePalette: PaletteChord[] = [];
let sequenceBpm = 120;
let sequencePattern: "none" | "4beat" | "8beat" | "16beat" = "none";
let sequenceOnStop: (() => void) | null = null;
let sequenceOnTick: ((index: number) => void) | null = null; // 現在のコードインデックスを通知用
let sequenceIsLooping = false; // ループ状態

function scheduleNote(beatNumber: number, time: number) {
  const ctx = getAudioContext();
  const beatPerChord = 8; // 1コードは16分音符8個分(＝2拍)とする

  // ドラムのスケジューリング
  if (sequencePattern === "4beat") {
    // 4ビート: 4分音符ごと(16分音符4個ごと)にキックとハイハット
    if (beatNumber % 4 === 0) {
      playKick(ctx, time);
      playHiHat(ctx, time);
    }
  } else if (sequencePattern === "8beat") {
    // 8ビート
    if (beatNumber % 2 === 0) {
      playHiHat(ctx, time); // 8分音符でハイハット
    }
    if (beatNumber % 16 === 0 || beatNumber % 16 === 8) {
      playKick(ctx, time); // 1拍目、3拍目でキック
    }
    if (beatNumber % 16 === 4 || beatNumber % 16 === 12) {
      playSnare(ctx, time); // 2拍目、4拍目でスネア
    }
  } else if (sequencePattern === "16beat") {
    // 16ビート
    playHiHat(ctx, time); // すべての16分音符でハイハット
    
    if (beatNumber % 16 === 0 || beatNumber % 16 === 10) {
      playKick(ctx, time); // 1拍目と少しずらした位置でキック
    }
    if (beatNumber % 16 === 4 || beatNumber % 16 === 12) {
      playSnare(ctx, time); // 2拍目、4拍目でスネア
    }
  }

  // コードのスケジューリング
  if (beatNumber % beatPerChord === 0) {
    if (currentChordIndex < sequencePalette.length) {
      if (sequenceOnTick) {
        sequenceOnTick(currentChordIndex);
      }
      const sustainSec = (60 / sequenceBpm) * 2;
      playChord(sequencePalette[currentChordIndex], sustainSec, time);
      currentChordIndex++;
    }
  }
}

function nextNote() {
  const secondsPerBeat = 60.0 / sequenceBpm;
  nextNoteTime += 0.25 * secondsPerBeat; // 16分音符の長さを加算
  current16thNote++;
}

function scheduler() {
  const ctx = getAudioContext();
  
  while (nextNoteTime < ctx.currentTime + 0.2) {
    scheduleNote(current16thNote, nextNoteTime);
    nextNote();
    
    // 全コードと、最後のコードのサステイン時間（2拍分）を完了したら止める
    const beatPerChord = 8;
    const totalBeats = sequencePalette.length * beatPerChord;
    if (current16thNote >= totalBeats) {
      if (sequenceIsLooping) {
        // ループ再生: カウンターをリセットして継続
        current16thNote = 0;
        currentChordIndex = 0;
      } else {
        // 通常再生: 最後のコードがスケジュールされたので、実際の音が終わる頃合いで停止関数を呼ぶ
        const sustainSec = (60 / sequenceBpm) * 2;
        window.setTimeout(() => {
          if (isPlaying && sequenceOnStop) {
            sequenceOnStop();
          }
          stopPaletteSequence();
        }, sustainSec * 1000);
        return; 
      }
    }
  }

  if (isPlaying) {
    sequenceTimerId = window.setTimeout(scheduler, 25);
  }
}

export function playPaletteSequence(
  palette: PaletteChord[],
  bpm: number,
  pattern: "none" | "4beat" | "8beat" | "16beat",
  isLooping: boolean,
  onStop: () => void,
  onTick: (index: number) => void // 追加: 現在のインデックスを返す
): void {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume();

  stopPaletteSequence(); // 既に鳴っていれば止める
  
  // 何もない場合すぐ止める
  if (palette.length === 0) {
    onStop();
    return;
  }

  sequencePalette = palette;
  sequenceBpm = bpm;
  sequencePattern = pattern;
  sequenceOnStop = onStop;
  sequenceOnTick = onTick; // 保存
  sequenceIsLooping = isLooping; // 保存
  
  current16thNote = 0;
  currentChordIndex = 0;
  nextNoteTime = ctx.currentTime + 0.1; // 0.05 -> 0.1 (安全な開始バッファ)
  isPlaying = true;

  scheduler();
}

export function stopPaletteSequence(): void {
  isPlaying = false;
  if (sequenceTimerId !== null) {
    window.clearTimeout(sequenceTimerId);
    sequenceTimerId = null;
  }
}
