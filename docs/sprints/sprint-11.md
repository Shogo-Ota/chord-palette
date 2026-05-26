## Sprint 11: ピアノ音色 3 種の高品質化（Rush / SenseElepix / Upright）

### 目的

Web Audio API 合成のみで構成された現行の 3 プリセットを、
**「人が聴いて気持ちよい周波数帯（200Hz〜4kHz）にエネルギーを集中させたクリアな音」**
に作り替える。3 音色のキャラクター差別化を明確にし、sound-critic が客観的に評価可能な
聴感チェックリストをスプリント契約に組み込む。

> **実装順序**: 本スプリントは **Sprint 10（転回形）に先行**して実施する。
> 音色基盤が安定していない状態で転回差を評価すると、音色側のノイズに埋もれて
> sound-critic / Evaluator の判定が不安定になるため。

### スコープ

#### 含む

- [`src/utils/pleasantAcoustics.ts`](../../src/utils/pleasantAcoustics.ts)
  - 共有マスターチェーンに **80Hz HPF（2nd order, Q≈0.7）** を追加（必要であれば `createMasterCleanup()` を新設）
  - **5kHz 以上の high-shelf カット**（−3〜−6 dB、`createTrebleTame()` 等）を共有チェーンに追加
  - リバーブの damp 周波数を 4.2kHz → **3.6〜4.0kHz** に下げ、空間の刺さりを抑える
  - `NATURAL_HARMONIC_GAINS` を 6 次まで微調整可能に（高次倍音を弱める）
- [`src/utils/instrumentPresets.ts`](../../src/utils/instrumentPresets.ts)
  - 3 音色を「目標スペクトル / 目標 ADSR / 目標差別化指標」に従って再チューニング
  - フィルタ Q・倍音強度・ソフトクリップ drive・コーラスデプス・リバーブセンドを 3 音色で明確に差をつける
  - `scheduleNoteVoice` のベース側にも明示的な **80Hz HPF**（ローカット）を入れる（共有 HPF と二段にする必要があれば）
- [`src/utils/audioEngine.ts`](../../src/utils/audioEngine.ts)
  - マスターチェーン構成を見直す: `dry → cleanupHPF → limiter → masterGain → destination` と
    `dry → trebleShelf → cleanupHPF → limiter → ...` のような順序整理
  - リミッターの threshold / ratio が現行 (−14dB / 2.5) のままで割れないことを確認、必要なら調整
- [`docs/pleasant-acoustics.md`](../pleasant-acoustics.md)
  - 「v2.6 で導入した周波数バランス」セクションを追記（80Hz HPF / 5kHz shelf / 3 音色の差別化目標）

#### 含まない

- サンプル音源・SoundFont の導入
- npm 音声ライブラリの追加
- 新規プリセットの追加（3 種のまま）
- 転回形セレクタ（Sprint 10）

### 周波数 / 時間ドメインの目標仕様

#### 共通（全プリセット）

| 項目 | 目標値 | 根拠 |
|---|---|---|
| ローカット | **80Hz HPF、−12 dB/oct（biquad 1 段で Q≈0.7）** | サブベース帯のモゴモゴ除去、モバイルスピーカー上でのクリア感 |
| 高域ロールオフ | **5kHz 以上を high-shelf で −3 〜 −6 dB** | 「シャリつき」「歯擦音的な刺さり」を抑制 |
| エネルギー集中帯 | **200Hz〜4kHz** | 音楽情報量が最も多く、心地よい帯域 |
| マスターリバーブ damp | 3.6〜4.0kHz LP | 空間の刺さりを抑える |
| アタック立ち上がり | **5〜15 ms** | ピアノらしい打鍵感 |
| リリース | **80〜200 ms** | 不自然な切れを避け、フレーズの繋がりを維持 |
| マスターリミッター | 既存維持（threshold −14 dB, ratio 2.5）。割れない範囲で gainMultiplier 微調整 | 過大入力時のクリッピング防止 |

#### 音色キャラクター差別化目標

| プリセット | キャラクター | 目標スペクトル | 目標 ADSR | 空間 |
|---|---|---|---|---|
| **Rush**（デフォルト） | 明るく前に出るポップピアノ（J-POP / シティポップ） | 200Hz〜5kHz フラット気味、2〜4 次倍音やや強め、高域 shelf −3 dB | A 8 ms / D 140 ms / S 0.58 / R 140 ms | reverbSend 0.25〜0.30、chorusDepth 1.0 |
| **SenseElepix** | 上品で透明感のあるエレピ寄り（バラード / アンビエント） | 倍音は基音 + 2 次中心、4 次以上控えめ。中域 1〜2kHz わずかに凹ませ透明感 | A 12〜18 ms / D 120 ms / S 0.55 / R 100〜130 ms | reverbSend 0.35〜0.45（最大）、chorusDepth 0.4〜0.6 |
| **Upright** | 暗くウォームなアップライト（ジャズ / ローファイ） | LP cutoff 3.5〜4.2kHz、高次倍音は弱め、低中域（200〜500Hz）の厚み強め | A 10 ms / D 200 ms / S 0.48 / R 150〜200 ms | reverbSend 0.15〜0.20（最少）、chorusDepth 0.4 |

差別化のキー: 1) フィルタカットオフの位置、2) 倍音バランス、3) リバーブセンド量、
4) ADSR の D と R、5) コーラスデプス。**最低 3 つの指標で明確に値が異なること**。

