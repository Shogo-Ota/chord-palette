## Sprint 12: ドラム強化（808 系合成 + 5 ジャンルパターン）

### 目的

現行の素朴なドラム合成（playKick / playSnare / playHiHat 3 種）を Roland TR-808 系の
合成手法で全面再設計し、**7 種以上のパーカッション**を揃える。さらに `none / 4beat / 8beat / 16beat` の
旧パターン構成を **`none / rock / jazz / funk / pop / soul` の 5 ジャンル**に置き換え、
コード進行のグルーヴ表現を v2.6 のピアノ音色品質に追従させる。

完了をもって v2.7 リリース候補とする。

### スコープ

#### 含む

- [`src/utils/audioEngine.ts`](../../src/utils/audioEngine.ts)
  - 7 種以上の 808 系パーカッション関数（Kick / Snare / HiHat closed / HiHat open / Clap / Tom / Rim / Cowbell から **7 種以上**を実装）
  - `DrumPattern` 型（`"none" | "rock" | "jazz" | "funk" | "pop" | "soul"`）の導入
  - `scheduleNote(beatNumber, time)` の 5 ジャンル分岐実装
  - スウィング適用（jazz / funk / soul）、ゴーストノートのベロシティ調整
- [`src/utils/storage.ts`](../../src/utils/storage.ts)
  - `PersistedState.drumPattern` を `DrumPattern` に変更
  - sanitize で旧名（`4beat` / `8beat` / `16beat`）を新ジャンル名に正規化
- [`src/components/CompositionPalette.tsx`](../../src/components/CompositionPalette.tsx)
  - Drum セレクタの `<option>` を 6 種（`none` + 5 ジャンル）に更新
  - 表示ラベルは `--- / Rock / Jazz / Funk / Pop / Soul`
- [`src/App.tsx`](../../src/App.tsx)
  - `drumPattern` ステートの型を `DrumPattern` に変更
- [`src/utils/videoExporter.ts`](../../src/utils/videoExporter.ts)
  - `VideoExportOptions.drumPattern` を `DrumPattern` に追従
- sound-critic 用試聴チェックリスト（本ファイル末尾に記載）

#### 含まない

- サンプル WAV / SoundFont 追加
- npm 音声ライブラリ追加
- ドラム音量の個別 UI 調整（マスター drumGain は据え置き）
- ユーザーがパターン自体を編集する UI（小節エディタ等）
- マスターチェーン（80Hz HPF + 5kHz shelf + limiter）への変更

---

### 808 系合成パラメータ（Planner 確定）

各パーカッションは下表のパラメータを**目安**に実装する。実装時に sound-critic の聴感で微調整可。

| 種別 | 基本構造 | ピッチ envelope | アンプ envelope | フィルタ |
|---|---|---|---|---|
| **Kick** | sine osc | 150Hz → 50Hz（exp、80ms） → 終端 0.01 | attack 1ms / decay 400–500ms（exp） | クリック用に短い triangle 5ms を加算（任意） |
| **Snare** | sine 180Hz + sine 330Hz + noise | 2 トーンは固定 | tone attack 1ms / decay 80ms、noise decay 180ms | noise: bandpass 1.5–2.5kHz / Q 0.7 |
| **HiHat Closed** | 6 矩形 osc 非調和（基準 ~320Hz、`× [2, 3, 4.16, 5.43, 6.79, 8.21]`）+ noise | なし | attack 1ms / decay 50–80ms | highpass 7kHz |
| **HiHat Open** | 同上 | なし | attack 1ms / decay 300–400ms | highpass 7kHz |
| **Clap** | noise × 3 ステップ（0ms / 10ms / 20ms に短バースト）+ 1 本長め（40ms ピーク） | なし | 短バースト decay 20ms、長め decay 200ms | bandpass 1.2–1.5kHz / Q 1.0 |
| **Tom** | sine osc | 200Hz → 80Hz（exp、100ms） | attack 1ms / decay 250ms | lowpass 800Hz |
| **Rim** | triangle 1.6kHz 短音 + noise 短バースト | なし | decay 30–50ms | highpass 1kHz |
| **Cowbell** | 矩形 800Hz + 矩形 540Hz | なし | attack 1ms / decay 200ms | bandpass 800Hz / Q 2.0 |

**実装必須**: 上表のうち **少なくとも 7 種**（Kick / Snare / HiHat Closed / HiHat Open + 任意 3 種以上）。
Clap・Tom・Rim・Cowbell から **3 種以上**は必ず実装する。

すべて `connectToMaster(node, true)` 経由でドラムバス（drumGain → 80Hz HPF → limiter）に接続する。

---

### ジャンル別パターン（Planner 確定、16th グリッド）

`scheduleNote(beatNumber, time)` の `beatNumber` は 16th 単位（1 小節 = 16 ステップ）。
ステップは 0–15、`X = ヒット`、`.` = 無音、`g` = ゴーストノート（通常の 50% ベロシティ）。

#### Rock

