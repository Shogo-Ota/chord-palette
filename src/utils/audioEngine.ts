// === Web Audio API コードプレビューエンジン ===
// v2.2.1: iOS/Android ノイズ・歪み修正版

import type { PaletteChord } from "./musicTheory";

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let limiter: DynamicsCompressorNode | null = null;
// iOS 画面収録ブー音対策: GC されないようモジュールレベルで保持
let micStream: MediaStream | null = null;
let micSourceNode: MediaStreamAudioSourceNode | null = null;

/**
 * iOS 画面収録のブー音対策:
 * getUserMedia(audio) で AVAudioSession を .playAndRecord カテゴリに切り替える。
 * ストリームを MediaStreamSourceNode として保持し続けることでセッションを維持する
 * （destination に繋がないのでマイク音声は出力されない）。
 * コードタップのたびに呼び、画面収録開始後にアプリを開いた場合も再確立できる。
 */
function activateMicSession(): void {
  // 既にアクティブなストリームがあればスキップ
  const isActive = micStream &&
    micStream.getAudioTracks().some((t) => t.readyState === "live");
  if (isActive) return;

  navigator.mediaDevices?.getUserMedia({ audio: true })
    .then((stream) => {
      // 古いストリームがあれば停止
      micStream?.getTracks().forEach((t) => t.stop());
      micStream = stream;
      micSourceNode = getAudioContext().createMediaStreamSource(stream);
      // destination に接続しない → マイク音は出力されない（エコーなし）
    })
    .catch(() => {}); // 権限拒否・非対応環境は無視
}

function getAudioContext(): AudioContext {
  if (!audioContext) {
    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
    
    // ★ Fix 1: sampleRate を強制指定しない
    // iOS/Android はデバイス固有のサンプリングレートを使用する。
    // 強制指定するとリサンプリングが発生しノイズの原因になる。
    audioContext = new AudioCtx();
    
    // リミッター: 過度な圧縮はポンピング（ブー音）の原因になる。
    // ratio 4:1・attack 10ms・ソフトニー 6dB で自然に音量を抑える。
    limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-12, audioContext.currentTime); // -12dB から緩やかに圧縮
    limiter.knee.setValueAtTime(6, audioContext.currentTime);        // ソフトニー（滑らかな圧縮）
    limiter.ratio.setValueAtTime(4, audioContext.currentTime);       // 4:1（自然なリミッティング）
    limiter.attack.setValueAtTime(0.010, audioContext.currentTime);  // 10ms（急激な音量変化を防ぐ）
    limiter.release.setValueAtTime(0.25, audioContext.currentTime);  // 250ms（ゆっくり戻す）

    // マスターゲイン: 音数が多くても歪まないよう低めに設定
    masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(0.25, audioContext.currentTime);
    
    // 接続: 各音源 → masterGain → limiter → destination
    masterGain.connect(limiter);
    limiter.connect(audioContext.destination);

    // 初回作成時も mic セッションを確立しておく
    activateMicSession();
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
 * PaletteChordを再生する
 * ★ Fix 4: square波をやめて sine + triangle に変更（倍音が少なく合算しても歪まない）
 * ★ Fix 5: 各音のゲインを音数に応じてスケーリング
 */
export async function playChord(chord: PaletteChord, durationSec: number = 0.8, time?: number): Promise<void> {
  // ユーザージェスチャーのタイミングで mic セッションを確認・再確立
  // 画面収録オン後にアプリを開いた場合もここで .playAndRecord セッションが取れる
  activateMicSession();

  const ctx = getAudioContext();

  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  // resume 後に ctx.currentTime が進んでいる場合、過去の time をそのまま使うと
  // ADSR エンベロープが過去タイムスタンプになりゲインが突然跳ね上がる（ブー音の原因）
  // → 常に現在時刻以降にクランプする
  const now = time !== undefined
    ? Math.max(time, ctx.currentTime + 0.005)
    : ctx.currentTime;
  
  // ボイシングの最適化（高音域に寄りすぎないよう上限を設定）
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
  const attack = 0.015;  // 速すぎるアタックはクリックノイズを生む（15ms）
  const decay = 0.1;
  const sustain = 0.5;
  const release = 0.08;

  // ★ Fix 5: 音数に応じてゲインをスケーリング（同時発音数が増えても音量一定）
  const noteCount = notes.length;
  const gainScale = 1 / Math.sqrt(noteCount); // RMS正規化

  notes.forEach((note, i) => {
    const freq = midiToFreq(note);
    const isBass = i === notes.length - 1;

    // ★ Fix 4: メイン波形を sine に変更（倍音がなく歪まない）
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq, now);

    // 2倍音（triangle）で少し音に厚みを足す（sine より倍音が少ない）
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(freq * 2.0, now);

    // 各オシレーターの個別ゲイン（osc2 は抑えめ）
    const osc1Gain = ctx.createGain();
    const osc2Gain = ctx.createGain();
    osc1Gain.gain.setValueAtTime(0.8, now);
    osc2Gain.gain.setValueAtTime(0.15, now); // 倍音は控えめ

    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    // フィルターで高域を整理（クリッピング防止にも効果的）
    filter.frequency.setValueAtTime(isBass ? 500 : 3500, now);
    filter.Q.setValueAtTime(0.7, now);

    // ADSR エンベロープ（ゲインスケーリング適用）
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

    osc1.start(now);
    osc1.stop(now + duration + 0.15);
    osc2.start(now);
    osc2.stop(now + duration + 0.15);
  });
}

