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
  const fadeOut = duration * 0.4;

  notes.forEach((note) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(midiToFreq(note), now);

    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(midiToFreq(note) * 2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now); // 少し下げ
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration + fadeOut);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.03, now); // 少し下げ
    gain2.gain.exponentialRampToValueAtTime(0.001, now + duration + fadeOut);

    osc.connect(gain);
    connectToMaster(gain);
    osc2.connect(gain2);
    connectToMaster(gain2);

    osc.start(now);
    osc.stop(now + duration + fadeOut + 0.1);
    osc2.start(now);
    osc2.stop(now + duration + fadeOut + 0.1);
  });
}

// === ドラムシンセサイザー ===

function playKick(ctx: AudioContext, time: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.connect(gain);
  connectToMaster(gain);
  
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
  
  gain.gain.setValueAtTime(0.5, time); // 0.8 -> 0.5 (クリッピング防止)
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
  
  osc.start(time);
  osc.stop(time + 0.5);
}

function playSnare(ctx: AudioContext, time: number) {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc1.type = "triangle";
  osc2.type = "square";
  
  osc1.connect(gain);
  osc2.connect(gain);
  connectToMaster(gain);
  
  osc1.frequency.setValueAtTime(250, time);
  osc2.frequency.setValueAtTime(400, time);
  
  gain.gain.setValueAtTime(0.2, time); // 0.3 -> 0.2
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
  
  osc1.start(time);
  osc1.stop(time + 0.2);
  osc2.start(time);
  osc2.stop(time + 0.2);
}

function playHiHat(ctx: AudioContext, time: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = "square";
  osc.connect(gain);
  connectToMaster(gain);
  
  osc.frequency.setValueAtTime(8000, time);
  
  gain.gain.setValueAtTime(0.03, time); // 0.05 -> 0.03
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
  
  osc.start(time);
  osc.stop(time + 0.05);
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
      // 最後のコードがスケジュールされたので、実際の音が終わる頃合いで停止関数を呼ぶ
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

  if (isPlaying) {
    sequenceTimerId = window.setTimeout(scheduler, 25);
  }
}

export function playPaletteSequence(
  palette: PaletteChord[],
  bpm: number,
  pattern: "none" | "4beat" | "8beat" | "16beat",
  onStop: () => void
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
