## Sprint 9: 音色プリセット（合成 5 種）+ Tone UI

### 目的

Web Audio 合成のみで 5 種のピアノ系音色を切り替え可能にし、選択を localStorage に永続化する。
動画書き出しでも選択中の Tone が反映される。

### スコープ

#### 含む

- 新規 [`src/utils/instrumentPresets.ts`](../../src/utils/instrumentPresets.ts)
  - `synthEp` | `grand` | `rhodes` | `wurli` | `upright`
  - `scheduleNoteVoice()` でオシレーター・フィルター・ADSR・（Wurli）トレモロ
- [`src/utils/audioEngine.ts`](../../src/utils/audioEngine.ts): `instrumentId` を `playChord` / `playPaletteSequence` に渡す
- [`src/components/CompositionPalette.tsx`](../../src/components/CompositionPalette.tsx): playback-bar に **Tone** `<select>`
- [`src/App.tsx`](../../src/App.tsx) + [`src/utils/storage.ts`](../../src/utils/storage.ts): `instrumentId` 永続化
- [`src/utils/videoExporter.ts`](../../src/utils/videoExporter.ts): `VideoExportOptions.instrumentId`

#### 含まない

- サンプル WAV / SoundFont
- npm 音声ライブラリ追加

### プリセット一覧

| ID | 表示名 | 特徴 |
|---|---|---|
| `synthEp` | Synth EP | 現行互換（sine + triangle）、デフォルト |
| `grand` | Grand | 複数倍音、明るい LP、速い attack |
| `rhodes` | Rhodes | 中域強調、柔らかい attack |
| `wurli` | Wurli | 明るめ + LFO トレモロ |
| `upright` | Upright | 暗め LP、長め decay |

### スプリント契約（完了条件）

- [x] Tone セレクタで 5 種すべて切り替え可能
- [x] 単音プレビュー・シーケンス再生・動画書き出しで同一 `instrumentId` が使われる
- [x] リロード後も `instrumentId` が復元される
- [x] 動画書き出し中は Tone セレクタが disabled
- [x] `npm run build` 通過

### 受け入れ条件（Evaluator）

- [x] I–IV–V–I 再生で音色切替が聴き分けできる（5 種）
- [x] iOS Safari: ユーザー操作後に AudioContext が resume する既存挙動を維持
- [ ] iOS Safari 実機: 動画書き出しに選択 Tone が乗る（手動確認推奨）
- [x] v2.4 機能（再生・編集・履歴・動画共有）にコード上のリグレッションなし

### 手動確認

1. 各 Tone でコードをタップし、音色差を確認
2. ループ再生中に Tone を変更し、次のコードから反映されること
3. iPhone Safari で動画 🎬 書き出し → 選択 Tone が反映されていること
