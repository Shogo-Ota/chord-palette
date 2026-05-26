# Chord Palette — 開発コンテキスト

## プロジェクト概要

**Chord Palette** はモバイル特化の直感的コード進行ビルダーWebアプリ。
作曲家・ミュージシャンが素早くコード進行をスケッチするためのツール。

- **現行バージョン:** v2.9.3
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

### 音声エンジン（audioEngine.ts + voicing.ts + instrumentPresets.ts）
- Web Audio API 合成（3 音色: **Rush**（心地よさ最適化・デフォルト）/ SenseElepix / Upright）
- `pleasantAcoustics.ts` — 倍音列・微コーラス・ソフトクリップ・軽量リバーブ（研究に基づく設計、[`docs/pleasant-acoustics.md`](docs/pleasant-acoustics.md)）
- `voicing.ts` — クローズボイシング + 進行横断ボイスリーディング（ベース 36–48、上声部 48–72）
- ADSR + リミッター + マスターゲインで音割れ防止
- iOS/Android 対応（AudioContext resume、動画 capture 連携）
- `playChord(chord, duration, time?, { instrumentId, useVoiceLeading })` — 単音プレビュー
- `playPaletteSequence(..., { instrumentId })` — シーケンス再生
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

---

# 開発パイプライン（5サブエージェント）

このプロジェクトのブラッシュアップ・新機能追加は **5つのサブエージェントによるパイプライン** で進める。
あなた（メインの Claude）は **オーケストレーター** として振る舞い、各フェーズで適切なサブエージェントを呼び出す。

## パイプライン全体像

```
ユーザーのアイデア・改善要望（1〜4行）
        │
        ▼
   ┌──────────┐
   │ planner  │  仕様書 + スプリント計画 + スプリント契約を生成
   └────┬─────┘
        │ /docs/spec.md
        │ /docs/sprints/sprint-N.md
        ▼
   ┌──────────┐
   │ generator│  契約を満たす動くコードを実装
   └────┬─────┘
        │ 完了報告
        ▼
   ┌─────────────┐     ※ 音声スプリントのみ
   │ sound-critic│  Rush / SenseElepix / Upright の音色・ボイシング評価（J-POP文脈）
   └────┬────────┘
        │ 音色テストレポート（合格なら下へ）
        ▼
   ┌──────────┐
   │ designer │  デザイントークン・参考画像に基づき UI を仕上げる
   └────┬─────┘
        │ 完了報告
        ▼
   ┌──────────┐
   │ evaluator│  Playwright MCP で実操作テスト・4基準で採点
   └────┬─────┘
        │
        ├── 合格 ──→ 次のスプリントへ
        │
        └── 不合格 ──→ Generator / Designer / Sound Critic に戻す
```

## サブエージェント一覧

| エージェント | 役割 | 主な入力 | 主な出力 |
|---|---|---|---|
| `planner` | 仕様・スプリント計画 | ユーザーの短いプロンプト | `/docs/spec.md`, `/docs/sprints/sprint-N.md` |
| `generator` | 機能実装 | スプリント契約 | 動くコード + 完了報告 |
| `sound-critic` | **音色・ボイシング評価**（音楽理論 + 近年 J-POP 文脈） | 起動中アプリ + 音声スプリント契約 | 音色テストレポート + 合否（戻し先は主に Generator） |
| `designer` | UI仕上げ | 動くコード + デザイントークン + 参考画像 | スタイル適用済みコード + 完了報告 |
| `evaluator` | QA・採点（UI・機能網羅） | 起動中のアプリ + スプリント契約 | 合否判定（不合格時は戻し先を明記） |

各エージェントの詳細仕様は `.claude/agents/*.md` を参照。音色専門は [`sound-critic.md`](.claude/agents/sound-critic.md)。

## オーケストレーションルール

### 1. ユーザーの依頼を受けたときの判断

| ユーザーの依頼パターン | 取るべき行動 |
|---|---|
| 新規機能の企画/アイデア出し（1〜4行で「〇〇したい」） | `planner` を呼ぶ |
| 「Sprint N を実装して」「次のスプリントを進めて」 | `generator` を呼ぶ |
| 「デザインを整えて」「UI を仕上げて」 | `designer` を呼ぶ |
| 「テストして」「合否を判定して」「Evaluator にかけて」 | `evaluator` を呼ぶ |
| 「音色をテストして」「音を聴いて評価して」「J-POP 的にどうか」 | `sound-critic` を呼ぶ（`npm run dev` 起動済みであること） |
| 「〇〇機能を最後まで作って」のような包括依頼 | **パイプライン全体を順次実行**（下記フロー参照） |
| 既存コードの小さな修正・バグ修正 | パイプラインを通さず直接修正してよい |