// === ドラムシンセサイザー ===

function playKick(ctx: AudioContext, time: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.connect(gain);
  connectToMaster(gain);
  
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);
  osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
  
  // ★ Fix: キックのゲインも下げる
  gain.gain.setValueAtTime(0.35, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
  
  osc.start(time);
  osc.stop(time + 0.5);
}

function playSnare(ctx: AudioContext, time: number) {
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(180, time);
  osc.connect(oscGain);
  connectToMaster(oscGain);
  oscGain.gain.setValueAtTime(0.15, time);
  oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
  osc.start(time);
  osc.stop(time + 0.1);

  const bufferSize = Math.floor(ctx.sampleRate * 0.2);
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
  noiseGain.gain.setValueAtTime(0.2, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
  
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  connectToMaster(noiseGain);
  
  noise.start(time);
  noise.stop(time + 0.2);
}

function playHiHat(ctx: AudioContext, time: number) {
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
  filter.frequency.setValueAtTime(7000, time);
  
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
  
  noise.connect(filter);
  filter.connect(gain);
  connectToMaster(gain);
  
  noise.start(time);
  noise.stop(time + 0.05);
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
      if (sequenceOnTick) {
        sequenceOnTick(currentChordIndex);
      }
      const chord = sequencePalette[currentChordIndex];
      const chordBeats = chord.beats || 2;
      const sustainSec = (60 / sequenceBpm) * chordBeats;
      
      playChord(chord, sustainSec, time);
      
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

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
    if (isPlaying) sequenceTimerId = window.setTimeout(scheduler, 100);
    return;
  }

  // 停止中に ctx.currentTime が進んだ場合 nextNoteTime をリセット
  // これがないと while ループで過去ノートが一斉発音されブー音になる
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
  onTick: (index: number) => void
): void {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  stopPaletteSequence();
  
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
  isPlaying = false;
  if (sequenceTimerId !== null) {
    window.clearTimeout(sequenceTimerId);
    sequenceTimerId = null;
  }
}

// ★ Fix 6: AudioContext のリセット機能（フォールバック）
// 音声エンジンが壊れた場合に完全に再初期化する
export function resetAudioEngine(): void {
  stopPaletteSequence();
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
    micSourceNode = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
    masterGain = null;
    limiter = null;
  }
}

