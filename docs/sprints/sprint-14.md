## Sprint 14: Rush 音色のサンプル化（ハイブリッド方式 / smplr + SplendidGrandPiano）

### 目的

デフォルト音色 **Rush** だけを `smplr` 経由の実サンプル音源（SplendidGrandPiano）に置き換え、
「Web Audio 合成では到達しがたい本物の Steinway 感」を獲得する。
**Synth El. Piano / Upright は現行合成のまま維持** し、3 音色のキャラ差別化と既存挙動を守る。

完了をもって v2.9 リリース候補とする。

---

### スコープ

#### 含む

- [`package.json`](../../package.json)
  - `smplr` v0.26.x を `dependencies` に追加
- [`src/utils/instrumentPresets.ts`](../../src/utils/instrumentPresets.ts)（または新規 `src/utils/rushSampler.ts`）
  - Rush サンプラーの **遅延初期化関数**（`getRushSampler(): Promise<Sampler>`）
  - サンプラー状態（`idle / loading / ready / error`）の取得 API
  - 既存マスターチェーン（80Hz HPF + 5kHz shelf + reverbSend → limiter）へ接続するヘルパ
- [`src/utils/audioEngine.ts`](../../src/utils/audioEngine.ts)
  - `playChord(chord, duration, time?, { instrumentId, useVoiceLeading })` の **Rush 分岐**
    - sampler.isReady → sampler.start で各音発音
    - 未 ready → 既存 `scheduleNoteVoice`（合成版）でフォールバック
  - `playPaletteSequence(..., { instrumentId })` も同様に分岐
  - `stopPaletteSequence()` / `resetAudioEngine()` で sampler の発音をクリーンに停止
- [`src/utils/videoExporter.ts`](../../src/utils/videoExporter.ts)
  - 書き出し開始前に `await getRushSampler().loaded`（Rush 選択時のみ）
  - ロード失敗時はフォールバック合成版で書き出し続行（無音禁止）
- [`src/App.tsx`](../../src/App.tsx)（または `src/hooks/useRushSampler.ts` 新設）
  - sampler ライフサイクル管理（ロード中 state、エラー state）
  - Rush 選択時にロードトリガを発火
- UI 変更
  - Tone セレクタ近辺（または playback-bar 内）に **ロード中インジケータ**（例: `Rush (loading...)` / スピナー）
  - ロード完了で通常表示に戻す
- sound-critic 用 試聴チェックリスト（本ファイル末尾）

#### 含まない

- Synth El. Piano / Upright のサンプル化（合成のまま）
- 複数サンプルセットからの選択 UI（SplendidGrandPiano 固定）
- ベロシティレイヤーのユーザー UI 制御（smplr デフォルト挙動に任せる）
- Sustain ペダル / ハーフペダル機能
- ローカルバンドル化（サンプルは CDN 配信のまま）
- Tone.js / Tonejs-Instruments の導入
- Cache Storage 制御 UI（クリアボタン等）
- マスターチェーン（80Hz HPF + 5kHz shelf + reverbSend → limiter）への構造変更

---

### データフロー

```
User taps a chord (instrumentId === "rush")
  │
  ▼
playChord(chord, duration, time?, { instrumentId: "rush", useVoiceLeading })
  │
  ├── sampler === null（未初期化）
  │     → getRushSampler() を fire-and-forget で起動（ロード state を "loading" に）
  │     → 既存合成版 Rush で発音（scheduleNoteVoice）
  │
  ├── sampler.state === "loading"
  │     → 既存合成版 Rush で発音（無音禁止）
  │
  ├── sampler.state === "ready"
  │     → voicing.ts で算出した MIDI 配列を取得
  │     → 各 note について sampler.start({ note, time, duration, gain })
  │     → 出力ノードは既存 masterChain（reverbSend → limiter → masterGain）に接続
  │
  └── sampler.state === "error"
        → 既存合成版 Rush で発音（永続フォールバック）
```

**重要**: ロード中・エラー時に sampler 側を呼ぶ可能性は排除する。
合成版へのフォールバックは **同じタイムスタンプ・同じ MIDI 値・同じ gain** で発音し、
ユーザーには「音色が一瞬切り替わる」程度の体験差にとどめる。

---

### ロード戦略

| 項目 | 仕様 |
|---|---|
| トリガ | (a) Tone セレクタで Rush が選択された瞬間、または (b) Rush 選択中に最初のコードタップ |
| 同時起動防止 | `getRushSampler()` は **シングルトン Promise** を返し、複数呼び出しでも 1 度しかロードしない |
| 初回ロード時間目安 | **4G/5G で 20–40 秒**（SplendidGrandPiano の全鍵分サンプルを段階ロード） |
| 進捗 UI | ロード中は Tone セレクタ表示に `Rush (loading...)` または小スピナー。ロード完了で通常ラベル `Rush` に戻す |
| エラーハンドリング | ネットワークエラー / 404 / timeout → state を `error` に遷移、合成版フォールバックを永続化、UI に `Rush (synth)` 等の小注記を表示 |
| 2 回目以降 | Cache Storage（smplr デフォルト）経由で即時利用（数百 ms 以内に ready） |
| Rush 以外選択中 | sampler ロードは **発火しない**（無駄なネットワーク使用を避ける） |
| 動画書き出し前 | Rush 選択時のみ `await getRushSampler().loaded`、ロード失敗時は合成版で書き出し続行 |

