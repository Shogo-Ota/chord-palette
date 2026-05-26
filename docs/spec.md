# Chord Palette v2.7（ドラム強化：808 系合成 + 5 ジャンルパターン）

## 概要（v2.7）

v2.6 でピアノ系音色（Rush / Synth El. Piano / Upright）の高品質化が完了したのを受け、
**「コード進行のグルーヴを支えるリズム部」** を同等の品質まで引き上げる。
本リリースは Sprint 12 単独で完結し、v2.6 系の機能・UI にリグレッションを出さない範囲で
ドラム生成・パターン・UI を刷新する。

### 二本柱

1. **808 系合成パーカッション**
   現行 3 種（Kick: sine sweep / Snare: triangle + bandpass noise / HiHat: noise + HPF）を
   Roland TR-808 系の合成手法で全面再設計し、**7 種以上**のパーカッションを揃える。
   - **Kick**: 長いサインの指数減衰 + 短いピッチエンベロープ + クリッキーなアタック
   - **Snare**: 2 トーン（180Hz + 330Hz） + チューニング可能なノイズ + 短リリース
   - **HiHat (Closed/Open)**: 6 矩形波の非調和ミックス + HPF + 短/長エンベロープ
   - **Clap**: 3 ステップの短ノイズバースト + バンドパス
   - **Tom**: 中域サイン + ピッチエンベロープ
   - **Rim shot**: 短いトーン + ハイパス
   - **Cowbell**: 2 矩形波（800Hz + 540Hz）非調和ミックス
   - すべて既存マスターチェーン（80Hz HPF + 5kHz shelf + limiter）を経由
   - 動画書き出し（`videoExporter.ts`）にも自動的に反映される

2. **5 ジャンルパターン**
   `none` 以外の選択肢を `rock / jazz / funk / pop / soul` に置き換える。
   - 各パターンは **1 小節 = 16th note × 16 ステップ** のグリッドで明示
   - スウィング比率（jazz / funk / soul）とゴーストノートのベロシティを Planner で確定
   - 旧 `4beat / 8beat / 16beat` は localStorage 互換マップで `rock / pop / funk` に正規化

### v2.7 機能一覧

| 優先度 | 機能 | スプリント |
|---|---|---|
| 高 | `audioEngine.ts` 内 808 系合成（7 種以上のパーカッション） | Sprint 12 |
| 高 | `DrumPattern = "none" \| "rock" \| "jazz" \| "funk" \| "pop" \| "soul"` 型導入 | Sprint 12 |
| 高 | 各ジャンルの 16th グリッドパターン実装（スウィング・ゴーストノート含む） | Sprint 12 |
| 高 | CompositionPalette Drum セレクタの選択肢更新（5 ジャンル + none） | Sprint 12 |
| 高 | `storage.ts` の旧パターン名互換マップ（`4beat→rock` / `8beat→pop` / `16beat→funk`） | Sprint 12 |
| 高 | `videoExporter.ts` の `drumPattern` 型を `DrumPattern` に追従 | Sprint 12 |
| 中 | sound-critic 用 試聴チェックリスト（5 ジャンル × 音色 3 種の組み合わせ） | Sprint 12 |

### v2.7 で守る制約

- 既存の v2.6 機能（転回形 / Rush・Synth El. Piano・Upright / 動画書き出し / モバイル UI）にリグレッションを出さない
- 375px モバイル最優先、iOS Safari の AudioContext lifecycle 維持
- サンプル WAV / SoundFont / 外部音声 npm パッケージは **追加しない**（Web Audio API 合成のみ）
- 旧 localStorage（`drumPattern: "4beat" | "8beat" | "16beat"`）から復元しても **クラッシュせず正規化**して動作する
- マスターチェーン構成（drumGain → 80Hz HPF → limiter）に変更を加えない
  - ドラム個別の音作りに必要なフィルタは playKick 等の内部で完結させる
- 動画書き出し時にドラム音が正しく `MediaStreamAudioDestinationNode` に乗ること

### 旧パターン名 → 新ジャンル名 マッピング（Planner 確定）

| 旧 | 新 | 根拠 |
|---|---|---|
| `4beat` | `rock` | 4 分キック + バックビート構造を維持。ロック寄りの素朴さに近い |
| `8beat` | `pop` | 8 分ハイハットの定番形を踏襲。最も保守的に近い |
| `16beat` | `funk` | 16 分ハイハット + シンコペーションが意図に最も近い |
| `none` | `none` | 変更なし |

