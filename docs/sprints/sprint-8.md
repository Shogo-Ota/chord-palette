## Sprint 8: 統一ボイシングエンジン

### 目的

コード進行の再生・プレビューで音域のばらつきを抑え、進行横断のボイスリーディングで統一感を出す。
音色プリセット（Sprint 9）は本スプリントでは触らず、既存 Synth EP 合成のまま `audioEngine` をリファクタする。

### スコープ

#### 含む

- 新規 [`src/utils/voicing.ts`](../../src/utils/voicing.ts)
  - 和音内: クローズボイシング、上声部 MIDI 48–72、ベース 36–48、上声部スパン最大 12 半音
  - 進行横断: nearest-neighbor ボイスリーディング（`lastVoicing` 状態）
  - `resetVoicingState()` / `voiceChordForPlayback()`
- [`src/utils/audioEngine.ts`](../../src/utils/audioEngine.ts)
  - `playChord` から旧 `rootNote + interval` 直計算を削除
  - `playPaletteSequence` 開始・停止・ループ先頭で voicing リセット
  - `playChord(..., options?: { useVoiceLeading?: boolean })`
- [`src/App.tsx`](../../src/App.tsx): プレビュー・オンコード変更時に `useVoiceLeading: true`

#### 含まない

- 音色プリセット UI（Sprint 9）
- サンプル音源・外部ライブラリ

### スプリント契約（完了条件）

- [x] `voiceChord()` が `PaletteChord` からソート済み MIDI 配列を返す
- [x] ベースは `bassNoteOverride ?? rootNote` のピッチクラスを 36–48 に配置
- [x] 上声部はベース PC を除いた重複なしクローズボイシング（48–72、スパン ≤ 12）
- [x] シーケンス再生で 2 コード目以降、前和音からの移動距離が最小化される
- [x] `playPaletteSequence` / `stopPaletteSequence` / `resetAudioEngine` / ループ先頭で `resetVoicingState()`
- [x] コードタッププレビューでも `voiceChordForPlayback` を使用
- [x] `npm run build` 通過

### 手動確認

1. C メジャーで I – vi – IV – V をループ再生し、極端なオクターブジャンプが減っていること
2. オンコード（例: C/E）でベースが E 付近のレジスターになること
3. パレットクリア後、最初のコードのボイシングが固定レジスターから始まること