---

### スプリント契約（完了条件）

以下の全条件を満たした場合のみ、このスプリントは完了とする。

#### コード・実装

- [ ] `package.json` の `dependencies` に `smplr` が追加され、`npm install` 後にビルドが通る
- [ ] `src/utils/` 配下に **Rush サンプラー専用モジュール**（`rushSampler.ts` または `instrumentPresets.ts` 内の新セクション）が存在する
- [ ] `getRushSampler()` がシングルトン Promise を返し、複数同時呼び出しでも `new Sampler` が **1 度しか実行されない**
- [ ] sampler 状態取得 API（`getRushSamplerState(): "idle" | "loading" | "ready" | "error"`）が提供されている
- [ ] `audioEngine.ts` の `playChord(chord, duration, time?, { instrumentId, useVoiceLeading })` が `instrumentId === "rush"` かつ `state === "ready"` のとき sampler 経由で発音する
- [ ] `playPaletteSequence` も同様に分岐し、各拍のスケジュールが sampler 経由になる
- [ ] サンプル未ロード時（`idle` / `loading` / `error`）は **既存 `scheduleNoteVoice`（合成版）でフォールバック**して必ず音が鳴る（無音禁止）
- [ ] `videoExporter.ts` の書き出し開始前に Rush 選択時のみ `await getRushSampler().loaded` を実行
- [ ] `App.tsx`（または専用 hook）が sampler ライフサイクルを管理し、`samplerState` を子コンポーネントに伝搬する
- [ ] Tone セレクタ近辺にロード中インジケータが表示される（`Rush (loading...)` または同等の視覚的サイン）

#### 音質・統合

- [ ] sampler 出力が `destination` オプション経由で **既存マスターチェーン**（80Hz HPF + 5kHz shelf + reverbSend → limiter → masterGain）を完全通過する
- [ ] サンプル音量がリミッターを過剰に叩かない（必要に応じて sampler 側 `gain` を 0.5〜0.8 程度で調整）
- [ ] 進行横断 voice-leading（Sprint 8）が **MIDI 値レベルで動作するためサンプル化しても挙動維持**（コード横断のスムーズな声部移動が聴感で確認可能）
- [ ] 転回形（Sprint 10）も **MIDI 値レベルで動作するため挙動維持**（Root / 1st / 2nd / 3rd 切替がサンプル版でも聴感差を出す）
- [ ] 動画書き出しで Rush サンプル音が MP4 の音声トラックに乗る（手動確認）

#### 後方互換

- [ ] 既存の Rush 合成コード（`pleasantAcoustics.ts` / `INSTRUMENT_PRESETS.rush` / `scheduleNoteVoice` の Rush 経路）は **削除せず残されている**（フォールバック用）
- [ ] `localStorage` の `instrumentId` 値・形式は不変（`"rush"` のまま）
- [ ] 旧 localStorage（v2.8.2 以前で書き込まれた値）からの起動で **クラッシュなく Rush が選択された状態**になり、ロード後にサンプル版で発音する
- [ ] Synth El. Piano（`senseEp`）選択時は **sampler ロードが一切発火しない**（DevTools Network タブで確認可能）
- [ ] Upright 選択時も同様に sampler ロード未発火

#### 品質ゲート

- [ ] `npm run build` 通過（TypeScript 型エラーなし）
- [ ] `npm run lint` 通過
- [ ] gzip 後の JS バンドルサイズが **145 kB を超えない**（smplr +23 kB の目安、`npm run build` の出力で確認）
- [ ] iOS Safari の AudioContext lifecycle（resume / suspend / interruption）に影響を与えていない
- [ ] v2.8.2 までの全機能（転回形 / 5 ジャンルドラム / Beat 軸独立化 / 動画書き出し / モバイル UI）にコード上のリグレッションがない

---

### 受け入れ条件（Sound Critic）

下記 3 音色 × 3 進行 = 9 組み合わせを試聴し、**少なくとも以下 4 項目すべてが満たされること**。

| 進行 \ 音色 | Rush (sampled) | Synth El. Piano (synth) | Upright (synth) |
|---|---|---|---|
| I – V – vi – IV（C メジャー） | □ | □ | □ |
| ii – V – I（C メジャー、テンション付き） | □ | □ | □ |
| 転回形混在（I / Iinv1 / Iinv2 / V7inv1） | □ | □ | □ |

判定観点：

1. **Rush の音質向上**: サンプル版 Rush が「リアルな Steinway 感」を持ち、現行合成版より明確に音質向上している（盲検でも区別可能）
2. **3 音色の音量バランス**: Rush ↔ Synth El. Piano ↔ Upright を切り替えても、ピーク音量・体感ラウドネスが大きくズレない（リミッターが Rush だけ過剰に叩かない）
3. **マスターチェーン整合性**: サンプル版 Rush でも 80Hz 以下がカットされ、5kHz 以上のハイ落ちが従来同様に効いている（耳当たり維持）
4. **動画書き出し**: Rush 選択時の MP4 を再生して、サンプル音が乗っており音割れ・無音区間がないこと

