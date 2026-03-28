// === Web Audio API コードプレビューエンジン ===

import type { PaletteChord } from "./musicTheory";

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
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
  
  // iOS/Androidなど、ユーザーアクション直後にresumeが必要な場合への対応
  if (ctx.state === "suspended") {
    ctx.resume();
  }

  const now = time !== undefined ? time : ctx.currentTime;
  
  // ボイシングの最適化（クローズド・ボイシング・アプローチ）
  const notes = chord.intervals.map((interval, index) => {
    let note = chord.rootNote + interval;
    // ルート音(index === 0) 以外の構成音が高くなりすぎるのを防ぐ
    // C5 (MIDI: 72) 以上になる場合はオクターブ(12半音)下げて転回形にし、Diatonicの音域に馴染ませる
    if (index > 0) {
      while (note >= 72) {
        note -= 12;
      }
    }
    return note;
  });

  // サウンドに厚みを持たせるため、ベース音を追加
  // オンコードでbassNoteOverrideが設定されている場合はその音をルート化し、指定ない場合は元のrootNoteを使う
  const bass = chord.bassNoteOverride !== undefined ? chord.bassNoteOverride : chord.rootNote;
  notes.push(bass - 12); // 全体的にベース音域にするため1オクターブ下げる

  const duration = durationSec;
  const fadeOut = duration * 0.4;

  notes.forEach((note) => {
    // メインオシレーター（三角波でピアノ風）
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = midiToFreq(note);

    // 倍音追加用オシレーター（サイン波、オクターブ上で弱く）
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = midiToFreq(note) * 2;

    // ゲインノード（エンベロープ）
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration + fadeOut);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.04, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + duration + fadeOut);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

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
  gain.connect(ctx.destination);
  
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
  
  gain.gain.setValueAtTime(0.8, time);
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
  gain.connect(ctx.destination);
  
  osc1.frequency.setValueAtTime(250, time);
  osc2.frequency.setValueAtTime(400, time);
  
  gain.gain.setValueAtTime(0.3, time);
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
  gain.connect(ctx.destination);
  
  osc.frequency.setValueAtTime(8000, time);
  
  gain.gain.setValueAtTime(0.05, time);
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
  
  while (nextNoteTime < ctx.currentTime + 0.1) {
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
  nextNoteTime = ctx.currentTime + 0.05; // わずかな遅延を入れて安全にスケジュール
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
