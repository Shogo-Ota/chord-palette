# Chord Palette — 開発コンテキスト

## プロジェクト概要

**Chord Palette** はモバイル特化の直感的コード進行ビルダーWebアプリ。
作曲家・ミュージシャンが素早くコード進行をスケッチするためのツール。

- **現行バージョン:** v2.2.1
- **本番URL:** https://chord-palette.vercel.app/
- **ホスティング:** Vercel

---

## 技術スタック

| カテゴリ | ライブラリ |
|---|---|
| UI フレームワーク | React 19 + TypeScript |
| ビルドツール | Vite 8 |
| スタイリング | TailwindCSS v4（`@tailwindcss/vite` プラグイン経由） |
| アニメーション | Framer Motion 12 |
| 状態管理 | Zustand（依存はあるが現在は `useState` で実装中） |
| バックエンド | Supabase（依存はあるが現在は未使用） |
| 音声 | Web Audio API（自前実装） |

---

## ファイル構成

```
src/
  App.tsx                         # メイン状態管理・イベントハンドラ
  index.css                       # 全CSS（カスタムプロパティ + レイアウト + コンポーネント）
  main.tsx                        # エントリーポイント
  components/
    Header.tsx                    # ロゴ + キー選択セレクタ
    CompositionPalette.tsx        # パレット表示・BPM・ドラム・再生・履歴
    ChordSelectorSheet.tsx        # ボトムシート（タブ切り替え）
    TheoryPane.tsx                # ダイアトニックコードグリッド（テンション付き）
    NonDiatonicPane.tsx           # ノンダイアトニックコードカテゴリ
    OnChordPane.tsx               # 分数コード（ベース音変更）パネル
  utils/
    musicTheory.ts                # 音楽理論ロジック（スケール・コード・推奨）
    audioEngine.ts                # Web Audio API シンセエンジン
```

---

## アーキテクチャ

### 状態管理（App.tsx）
すべての状態は `App.tsx` で管理し、props として子コンポーネントに渡す。
- `selectedKey` — 選択中のキー (C〜B)
- `palette` — コード進行（`PaletteChord[]`）
- `editingIndex` — 編集対象のコードインデックス（タップで選択・差し替えモード）
- `history` — 保存した進行（最大5件）
- `bpm`, `drumPattern`, `isPlaying`, `isLooping`
- `chordDurationMode` — コード長さ（1 / 1/2 / 1/4 拍）

### コアデータ型（musicTheory.ts）

```typescript
interface PaletteChord {
  displayName: string;     // "CM7", "Am", "C/E"
  label: string;           // "I", "V7/ii", "IVm"
  function: "T" | "SD" | "D";
  rootNote: number;        // MIDIノート番号
  intervals: number[];     // 半音インターバル
  degreeIndex?: number;    // ダイアトニック時のみ
  isDiatonic: boolean;
  bassNoteOverride?: number;  // オンコード用
  key: Key;
  beats: number;           // 1 | 0.5 | 0.25
}
```

### 音声エンジン（audioEngine.ts）
- Web Audio API で純正弦波（sine + triangle 倍音）を合成
- ADSRエンベロープ + ハードリミッター + マスターゲインで音割れ防止
- iOS/Android 対応（sampleRate 強制指定なし、AudioContext resume）
- `playChord()` — 単音プレビュー
- `playPaletteSequence()` — 16分音符スケジューラでシーケンス再生
- `stopPaletteSequence()` / `resetAudioEngine()` — 停止・リセット

---

## UI・UXデザイン原則

### カラーコーディング（機能別）
- **T（Tonic）** — 青 `#3b82f6`
- **SD（Subdominant）** — 琥珀 `#f59e0b`
- **D（Dominant）** — 赤 `#ef4444`

### レイアウト
- ヘッダー固定（キー選択）
- 中央エリア = パレット（ピル型コード + アクションバー + 履歴）
- 画面下部 = ボトムシート（コード選択、Framer Motion でスライドアップ）

### ピル型コード表示
- 上段: 度数ラベル（I, ii, V7/ii など）
- 下段: コード名（CM7, Fm など）
- 編集中: 青枠 + パルスアニメーション `.pulse-editing`
- 再生中: 白枠 + グロー `.playing`
- 削除ボタン: ホバー/編集時に右上に赤い ✕ を表示

### モバイル最適化
- アクションボタン（戻る・保存・クリア）はパレット内アクションバーに集約
- BPM・Drum は数値入力（スライダー不使用）
- コードグリッドはレスポンシブ（3〜8列）

---

## ダイアトニックコード構造

```
度数:    I    ii   iii  IV   V    vi   vii°
機能:    T    SD   T    SD   D    T    D
三和音:  M    m    m    M    M    m    m(♭5)
七和音:  M7   m7   m7   M7   7    m7   m7(♭5)
```

各コードカードにはテンション・オルタレーションボタンが付く:
- バリエーション: 6, sus2, sus4
- テンション: 9, 11, 13（度数ごとに許可ノート異なる）
- オルタレーション: ♭9, ♯9, ♯11, ♭13（主にドミナント系）

---

## ノンダイアトニックカテゴリ

| カテゴリ | 内容 |
|---|---|
| Secondary Dominant | V7/ii〜V7/vi |
| Modal Interchange | IVm, vm, ♭VII, ♭VI, ♭III |
| Tritone Sub | ♭II7（裏コード） |
| Diminished | #Idim7〜#Vdim7（経過ディミニッシュ） |
| Augmented | Iaug, Vaug |

---

## 開発コマンド

```bash
npm run dev       # 開発サーバー起動
npm run build     # tsc + Vite ビルド
npm run preview   # プロダクションプレビュー
npm run lint      # ESLint
```

---

## 既知の注意点・TODO

- `App.tsx` 下部のデバッグパネル（🔧 DEBUG ボタン）は本番では非表示を検討
- Supabase の `@supabase/supabase-js` と Zustand が依存に入っているが現在未使用
- `index.css` に `.palette-history` の定義が重複している（CSS整理の余地あり）
- iOS Safari での AudioContext は必ずユーザー操作後に初期化が必要（実装済み）

---

## コミット規約（これまでのスタイル）

```
release: v2.x.x - 概要
hotfix: v2.x.x - 概要
feat: 機能説明
fix: 修正内容
```