`jazz` / `soul` は完全新規。旧設定からの自動マップ先には選ばない（ユーザーの明示選択を要求）。

---

# Chord Palette v2.6（音質クオリティ大幅向上：転回形選択 + ピアノ音色 3 種の高品質化）

## 概要（v2.6）

v2.5 までで完成した「統一ボイシング + 合成音色プリセット」を土台に、
**「音を聴いて気持ちよい」「コード進行をより細やかに表現できる」** を二本柱として音質クオリティを引き上げる。

1. **転回形セレクタ（Inversion Selector）**
   各コードに **Root / 1st / 2nd / 3rd** の転回を明示的に指定できる。
   テトラッド（4 音）のみ 3rd inv を許可し、トライアド（3 音）は最大 2nd inv まで。
   `PaletteChord.inversion: 0 | 1 | 2 | 3` を新設し、`voicing.ts` は転回指定があれば
   進行横断 voice-leading よりユーザー指定を優先する。
   ChordSelectorSheet（編集中ピル）から 4 ボタンで切替、localStorage に永続化、
   動画書き出しにも反映。

2. **ピアノ音色 3 種の高品質化（Rush / SenseElepix / Upright）**
   現行の Web Audio 合成（`pleasantAcoustics` 系）を発展させ、
   **200Hz〜4kHz をエネルギーの中心**、**5kHz 以上はソフトロールオフ**、
   **80Hz 以下はローカット**でクリア感と耳当たりを両立する。
   3 音色の **キャラクター差別化目標** を明確化し、sound-critic が客観的に評価できる
   聴感チェックリストを Sprint 11 に記載する。

### v2.6 機能一覧

| 優先度 | 機能 | スプリント |
|---|---|---|
| 高 | `PaletteChord.inversion` 追加 + `voicing.ts` の転回優先ロジック | Sprint 10 |
| 高 | ChordSelectorSheet に転回トグル（Root / 1st / 2nd / 3rd）UI 追加 | Sprint 10 |
| 高 | localStorage / 動画書き出しへの `inversion` 連携 | Sprint 10 |
| 高 | `pleasantAcoustics.ts` の周波数バランス再設計（200Hz〜4kHz 中心、80Hz HPF / 5kHz LP shelf） | Sprint 11 |
| 高 | Rush / SenseElepix / Upright のキャラクター差別化（倍音構成・フィルタ・ADSR・空間） | Sprint 11 |
| 高 | sound-critic 用 聴感チェックリスト（コード進行 × 3 音色の試聴シナリオ） | Sprint 11 |

### v2.6 で守る制約

- 既存の v2.5 機能（再生・編集・履歴・動画書き出し・モバイル UI）にリグレッションを出さない
- 375px モバイル最優先、iOS Safari の AudioContext lifecycle 維持
- サンプル音源・外部音声 npm パッケージは **追加しない**（Web Audio API 合成のみ）
- `PaletteChord.rootNote` / `intervals` は理論データとして不変。**発音 MIDI のみ** voicing で決定
- 旧 localStorage（`inversion` 未保持）から読み出した場合は `inversion = 0`（Root）に既定

### 推奨実装順序（Planner 確定）

**Sprint 11（音色高品質化）→ Sprint 10（転回形）の順** を強く推奨する。

- 音色基盤（周波数バランス・3 音色の差別化）が整っていない状態で転回形を導入すると、
  「転回ごとの聴感差」の評価が音色側のノイズに埋もれ、sound-critic / Evaluator の判定が安定しない
- Sprint 11 は `pleasantAcoustics.ts` / `instrumentPresets.ts` に閉じた変更が中心で、
  UI / 永続化 / 動画書き出しへの波及がなく、独立して完了させやすい
- Sprint 10 は UI（ChordSelectorSheet）・型変更（`PaletteChord`）・永続化・動画書き出しまで
  横串で触るスプリントなので、音色が落ち着いた後に進めるとリグレッション切り分けが容易
- Sprint 10 の動作確認時にも、品質の上がった音色で転回差を聴き分けできるという副次効果がある

---

# Chord Palette v2.5（音色プリセット + 統一ボイシング）