```
ステップ:    0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
Kick:        X  .  .  .  .  .  .  .  X  .  .  .  .  .  .  .
Snare:       .  .  .  .  X  .  .  .  .  .  .  .  X  .  .  .
HiHat C:     X  .  X  .  X  .  X  .  X  .  X  .  X  .  X  .
```
- スウィング: なし（ストレート）
- 性格: 4 分キック + バックビート + 8 分ハイハット

#### Jazz

```
ステップ:    0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
Kick:        X  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .
Snare(g):    .  .  .  .  g  .  .  .  .  .  .  .  g  .  .  .
HiHat C:     X  .  .  X  X  .  .  X  X  .  .  X  X  .  .  X
```
- スウィング: **三連符フィール**（16th 裏 = step 3,7,11,15 の発音を `+ (1/3 × 16th 間隔)` だけ後ろにずらす）
- 実装: `const swingDelay = (step % 4 === 3) ? sixteenthSec * (1/3) : 0;`
- スネアはゴーストノートのみ（弱拍ブラシ感）

#### Funk

```
ステップ:    0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
Kick:        X  .  .  .  .  .  X  .  X  .  .  .  .  .  X  .
Snare:       .  .  .  .  X  .  .  .  .  .  g  .  X  .  .  .
HiHat C:     X  X  X  X  X  X  X  X  X  X  X  X  X  X  X  X
HiHat O:     .  .  X  .  .  .  .  .  .  .  X  .  .  .  .  .
```
- スウィング: **軽いスウィング**（16th 裏 step 1,3,5,7,9,11,13,15 を `+ (1/6 × 16th 間隔)` だけ後ろ）
- HiHat C と HiHat O が同ステップで衝突する場合は **O を優先**（C を発音しない）
- step 10 にゴーストスネア

#### Pop

```
ステップ:    0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
Kick:        X  .  .  .  .  .  .  .  X  .  .  .  .  .  .  .
Snare:       .  .  .  .  X  .  .  .  .  .  .  .  X  .  .  .
HiHat C:     X  .  X  .  X  .  X  .  X  .  X  .  X  .  X  .
```
- スウィング: なし
- 性格: Rock と似るが Kick はバスドラ的にシンプル（1, 9 のみ）、ハイハットも控えめ音量で実装側調整

> **Rock と Pop の差分**: Rock は Kick が 4 分（0, 4, 8, 12）でアグレッシブ、Pop は Kick が 2 つ（0, 8）でシンプル。
> 上表は Pop のパターン。Rock パターンの Kick を以下に再記載:
> ```
> Rock Kick (改): 0:X 4:X 8:X 12:X
> ```
> **Generator はこの「Rock = Kick 4 分」「Pop = Kick 2 つ」を必ず実装で差別化すること。**

#### Soul（ハーフタイムシャッフル）

```
ステップ:    0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
Kick:        X  .  .  .  .  .  .  .  .  .  X  .  .  .  .  .
Snare:       .  .  .  .  .  .  .  .  X  .  .  .  .  .  g  .
HiHat C:     X  .  .  X  X  .  .  X  X  .  .  X  X  .  .  X
```
- スウィング: **三連符フィール**（jazz と同じく step 3,7,11,15 を `+ (1/3 × 16th 間隔)`）
- ハーフタイム = スネアが 1 小節 1 回（step 8）に集約、step 14 にゴーストノート

---

### スウィング適用ルール（共通）

- ストレート: `scheduleAt = baseTime`
- 軽いスウィング（funk）: 16th 裏ステップ（step % 2 === 1）の `scheduleAt = baseTime + sixteenthSec / 6`
- 三連符フィール（jazz / soul）: 16th 裏ステップ（step % 4 === 3）の `scheduleAt = baseTime + sixteenthSec / 3`

`sixteenthSec = (60 / bpm) / 4`

---

### スプリント契約（完了条件）

以下の全条件を満たした場合のみ、このスプリントは完了とする。

#### 音質・合成

- [ ] `playKick` / `playSnare` / `playHiHatClosed` / `playHiHatOpen` の 4 種が 808 系合成で実装され、上記パラメータ表の数値を実装に反映している
- [ ] `playClap` / `playTom` / `playRim` / `playCowbell` のうち **3 種以上**が実装されている（合計 7 種以上のパーカッション）
- [ ] 各パーカッションは `connectToMaster(node, true)` 経由で drumGain に接続され、マスターチェーン（80Hz HPF + limiter）を経由している
- [ ] Kick のピッチエンベロープが `150Hz → 50Hz` の指数減衰で実装されている（コード内で数値確認可能）
- [ ] HiHat Closed / Open が **同じ 6 矩形波構成**を共有し、エンベロープ長のみで差別化されている
- [ ] Snare に **2 トーン（180Hz + 330Hz）**と **バンドパスノイズ（1.5–2.5kHz）**の両方が実装されている

#### ジャンルパターン