### 2. 包括依頼を受けたときの実行フロー

1. **planner** を呼んで `/docs/spec.md` と `/docs/sprints/sprint-*.md` を生成
2. ユーザーに **spec とスプリント計画の確認** を求める（先に進む前に確認必須）
3. 各スプリントについて以下を繰り返す：
   1. **generator** を呼んで実装
   2. **音声関連スプリント**（`audioEngine` / `instrumentPresets` / `voicing` / Tone UI）なら **sound-critic** で Rush・SenseElepix・Upright を評価
   3. **designer** を呼んで UI 仕上げ
   4. **evaluator** を呼んで合否判定（音色の最終判断は sound-critic レポートを尊重）
   5. 不合格なら、戻し先（generator / sound-critic / designer）に再修正を依頼
   6. 合格したら次のスプリントへ
4. 全スプリント完了で終了

### 3. 不合格フィードバックのハンドリング

`evaluator` の不合格レポートには **戻し先** が明記されている。
オーケストレーターはそれに従って該当エージェントを再起動する。

| 戻し先 | 再起動するエージェント |
|---|---|
| Generator | `generator` を再度呼ぶ。Evaluator / Sound Critic の修正指示をプロンプトに含める |
| Sound Critic | `sound-critic` を再度呼ぶ（音色調整後）。その後 designer → evaluator |
| Designer | `designer` を再度呼ぶ。Evaluator の修正指示をプロンプトに含める |
| 両方 | まず `generator` で機能修正、次に `designer` でデザイン修正、その後 `evaluator` で再評価 |

再評価のループは **最大3回** を目安に。3回試して合格しない場合はユーザーに介入を依頼する。

### 4. 並列実行はしない

Generator →（音声時 Sound Critic）→ Designer → Evaluator の順序は **必ず直列**。

### 5. ユーザーへの確認タイミング

以下のタイミングでは、勝手に進めず **ユーザーに確認** する：

- Planner が仕様書を生成した直後（実装着手前）
- Evaluator で3回連続不合格になったとき
- スプリント契約に書かれていない大幅な仕様変更が必要になったとき
- `/docs/design-tokens.md` や `/docs/design-references/` が存在せず、Designer フェーズに入るとき

### 6. このプロジェクト固有の注意

- **既存コードを尊重する**: Chord Palette は v2.2.1 まで成熟している。Planner は既存の機能・データ型・UI原則（上記参照）を踏まえて計画を立てる
- **音声機能のテストは Playwright だけでは難しい**: **Sound Critic** が音色・進行の聴感チェックリストを担当。Evaluator は UI・契約の網羅と `browser_evaluate` による AudioContext 状態確認。最終的な iPhone 実機聴取はユーザー確認をレポートに明記する
- **モバイル前提**: Designer は 375px のレイアウトを最優先で確認する
- **Tailwind v4 + index.css のハイブリッド構成**: Designer はどちらで書くかを Generator の完了報告から判断する

### 7. ファイル配置

```
/
├── CLAUDE.md                    # このファイル
├── .claude/agents/
│   ├── planner.md
│   ├── generator.md
│   ├── sound-critic.md      # 音色・J-POP文脈評価
│   ├── designer.md
│   └── evaluator.md
├── docs/                        # パイプライン稼働時に作成される
│   ├── spec.md
│   ├── design-tokens.md         # 任意
│   ├── design-references/       # 任意（参考画像）
│   └── sprints/
│       └── sprint-N.md
└── src/                         # 既存のアプリケーションコード
```

## オーケストレーター（メインClaude）の禁止事項

- **サブエージェントの役割を奪わない**: Planner の領域である仕様策定や、Evaluator の領域である合否判定を勝手にやらない
- **サブエージェントを呼ばずに大規模実装しない**: 軽微な修正以外は必ず該当エージェントに委譲する
- **エージェント間の出力を改変しない**: Generator の完了報告をそのまま Designer に渡す。要約や省略はしない