## 概要（v2.5）

v2.4 の動画エクスポート・モバイル UI を維持したまま、**オーディオ品質**を次の 2 軸で改善する。

1. **音色プリセット（合成 3 種）**: **Rush**（推奨・デフォルト）/ SenseElepix / Upright。playback-bar の **Tone** で切替、`localStorage` に保存。Rush は [`pleasantAcoustics`](./pleasant-acoustics.md) に基づく倍音列・微コーラス・短リバーブ
2. **統一ボイシング**: クローズボイシング + 進行横断 nearest-neighbor。和音内スパン上限 12 半音

サンプル音源・npm 音声ライブラリは追加しない（Web Audio API 合成のみ）。

> **註（v2.6 時点の現状）:** Sprint 9 完了直後は 5 種（synthEp / grand / rhodes / wurli / upright）で出荷したが、
> その後の整理で **Rush / SenseElepix / Upright の 3 種に集約**された（`INSTRUMENT_IDS` 参照）。
> 旧 ID は `normalizeInstrumentId()` で互換マップされ、Rush / SenseElepix / Upright のいずれかに正規化される。
> v2.6 Sprint 11 ではこの 3 種をベースに各音色を高品質化する。

### v2.5 機能一覧

| 優先度 | 機能 | 状態 |
|---|---|---|
| 高 | `voicing.ts` — ベース 36–48、上声部 48–72、ボイスリーディング | 完了（Sprint 8） |
| 高 | `instrumentPresets.ts` — 合成 5 種 + `scheduleNoteVoice` | 完了（Sprint 9） |
| 高 | Tone セレクタ + `instrumentId` 永続化 | 完了（Sprint 9） |
| 高 | 動画書き出しへの `instrumentId` 連携 | 完了（Sprint 9） |

### v2.5 で守る制約

- iOS Safari の AudioContext resume / 動画 `MediaStreamAudioDestinationNode` 連携を維持
- `PaletteChord.rootNote` / `intervals` は理論データとして維持し、**発音 MIDI のみ** voicing で決定
- 375px 幅で playback-bar（BPM / Drum / Tone）が破綻しないこと

---

# Chord Palette v2.4（動画エクスポート + 実機 iPhone 対応）

## 概要

v2.3.0 までで成熟したモバイル特化コード進行ビルダーを土台に、v2.4 では
**「作った進行を “映像 + 音” として SNS ストーリーに直接投げ込める」体験**と
**「実機 iPhone で破綻なく使える UI」**を完成させる。

主軸は次の 3 点。

1. **🎬 動画エクスポート**: パレットの再生（画面の動き + 音）を 1 本の縦型 MP4 として書き出し、
   Instagram / TikTok ストーリーに **Web Share API で 1 タップ共有**できる
2. **実機 iPhone UI 回収**: safe-area / Key セレクタ / ヘッダー折り返しの破綻を解消
3. **非 HTTPS（LAN 開発）でも壊れないクリップボード**: `navigator.clipboard` 不可環境への fallback 整備

---

## SNS 共有方針（v2.4 で確定）

### 採用しない手段

- **iOS 標準の画面録画**: Web Audio API の AudioContext を OS が suspend/interrupt するため、
  ブラウザアプリの音が録画に乗らない問題が既知。v2.3 で軽減策を入れたが根治不能と判断。
- **PNG カード + 音声ファイルの 2 ファイル共有（旧 Sprint 5 案）**: 受け側 SNS（特に Instagram / TikTok ストーリー）が
  「画像」と「音」を同時に扱う UI を持たず、結局ユーザーが手動で動画を作る手間が残るため破棄。

### 採用する手段

**ブラウザ内で動画（縦型 MP4 / WebM）を生成し、Web Share API で送る。**

- Canvas に進行アニメーションをフレーム描画 → `canvas.captureStream(fps)` でビデオトラック取得
- Web Audio の `MediaStreamAudioDestinationNode` でオーディオトラック取得
- 両トラックを 1 つの `MediaStream` に合成し `MediaRecorder` で記録
- 出力ファイルを `File` として `navigator.share({ files: [...] })` に渡す
- 非対応環境ではダウンロード fallback

iOS 画面録画を一切経由しないため、AudioContext の挙動に左右されず常に音が乗る。