- [ ] `DrumPattern` 型が `"none" | "rock" | "jazz" | "funk" | "pop" | "soul"` の Union として定義されエクスポートされている
- [ ] `scheduleNote(beatNumber, time)` が 5 ジャンル全てを分岐実装している
- [ ] Rock のキックが `step % 4 === 0` で発音（0, 4, 8, 12）
- [ ] Pop のキックが `step % 8 === 0` で発音（0, 8）
- [ ] Funk のハイハットが 16 ステップ全てで発音（step 2, 10 は Open）
- [ ] Jazz / Soul のハイハットが `step % 4 === 3` で三連符スウィング遅延を持つ
- [ ] ゴーストノートはベロシティ（ゲイン値）が通常の **0.4 〜 0.5 倍**で発音される

#### UI

- [ ] CompositionPalette の Drum `<select>` の選択肢が `none / rock / jazz / funk / pop / soul` の 6 種
- [ ] 表示ラベルが `--- / Rock / Jazz / Funk / Pop / Soul`（先頭は「ドラムなし」を意味する `---` でも `Drumなし` でも可）
- [ ] 375px 幅で Drum セレクタが他要素（BPM / Tone）と並んで崩れない
- [ ] 選択中ジャンルが localStorage に保存され、リロード後も復元される

#### 後方互換

- [ ] `storage.ts` の sanitize 関数が旧名を以下のように正規化する
  - `"4beat"` → `"rock"`
  - `"8beat"` → `"pop"`
  - `"16beat"` → `"funk"`
- [ ] 不正値・undefined は `"none"` に正規化される
- [ ] 旧 localStorage（`drumPattern: "8beat"` を含む JSON）からの起動で Pop が選択された状態になる
- [ ] `videoExporter.ts` の `VideoExportOptions.drumPattern` が `DrumPattern` 型を参照している
- [ ] `setSequencePattern(pattern: DrumPattern)` のシグネチャに変更され、`audioEngine` の全ての参照箇所が型エラーなく解決する

#### 品質ゲート

- [ ] `npm run build` 通過（TypeScript 型エラーなし）
- [ ] `npm run lint` 通過
- [ ] v2.6 機能（転回形 / 3 音色 / 動画書き出し）にコード上のリグレッションがない
- [ ] iOS Safari の AudioContext lifecycle（resume / interruption）に影響を与えていない

---

### 受け入れ条件（Evaluator / Sound Critic）

#### Evaluator（UI・契約網羅）

- [ ] Drum セレクタを Rock → Jazz → Funk → Pop → Soul の順で切り替え、すべての選択でエラーなく再生開始できる
- [ ] BPM 60 / 120 / 180 のいずれでもクラッシュなく演奏する
- [ ] none 選択時にドラムが完全に無音である（Kick / Snare / HiHat が一切スケジュールされない）
- [ ] ループ再生時、各ジャンルが小節境界で正しくループする（パターンが途中で崩れない）
- [ ] 動画書き出し時、選択中のジャンルパターンが MP4 の音声トラックに乗ること（ユーザー手動確認可）
- [ ] 375px 幅で playback-bar が破綻しないことを `Playwright MCP` で確認

#### Sound Critic（聴感）

下記 5 × 3 = 15 組み合わせのうち、**少なくとも 10 組み合わせで「v2.6 比で音質が改善した」**と判断できる。

| ジャンル \ 音色 | Rush | Synth El. Piano | Upright |
|---|---|---|---|
| Rock | □ | □ | □ |
| Jazz | □ | □ | □ |
| Funk | □ | □ | □ |
| Pop | □ | □ | □ |
| Soul | □ | □ | □ |

判定観点:

1. **Kick のローエンド感**: 80Hz HPF を経由しても十分な体感的低域がある
2. **Snare の存在感**: コード音色（特に Rush の上声部）と被らず抜ける
3. **HiHat の自然さ**: 旧 noise + HPF より金属的・倍音的に聴こえる
4. **ジャンル識別性**: Rock / Jazz / Funk / Pop / Soul が**目隠しテストでも区別可能**
5. **スウィング感**: Jazz / Funk / Soul のグルーヴが「機械的な等間隔」と異なる

---

### 手動確認手順

1. `npm run dev` で起動、Tone を Rush に設定
2. C メジャーで I – vi – IV – V を入力
3. Drum セレクタを Rock → Jazz → Funk → Pop → Soul の順に切り替えて再生
4. 各ジャンルで以下を確認
   - キックが期待ステップで鳴っている
   - スネアがバックビート位置（Rock/Pop は 4,12 / Funk は 4,12 / Soul は 8）
   - ハイハットの密度（Rock/Pop は 8 分、Funk は 16 分、Jazz/Soul は三連符スウィング）
5. 旧 localStorage の検証
   - DevTools で `cp_state_v1` の `drumPattern` を手動で `"8beat"` に書き換える
   - リロード後、Drum セレクタが `Pop` を選択した状態になることを確認
6. 動画書き出しで Soul を選択し、書き出した MP4 の音声を確認
7. iPhone 実機で同上（sound-critic レポートに記録）

---

### 戻し先（不合格時の指針）

| 不合格項目 | 戻し先 |
|---|---|
| 音色合成パラメータ（808 系の質感） | Generator → Sound Critic |
| ジャンルパターンのリズム構造 | Generator |
| UI 表示・375px レイアウト | Designer |
| 互換マップ・localStorage 復元 | Generator |
| 動画書き出しでドラムが乗らない | Generator |
