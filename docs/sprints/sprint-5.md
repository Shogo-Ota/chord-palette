## Sprint 5: 🎬 動画エクスポート（縦型 MP4 / Web Share）

### 背景

iOS の画面録画は Web Audio の AudioContext を suspend/interrupt するため、ブラウザアプリの音は録画に乗らない。
これは OS 仕様に近く、アプリ側での完全解決は困難。

旧 Sprint 5 では「PNG カード + 音声ファイル」を別々に共有する方針を取っていたが、
Instagram / TikTok ストーリー側に「画像と音を同時にハンドリングする UI」が無く、
結局ユーザーが手動で動画化する必要があるため UX 上ボトルネックになっていた。

そこで v2.4 では方針を切り替え、**ブラウザ内で動画（縦型 MP4）を生成して Web Share で投げる**形に再設計する。
iOS 画面録画を経由せず、Web Audio の音をそのまま `MediaStreamAudioDestinationNode` から取り出して
Canvas の `captureStream` と合成するため、AudioContext の interrupt 問題と無関係になる。

### 目的

ユーザーが組み立てた進行を、1 タップで **1 本の縦型動画ファイル**として生成し、
**Instagram / TikTok ストーリー / X / LINE** などに `navigator.share({ files: [video] })` で
そのまま投稿できる状態にする。

### スコープ

#### 含む

- `src/utils/videoExporter.ts`（新規）: Canvas 描画 + Audio 合成 + MediaRecorder のオーケストレータ
- `src/utils/videoRenderer.ts`（新規）: 1 フレーム分の Canvas 描画ロジック（進行ピル / Key・BPM / ハイライト / ロゴ・URL）
- `src/utils/audioEngine.ts` への変更:
  - 旧 `recordPaletteSequenceToBlob`（音声単独録音）を **削除**
  - 代わりに **「再生中のオーディオを `MediaStreamAudioDestinationNode` にタップする API」** を追加
    （例: `attachCaptureDestination(): MediaStream` / `detachCaptureDestination(): void`）
  - `isExportingAudio` フラグを **`isExportingVideo`** にリネーム（lifecycle 抑止の意味は同じ）
- `src/utils/shareVideo.ts`（新規）: Web Share / DL fallback のオーケストレータ
- `src/utils/clipboard.ts`: **流用**（変更なし）
- `src/components/CompositionPalette.tsx`: 既存の 📤 ボタンを **🎬 ボタンに置き換え**
- `App.tsx`: `handleShareProgression` を `handleExportVideo` に置き換え、`isExportingVideo` 状態を管理
- 動画書き出し中のトースト・プログレス UI

#### 含まない（破棄 or 別スプリント）

- **破棄**: `src/utils/shareCard.ts`（PNG カード）
- **破棄**: `src/utils/shareProgression.ts`（旧オーケストレータ）
- **破棄**: `audioEngine.ts` の `recordPaletteSequenceToBlob` および `isAudioExportSupported`（音声単独録音 API）
- **破棄**: `src/index.css` の `.btn-share` の絵文字依存装飾のうち、PNG/音声共有を前提とした文言・aria-label
- 実機 iPhone での UI レイアウト崩れ修正 → **Sprint 6**
- LAN（非 HTTPS）での Web Share 挙動検証 → **Sprint 7**
- 動画フィルター / カバー画像 / 解像度ユーザー選択 → v2.5 以降

#### 流用するもの

- `src/utils/clipboard.ts` の `copyTextToClipboard`
- `buildShareText(palette, key, bpm)` 相当のテキスト生成（最終 fallback でクリップボードへ流す）
- `audioEngine.ts` の `getAudioContext` / `limiter` / `masterGain` / `drumGain` ノードグラフ
- `audioEngine.ts` の lifecycle 抑止メカニズム（`isExportingAudio` を **`isExportingVideo`** にリネームして同等機能を維持）
- `App.tsx` 既存の 📋 コピー機能（テキストのみ）

### 動画仕様（再掲・確定値）

| 項目 | 値 |
|---|---|
| アスペクト比 | 9:16 縦型 |
| 解像度 | **720 × 1280** |
| フレームレート | **30 fps** |
| ビデオビットレート | 約 2.5 Mbps（`videoBitsPerSecond: 2_500_000`） |
| オーディオビットレート | 約 128 kbps（`audioBitsPerSecond: 128_000`） |
| 動画長さ上限 | パレット 1 周再生、最大 16 小節（おおむね 30 秒以内） |
| MIME 試行順序 | 1. `video/mp4;codecs=avc1.42E01E,mp4a.40.2`<br>2. `video/mp4`<br>3. `video/webm;codecs=vp9,opus`<br>4. `video/webm;codecs=vp8,opus`<br>5. `video/webm` |
| ファイル名 | `chord-palette-<YYYYMMDD-HHmmss>.<ext>` |

### 動画画面構成（720×1280）