### 共有手段マトリクス（v2.4 完成時）

| 手段 | 内容 | iOS Safari | Android Chrome | Desktop |
|---|---|---|---|---|
| テキスト | `CM7 - Am - F - G` + ハッシュタグ + URL | ○ | ○ | ○ |
| 🎬 動画 | Canvas+音声の MediaRecorder で MP4/WebM 生成 → Web Share | ○ (16.4+) | ○ | △ (DL fallback) |

優先度は **動画 > テキスト**。動画書き出し非対応環境ではテキストコピーへ自動 fallback する。

---

## ターゲットユーザー

- スマホで素早くコード進行を試したい作曲家・ミュージシャン
- 進行を **Instagram / TikTok ストーリー** にそのまま流したいクリエイター
- Twitter / X / LINE などにも気軽に共有したいユーザー
- 音楽理論の知識はあるが、DAW ほど重いツールは不要なユーザー
- iPhone（iOS 16.4 以降の Safari）での利用を想定する初見ユーザー

---

## 機能一覧（v2.4 スコープ）

| 優先度 | 機能 | 状態 |
|---|---|---|
| 高 | 🎬 動画エクスポート（縦型 MP4/WebM、Web Share / DL fallback） | 仕様確定（Sprint 5） |
| 高 | Canvas 動画レンダリング（コード進行アニメ + Key/BPM + ロゴ/URL） | 仕様確定（Sprint 5） |
| 高 | MediaRecorder による映像+音声合成（`captureStream` + `MediaStreamAudioDestinationNode`） | 仕様確定（Sprint 5） |
| 高 | iPhone Safari でのヘッダー UI 回収（Key 見切れ / 折り返し / safe-area） | 未完了（Sprint 6） |
| 高 | LAN（非 HTTPS）クリップボード fallback | 実装済み・要検証（Sprint 7） |
| 中 | 動画書き出し中の UI 状態表示（プログレスバー or ⏺ パルス、再生 disabled） | 仕様確定（Sprint 5） |
| 中 | 共有テキストのフォーマット統一（ハッシュタグ + URL） | 流用（旧 Sprint 5 → 維持） |
| 低 | 動画解像度ユーザー選択 / フィルター / カバー画像 | v2.5 以降 |
| 低 | 短調対応 | v2.5 以降 |
| 低 | URL パラメータ共有 | v2.5 以降 |

---

## 旧 Sprint 5 アセットの破棄・流用方針

v2.4 開発の途中まで進んでいた「PNG カード + 音声ファイル」案は **動画エクスポートに置き換えるため破棄**。
ただし以下は動画エクスポートでも流用する。

### 破棄するもの（Sprint 5 Generator フェーズで削除指示）

- `src/utils/shareCard.ts` — PNG カード描画。動画では Canvas にフレーム描画するため不要。
- `src/utils/shareProgression.ts` — PNG + 音声の共有オーケストレータ。動画版のオーケストレータに置き換え。
- `src/utils/audioEngine.ts` の `recordPaletteSequenceToBlob` 関連 — 音声単独録音用。動画では映像と合成する別経路が必要なため、
  「MediaStream を返す `captureSequenceToStream` のような関数」に置き換え。
- `src/index.css` の `.btn-share` 専用スタイルのうち、PNG 共有を前提とした文言・アイコン依存部分。

### 流用するもの（そのまま残す or 軽微な調整）

- `src/utils/clipboard.ts` — テキストコピー fallback。`copyTextToClipboard` のロジックは Sprint 7 で検証する形のまま使う。
- 既存の 📋 コピー機能（テキストのみ）— 動画エクスポート失敗時の最終 fallback としても使う。
- `buildShareText(palette, key, bpm)` 相当のテキスト生成 — 動画共有時の `navigator.share({ text })` 引数として再利用。
- `App.tsx` の `isExportingAudio` ライフサイクル抑止メカニズム — `isExportingVideo` として同じ仕組みを流用。
- `audioEngine.ts` の `getAudioContext` / limiter / masterGain / drumGain ノードグラフ — `MediaStreamAudioDestinationNode` を
  limiter からタップする方式は旧録音実装と同じ。

---

## 既存（v2.3 で完了済み）