### スプリント契約（完了条件）

以下の全条件を満たした場合のみ、このスプリントは完了とする。

#### コード・実装

- [ ] `pleasantAcoustics.ts` に **80Hz HPF を生成するヘルパー**（例: `createCleanupHighpass(ctx)`）が追加されている
- [ ] `pleasantAcoustics.ts` に **5kHz 以上を −3〜−6 dB 減衰する high-shelf** を生成するヘルパー（例: `createTrebleShelf(ctx)`）が追加されている
- [ ] `audioEngine.ts` のマスターチェーンが上記 2 ノードを通過するように再構成されている（dry / reverb wet どちらも）
- [ ] 3 プリセット（Rush / SenseElepix / Upright）の `filterCutoffBass` / `filterCutoffTreble` / `attack` / `decay` / `release` / `chorusDepth` / `reverbSend` のうち、**少なくとも 3 指標で値が互いに異なる**ことを `INSTRUMENT_PRESETS` のリテラル値で示せる
- [ ] `scheduleNoteVoice` 内で生成するベース音にローカット（80Hz HPF）が掛かっている、または共有マスター HPF が必ず後段に入る
- [ ] 既存の `useSoftClip` / `tremoloHz` / `tremoloDepth` API は破壊変更しない
- [ ] `npm run build` が通る
- [ ] `npm run lint` が通る

#### リグレッション・後方互換

- [ ] `setPlaybackInstrument` / `playChord` / `playPaletteSequence` の **シグネチャは無変更**
- [ ] `localStorage` の `instrumentId` 互換マップ（`normalizeInstrumentId`）が引き続き機能
- [ ] 動画書き出しが従来通り完走し、出力ファイルの音に新しい周波数バランスが反映される
- [ ] Sprint 9 完了時の Tone セレクタ UI（playback-bar の `<select>`）に変更を加えない

#### 聴感（sound-critic 用チェックリスト）

各項目は **同一の試聴シナリオ** で実施する。
シナリオ A: C メジャー、BPM 90、`Cmaj7 - Am7 - Fmaj7 - G7` をループ 2 周。
シナリオ B: C メジャー、BPM 70、`Fmaj7 - Em7 - Dm7 - Cmaj7` をループ 2 周（バラード想定）。

##### 周波数バランス（全プリセット共通、シナリオ A）

- [ ] 80Hz 以下のローブースト感（モゴモゴ・ボワつき）がほぼ消えている
- [ ] 5kHz 以上の刺さり（シャリつき・歯擦音的なエッジ）が和らいでいる
- [ ] 中域（200Hz〜4kHz）の楽音情報が明瞭で、コード構成音が一音ずつ聴き取れる
- [ ] マスター音量が割れる（クリップ・歪み）瞬間がない

##### Rush（シナリオ A / B 両方）

- [ ] J-POP 的な明るさ・前に出る存在感がある
- [ ] 2〜4 次倍音の厚みで「ポップピアノらしい」キャラクターを感じる
- [ ] リバーブ感はやや短く、輪郭がぼやけない

##### SenseElepix（シナリオ B）

- [ ] バラード文脈で「上品・透明感」を感じる
- [ ] Rush と比較してアタックが明確に柔らかい（タッチが優しい）
- [ ] リバーブ・余韻が Rush / Upright よりも長く広い

##### Upright（シナリオ A / B 両方）

- [ ] 暗めで温かい、アップライトピアノ的な印象がある
- [ ] 高域が Rush と比較して明確に抑えられている（耳が疲れない）
- [ ] 低中域（200〜500Hz）の厚みが感じられる

##### 差別化（シナリオ A、Tone セレクタを切替）

- [ ] Rush ↔ SenseElepix の切替で **アタック感** に明確な差を感じる
- [ ] Rush ↔ Upright の切替で **高域の明るさ** に明確な差を感じる
- [ ] SenseElepix ↔ Upright の切替で **リバーブ感の長さ** に明確な差を感じる

### 受け入れ条件（Evaluator / Sound Critic）

- [ ] 上記「聴感（sound-critic 用チェックリスト）」の全項目に **sound-critic がチェック** する
- [ ] iOS Safari 実機で同シナリオを再生し、音割れ・無音・ノイズが発生しない
- [ ] v2.5 機能（再生・編集・履歴・動画書き出し・モバイル UI）にコード上のリグレッションなし

### 手動確認シナリオ

1. **シナリオ A 再生**: `Cmaj7 - Am7 - Fmaj7 - G7`（BPM 90、ループ）を 3 プリセットで聴き比べ
2. **シナリオ B 再生**: `Fmaj7 - Em7 - Dm7 - Cmaj7`（BPM 70、ループ）を 3 プリセットで聴き比べ
3. **音量テスト**: フォルテで連打しても割れない / リミッターの動作が自然
4. **iPhone 実機**: Safari でシナリオ A を再生し、内蔵スピーカー / イヤホン双方でクリア感を確認
5. **動画書き出し**: 各プリセットで動画書き出し→ 出力ファイルの音質が変わっていることを確認

### 依存・前提

- 既存の `voicing.ts`（Sprint 8）・`instrumentPresets.ts`（Sprint 9）の構造は維持
- 本スプリントは **Sprint 10（転回形）の前** に完了させる
- sound-critic は `npm run dev` で起動中のアプリを用いて聴感評価を実施する