- 上部 約 120px: ロゴ「♪ Chord Palette」+ 「Key: C Major · BPM 120」
- 中央 約 900px: 進行ピル列（既存パレットと同じカラーリング、再生中ピルに白枠+グロー）
- 下部 約 80px: フッター URL「chord-palette.vercel.app」
- 背景: 既存アプリ準拠のダークグラデーション
- ピル列が画面幅に収まらない場合は **2 行で折り返し**（横スクロール演出は v2.5 以降）

### UI 配置と振る舞い

- 既存の **📤 ボタンを 🎬 に置き換え**（アイコン変更）
  - 位置はそのまま `playback-bar-transport` 内
  - title: 「縦型動画を作成して共有」
  - aria-label: 「動画として共有」
- 進行が 0 件のときは 🎬 ボタン非表示
- 動画書き出し中:
  - 🎬 → ⏺ アイコンに切替、`.recording` クラスでパルス点滅（既存 `.btn-share.recording` 流用）
  - 再生ボタンは disabled
  - パレットのピルも編集不可（タップ無効）にする
  - 動画録画中のコード進行ハイライトはアプリ画面側でも同期して動かす（既存 `currentPlayingIndex` を流用）
- フォアグラウンド維持注意トースト: 「動画を作成中… 画面はそのままにしてください」
- 完了時トースト: 「共有シートを開きました」「動画を保存しました」（fallback 時）「動画を作成しました（コピー済みテキスト付き）」

### lifecycle 衝突回避

- `audioEngine.ts` の既存 `isExportingAudio` フラグを **`isExportingVideo`** にリネーム
- `visibilitychange` / `pagehide` ハンドラは `isExportingVideo === true` のとき自動停止しない
- AudioContext の `suspended` / `interrupted` 検知時、`isExportingVideo === true` なら `onAudioInterrupted` を呼ばない
- 録画完了後は新設の `detachCaptureDestination()` で `MediaStreamAudioDestinationNode` を `limiter.disconnect()` する
- `resetAudioEngine()` 呼び出し時に `isExportingVideo` を false にリセットする

### Web Share / fallback ロジック

1. `navigator.share` 対応かつ `navigator.canShare({ files: [videoFile] })` が true:
   → `navigator.share({ files: [videoFile], text: shareText })` で 1 回送信
2. `canShare({ files })` が false かつ `navigator.share({ text })` は可:
   → 動画はダウンロード（`<a download>`）+ テキストのみ share
3. `navigator.share` 完全非対応:
   → 動画ダウンロード + `copyTextToClipboard(shareText)` でテキストコピー
4. MediaRecorder 自体が非対応 / 動画生成失敗:
   → 動画ステップをスキップして「テキストコピーのみ」にフォールバック、トーストで通知
5. AbortError（ユーザーキャンセル）: 失敗トーストを出さない

---

### スプリント契約（完了条件）

#### 旧アセットの破棄

- [ ] `src/utils/shareCard.ts` が削除されている
- [ ] `src/utils/shareProgression.ts` が削除されている
- [ ] `src/utils/audioEngine.ts` から `recordPaletteSequenceToBlob` および `isAudioExportSupported` が削除されている
- [ ] `App.tsx` から `handleShareProgression`、`isSharing`、`canShareAudio` の旧定義が削除（または動画版にリネーム）されている
- [ ] `index.css` の `.btn-share` 関連スタイルのうち、PNG/音声共有を前提とした記述（テキスト・aria 関連）が整理されている
- [ ] `npm run build` が型エラーなしで成功する

#### 動画生成（`src/utils/videoExporter.ts` + `videoRenderer.ts`）

- [ ] 720×1280 px の Canvas（OffscreenCanvas が使えれば優先、不可なら通常 Canvas）が生成される
- [ ] `canvas.captureStream(30)` でビデオトラックが取得される
- [ ] `AudioContext.createMediaStreamDestination()` でオーディオトラックが取得され、`limiter` から接続される
- [ ] ビデオ + オーディオを 1 つの `MediaStream` に合成し `MediaRecorder` で記録できる
- [ ] MIME 試行順序が `video/mp4;codecs=avc1.42E01E,mp4a.40.2` → `video/mp4` → `video/webm;codecs=vp9,opus` → `video/webm;codecs=vp8,opus` → `video/webm` の順で `MediaRecorder.isTypeSupported` チェックされる
- [ ] 1 周再生分の長さで自動停止する（最後のコードの sustain + 400ms 経過後に `recorder.stop()`）
- [ ] 録画完了で `Blob` が生成され、採用 MIME に応じた拡張子で `File` 化される
- [ ] ファイル名が `chord-palette-<YYYYMMDD-HHmmss>.<ext>` 形式
- [ ] 動画長さがパレット 1 周再生（最大 16 小節）でクリップされる

#### Canvas フレーム描画（`videoRenderer.ts`）

