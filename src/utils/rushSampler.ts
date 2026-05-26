/**
 * Rush 専用サンプラー（v2.9 / Sprint 14）
 *
 * smplr v0.26.x の `SplendidGrandPiano`（パブリックドメインの Steinway D サンプル）を
 * 遅延ロードして、Rush 音色のみサンプル発音に切り替える。
 *
 * 仕様:
 * - Singleton: `ensureRushSamplerLoaded()` は何度呼んでも `new SplendidGrandPiano` が 1 度しか実行されない
 * - ロード前 / エラー時: `isRushSamplerReady()` が false を返し、呼び出し側で合成版にフォールバックする
 * - 出力: 呼び出し側が用意した destination ノード（例: rushSamplerOutput）に流す
 *   既存マスターチェーン（reverbSend → trebleShelf → cleanupHPF → limiter）を完全通過する
 * - エラー後の再試行は禁止（永続フォールバック）。state === "error" のままになる
 *
 * Synth El. Piano / Upright を選択している間は `ensureRushSamplerLoaded` を呼ばないこと。
 * （無駄なネットワークアクセスを発生させない）
 */

import { SplendidGrandPiano } from "smplr";

export type RushSamplerState = "idle" | "loading" | "ready" | "error";

type SplendidGrandPianoInstance = Awaited<ReturnType<typeof createSampler>>;

let sampler: SplendidGrandPianoInstance | null = null;
let samplerState: RushSamplerState = "idle";
let loadPromise: Promise<void> | null = null;

/** state 変化のリスナー（UI 連携用）。複数登録可能。 */
type StateListener = (state: RushSamplerState) => void;
const stateListeners = new Set<StateListener>();

function setState(next: RushSamplerState) {
  if (samplerState === next) return;
  samplerState = next;
  for (const listener of stateListeners) {
    try {
      listener(next);
    } catch (err) {
      console.warn("[rushSampler] state listener threw", err);
    }
  }
}

export function getRushSamplerState(): RushSamplerState {
  return samplerState;
}

export function onRushSamplerStateChange(listener: StateListener): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

export function isRushSamplerReady(): boolean {
  return samplerState === "ready" && sampler !== null;
}

/** ロード待ち Promise の取得（videoExporter などで `await` 用）。未起動なら null。 */
export function getRushSamplerLoadPromise(): Promise<void> | null {
  return loadPromise;
}

function createSampler(ctx: AudioContext, destination: AudioNode) {
  // SplendidGrandPiano のコンストラクタは Partial<SplendidGrandPianoConfig> を受け取る。
  // - volume: 0–127 MIDI スケール。リミッターを叩きすぎないよう控えめに設定（75）
  //   sound-critic の数値解析（Sprint 14）でリアル Steinway サンプルは合成版より約 +1.5 dB 大きい予測。
  //   85 → 75 で約 -2 dB ダウンし、合成 SenseEP/Upright とのピーク段差を ~0.8 dB に縮める。
  // - destination: 既存マスターチェーンへの注入ポイント
  return new SplendidGrandPiano(ctx, {
    destination,
    volume: 75,
  });
}

/**
 * Rush サンプラーを初回呼び出し時にロードする。
 *
 * - すでに ready / error の場合は即時 resolve
 * - loading 中なら同じ Promise を返す
 * - 失敗した場合は state="error" のまま、resolve（reject しない）
 *   呼び出し側は state を見て合成版フォールバックを使うこと
 */
export async function ensureRushSamplerLoaded(
  ctx: AudioContext,
  destination: AudioNode
): Promise<void> {
  if (samplerState === "ready" || samplerState === "error") return;
  if (loadPromise) return loadPromise;

  setState("loading");

  loadPromise = (async () => {
    try {
      const instance = createSampler(ctx, destination);
      // smplr の公式 API: `.load` Promise（後方互換）or `.ready` Promise
      // どちらも同じタイミングで resolve するが、`.load` がよりわかりやすい
      await instance.load;
      sampler = instance;
      setState("ready");
    } catch (err) {
      console.warn(
        "[rushSampler] load failed; falling back to synthesis permanently",
        err
      );
      sampler = null;
      setState("error");
    }
  })();

  return loadPromise;
}

/**
 * 1 音をスケジュール発音する。
 *
 * @returns 発音できた場合 true、ready でない場合は false（呼び出し側でフォールバック）
 */
export function scheduleRushSample(
  midi: number,
  time: number,
  durationSec: number,
  velocity: number = 100
): boolean {
  if (!sampler || samplerState !== "ready") return false;
  try {
    sampler.start({
      note: midi,
      time,
      duration: durationSec,
      velocity,
    });
    return true;
  } catch (err) {
    console.warn("[rushSampler] start() failed", err);
    return false;
  }
}

/** 現在発音中のすべてのサンプル音を停止。Stop ボタン / interruption 時に呼ぶ。 */
export function stopAllRushSamples(time?: number): void {
  if (!sampler) return;
  try {
    sampler.stop(time !== undefined ? { time } : undefined);
  } catch (err) {
    console.warn("[rushSampler] stop() failed", err);
  }
}

/**
 * サンプラーを破棄し、状態を idle に戻す。
 * `resetAudioEngine()` から呼ぶこと。AudioContext close 後はサンプラーも無効化される。
 */
export function disposeRushSampler(): void {
  if (sampler) {
    try {
      sampler.dispose();
    } catch (err) {
      console.warn("[rushSampler] dispose() failed", err);
    }
  }
  sampler = null;
  loadPromise = null;
  setState("idle");
}