---

### 受け入れ条件（Evaluator）

- [ ] Tone セレクタで Rush を選択 → ロード中インジケータが表示される → ロード完了で本サンプル発音に切り替わる
- [ ] ロード前にコードをタップしても **フォールバックで合成版が鳴り、無音にならない**（DevTools の Performance / Audio タブで音が出ていることを確認）
- [ ] Rush 以外（Synth El. Piano / Upright）を選んでいる間は sampler ロードが一切発火しない（DevTools Network タブで `smpldsnds.github.io` への通信が **0 件**）
- [ ] 書き出し中は Tone セレクタが disabled（Sprint 9 仕様維持）
- [ ] **Cache Storage 経由で 2 回目起動時は瞬時に Rush サンプルが使える**（リロード後、Rush タップから 1 秒以内に sampler 発音）
- [ ] 4G/5G 想定（Network throttling: Fast 4G）で初回ロード 20–40 秒の範囲、ロード中もフォールバック合成で UX 悪化なし
- [ ] 375px 幅で Tone セレクタ + ロード中インジケータが他要素（BPM / Drum / Beat）と並んで崩れない（Playwright MCP）
- [ ] ループ再生中に Rush ↔ Synth El. Piano を切り替えてもクラッシュ・無音区間が発生しない

---

### 手動確認手順

1. `npm install` で smplr を取得し、`npm run dev` で起動
2. Tone を Rush 以外（例: Upright）に設定して数コード再生 → DevTools Network タブで `smpldsnds.github.io` への通信が **0 件**であることを確認
3. Tone を Rush に切り替え → Tone セレクタが `Rush (loading...)` に変わる → 完了で `Rush` に戻る
4. ロード中にコードを連打 → **すべて合成版で発音し無音にならない**
5. ロード完了後にコードを再度タップ → サンプル版の Steinway 音色に切り替わる
6. ループ再生で voice-leading（Sprint 8）と転回形（Sprint 10）が聴感で機能していることを確認
7. 動画書き出しで Rush + I–V–vi–IV を書き出し、MP4 にサンプル音が乗っていることを確認
8. ブラウザを完全終了して再起動 → Rush を選び **1 秒以内に sampler 発音**することを確認（Cache Storage 効果）
9. DevTools の Application > Cache Storage で smplr 関連のキャッシュエントリが生成されていることを確認
10. ネットワークを意図的にオフラインにして初回 Rush 選択 → エラー state → 合成版フォールバックで再生継続することを確認
11. iPhone 実機（Safari）で同上手順を実施し、AudioContext suspend / resume が正常動作することを確認（sound-critic レポートに記録）

---

### リスクと対策（調査レポートより転記）

| リスク | 影響 | 対策 |
|---|---|---|
| 初回ロード時間が長い（20–40 秒） | ユーザーが Rush を選んでも音が出ないと感じる | ロード中インジケータ表示 + 合成版フォールバックで音は鳴り続ける。Cache Storage で 2 回目以降は瞬時 |
| CDN（`smpldsnds.github.io`）の可用性 | 障害時に Rush が永続的に合成版になる | エラー state を検知して合成版で永続継続。ユーザーには `Rush (synth)` 等の小注記表示 |
| サンプル音量がリミッターを過剰に叩く | 音割れ / 他音色との音量差 | sampler 側 `gain` を 0.5〜0.8 で調整。sound-critic が 3 音色切り替えバランスを最終判定 |
| iOS Safari の AudioContext suspend 時にロード中断 | 復帰後に sampler が壊れる可能性 | smplr は標準 Web Audio のみ使用するため、既存の `resumeAudioContext()` 経路で復帰可能。Evaluator が実機確認 |
| バンドルサイズ増加（smplr +23 kB） | 初回 JS ロード遅延 | 145 kB 上限を品質ゲートに設定。超過時は dynamic import を検討（v2.9.1 以降） |
| 動画書き出し前にロード未完了 | MP4 が無音 / 合成版混在 | 書き出し開始前に `await sampler.loaded`、失敗時は合成版で書き出し続行 |
| Tone.js 等を後から導入したくなる | AudioContext 置換でリグレッション | spec.md の制約で **Tone.js 系の追加は禁止** を明記済み |

---

### 戻し先（不合格時の指針）

| 不合格項目 | 戻し先 |
|---|---|
| サンプル発音の音質・音量バランス | Generator → Sound Critic |
| ロード中フォールバックの無音 / クラッシュ | Generator |
| Network タブで Rush 以外でも通信発生 | Generator |
| ロード中インジケータの表示 / 375px レイアウト | Designer |
| 動画書き出しに Rush サンプルが乗らない | Generator |
| iOS Safari AudioContext lifecycle 不整合 | Generator |
| バンドルサイズ超過（145 kB） | Generator（dynamic import 検討） |