- [ ] 上部にロゴ「♪ Chord Palette」とサブ情報「Key: <key> · BPM <bpm>」が描画される
- [ ] 中央に進行ピル列が描画される（コード名 + 度数ラベル、既存 T/SD/D カラー準拠）
- [ ] 再生中（currentPlayingIndex に該当する）コードに白枠 + グロー強調が描画される
- [ ] ピル列が画面幅に収まらない場合は 2 行に折り返される
- [ ] 下部に「chord-palette.vercel.app」が描画される
- [ ] 背景がダークグラデーションで塗られる
- [ ] `requestAnimationFrame` ベースで 30fps 相当の更新ループが走る

#### audioEngine の変更

- [ ] `recordPaletteSequenceToBlob` が削除されている
- [ ] 新規 `attachCaptureDestination(): MediaStream`（または同等 API）が追加され、`limiter` から `MediaStreamAudioDestinationNode` への接続を返す
- [ ] 新規 `detachCaptureDestination(): void` で接続が解除される
- [ ] `isExportingAudio` が `isExportingVideo` にリネームされている（全参照箇所更新）
- [ ] `installAudioLifecycleHandlers` 内の `visibilitychange` / `pagehide` 抑止条件が `isExportingVideo` を参照する
- [ ] `handleContextStateChange` の interrupt スキップ条件が `isExportingVideo` を参照する
- [ ] `resetAudioEngine` で `isExportingVideo` が false にリセットされる
- [ ] 動画書き出し中に `playPaletteSequence` を呼んでも従来通り音が鳴り、かつその音がオーディオトラックに乗る

#### Web Share / fallback（`src/utils/shareVideo.ts`）

- [ ] `navigator.share` 対応かつ `canShare({ files: [videoFile] })` true なら 1 回の `navigator.share({ files, text })` で送信
- [ ] `canShare({ files })` false なら 動画 DL + `navigator.share({ text })` で送信
- [ ] `navigator.share` 完全非対応なら 動画 DL + `copyTextToClipboard(shareText)`
- [ ] MediaRecorder 非対応 or 録画失敗時はテキストコピーのみにフォールバックし、専用トーストが出る
- [ ] AbortError（ユーザーキャンセル）は失敗トーストを出さない

#### UI / 状態

- [ ] パレット 0 件のときは 🎬 ボタンが描画されない
- [ ] 🎬 ボタンの title が「縦型動画を作成して共有」、aria-label が「動画として共有」
- [ ] 動画書き出し中（`isExportingVideo=true`）は 🎬 → ⏺ に切替、`.recording` クラスでパルス点滅
- [ ] 動画書き出し中は再生ボタンが disabled
- [ ] 動画書き出し中はパレットのピルがタップ不可（編集モードに入らない）
- [ ] 動画録画の進行中、アプリ画面上のピルも `currentPlayingIndex` で同じハイライトが出る
- [ ] 「動画を作成中… 画面はそのままにしてください」のトーストが録画開始時に出る
- [ ] 録画完了/共有成功時に状況に応じたトーストが出る（share 成功 / DL fallback / テキストのみ）

#### lifecycle 衝突回避

- [ ] 動画書き出し中は `visibilitychange` / `pagehide` による自動停止が走らない
- [ ] 動画書き出し中は AudioContext の `suspended` / `interrupted` で `onAudioInterrupted` を呼ばない
- [ ] 録画完了後は `detachCaptureDestination()` で `MediaStreamAudioDestinationNode` が disconnect される
- [ ] `resetAudioEngine` 呼び出し時に `isExportingVideo` が false にリセットされる

#### 既存機能リグレッション

- [ ] 通常再生（▶️）は動画エクスポート機能追加後も従来通り動作する
- [ ] 既存の 📋 コピー機能（テキストのみ）は変更なしで動作する
- [ ] Sprint 4 で実装された localStorage / 履歴 / オンボーディングが壊れない
- [ ] `npm run build` が成功する
- [ ] `npm run lint` が警告なしで通る（既存警告と同水準）

### 検証手順（Evaluator 向けメモ）

- **Chrome DevTools の Device Mode（iPhone 13 mini / 15 Pro Max）** で 🎬 押下 → 動画ファイルが生成されるか確認
- **macOS Chrome / Safari** で動画ファイルが MP4 または WebM として再生できることを確認
- **iOS Safari 16.4+ 実機**（可能なら）で 🎬 押下 → Web Share シートに動画ファイルが現れ、Instagram ストーリーに投稿できるかを目視確認
- 音声が動画にちゃんと乗っていることを **必ず再生して確認**（Web Audio の interrupt 問題がここで再発しないかが最重要）
- 生成された動画のサンプルを `docs/design-references/sprint-5-video-sample.mp4` などに残せると Sprint 6/7 でも参照できる
- MediaRecorder 非対応環境（古い Android Chrome 等）でテキストコピー fallback に落ちることをエミュレーションで確認