| 機能 | 完了スプリント |
|---|---|
| 再生コントロール UI 再設計（Header 集約 + playback-bar） | Sprint 1 |
| 画面録画時の音声安定化（AudioContext lifecycle） | Sprint 2 |
| バリエーションツールバー化 | Sprint 3 |
| 初回オンボーディング / localStorage 永続化 / 進行コピー / 日本語ラベル / PWA manifest | Sprint 4 |

---

## 技術スタック

- React 19 + TypeScript + Vite 8
- TailwindCSS v4 + `src/index.css`（カスタム CSS）
- Framer Motion 12
- Web Audio API（自前 `audioEngine.ts`）
- **Canvas 2D**（動画フレーム描画、`requestAnimationFrame` で進行アニメをドロー）
- **`HTMLCanvasElement.captureStream(fps)`**（ビデオトラック取得）
- **`AudioContext.createMediaStreamDestination()`**（オーディオトラック取得）
- **MediaRecorder API**（映像+音声合成、MIME フォールバック順は下記）
- Web Share API（`navigator.share` + `navigator.canShare({ files: [videoFile] })`）
- `document.execCommand("copy")` フォールバック（非 secure context 対応、Sprint 7）

### 動画フォーマット仕様（Planner 確定）

| 項目 | 値 |
|---|---|
| アスペクト比 | 9:16（縦型、Instagram / TikTok ストーリー準拠） |
| 解像度 | **720 × 1280**（モバイル端末での Canvas 描画負荷とファイルサイズのバランスで採用。1080×1920 はパフォーマンス未検証のため v2.5 以降で検討） |
| フレームレート | **30 fps** |
| ビデオビットレート目安 | 2.5 Mbps（MediaRecorder の `videoBitsPerSecond`） |
| オーディオビットレート目安 | 128 kbps |
| 動画長さ上限 | パレット全長の **1 周再生**（最大 16 小節 / おおむね 30 秒以内）。それを超える場合は最初の 16 小節までで切る |
| MIME 試行順序 | 1. `video/mp4;codecs=avc1.42E01E,mp4a.40.2` → 2. `video/mp4` → 3. `video/webm;codecs=vp9,opus` → 4. `video/webm;codecs=vp8,opus` → 5. `video/webm` |
| ファイル名 | `chord-palette-<YYYYMMDD-HHmmss>.mp4`（実際の拡張子は採用 MIME に追従） |

### 動画画面構成（縦型 720×1280）

```
┌─────────────────────────┐  ← 0px
│        (top safe)        │
│    ♪ Chord Palette       │  ← ロゴ + タイトル（高さ ~120px）
│    Key: C Major · BPM 120│  ← サブ情報
├─────────────────────────┤
│                          │
│   ┌──┐ ┌──┐ ┌──┐ ┌──┐    │
│   │I │→│vi│→│IV│→│V │    │  ← 進行ピル列（4 列以上は折り返し or 横スクロール演出）
│   │CM│ │Am│ │F │ │G │    │     再生中のコードに白枠+グロー
│   └──┘ └──┘ └──┘ └──┘    │
│                          │
│   ●●●●○○○○ (進行バー)     │  ← 任意：再生位置インジケータ
│                          │
├─────────────────────────┤
│   chord-palette.vercel.app│  ← フッター URL（高さ ~80px）
│        (bottom safe)      │
└─────────────────────────┘  ← 1280px
```

- 背景: ダークグラデーション（既存アプリと統一感のあるトーン）
- ピル配色: 既存の T/SD/D カラーをそのまま使用
- 再生中ピルの強調: 白枠 + 軽いグロー（既存 `.playing` クラス相当を Canvas で再現）
- フォント: システムフォント（端末差を吸収）

---

## v2.4 で守る制約

- **375px 幅を最優先**でレイアウト検証する（iPhone SE2 / iPhone 13 mini 想定）
- **safe-area-inset**（ノッチ・ホームインジケータ）に必ず対応する
- **動画書き出し中は通常再生 lifecycle を一時停止する**（`visibilitychange` での自動停止を `isExportingVideo` フラグで抑止）
- **動画書き出し失敗時は必ずテキストだけでも届く**ように段階的 fallback を組む
- **動画録画中はバックグラウンドに行かない前提で UI を組む**（フォアグラウンド維持の注意トーストを表示）
- 既存の v2.3 機能（再生・編集・履歴・オンボーディング）にリグレッションを出さない
