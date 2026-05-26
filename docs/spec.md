# 収益化・プロダクト要件（三位一体モデル）

出典: `Chord Palette 収益化ロードマップ策定.pdf`（2026）  
開発スキル: `.agents/skills/chord_palette_monetization/SKILL.md`  
ロードマップ: `docs/monetization-roadmap.md`

## v3.0 - Sprint 16: Stripe + MIDI Pro（実装フェーズ確定）

v2.9.3 までで完成した無料体験を維持したまま、**MIDI エクスポートだけを Pro 機能として有料化**する。
詳細仕様は [`docs/sprints/sprint-16.md`](./sprints/sprint-16.md)。

### 設計判断の更新（M4 案からの差分）

| 項目 | M4 案（旧） | Sprint 16（採用） |
|---|---|---|
| 決済プロバイダ | Lemon Squeezy | **Stripe Payment Link** |
| ライセンス管理 | Lemon Squeezy API + instance 紐付け | **HMAC-SHA256 自己検証 + Stripe Customer Metadata** |
| Pro 機能 | MIDI + 転調 + ライブラリ（同時実装） | **MIDI のみ**（転調・ライブラリは別スプリント） |
| MIDI ライブラリ | `midi-writer-js` | **`@tonejs/midi`** |
| MIDI トラック構成 | Chord のみ | **Chord + Drum（2 トラック）** |

採用理由: (1) 日本市場で Stripe 選好、(2) Lemon Squeezy の instance 管理が不要となり「DB なし」がより純粋に実現、(3) Stripe ダウン時もアプリは無料機能で動作継続、(4) Anthropic API Function (`api/explain.ts`) と同じ Vercel Functions 流儀で統一可能。

Lemon Squeezy 統合計画（M4）は本スプリント完了後にアーカイブする。

### Sprint 16 サマリ

| 項目 | 仕様 |
|---|---|
| ライセンス形式 | `XXXX-XXXX-XXXX`（base32 大文字 12 文字 + ハイフン区切り）。`HMAC-SHA256(LICENSE_SECRET, "v1:" + customerId + ":" + paymentIntentId)` の先頭 60bit |
| 失効 | 永続（買い切り）。多端末利用は許容（DB なし制約） |
| サーバー | `api/stripe-webhook.ts`（Webhook 署名検証 + キー生成）+ `api/verify-license.ts`（HMAC 検証 + Stripe Customer 検索） |
| クライアント保存 | `localStorage["cp_pro_license"]`。24 時間以内に検証成功した履歴があれば API スキップ（オフライン対応） |
| 購入後導線 | Stripe Payment Link 戻り時の `?license=XXXX-XXXX-XXXX` を自動取り込み + `history.replaceState` で URL から除去 |
| MIDI ファイル | SMF Type 1、PPQ 480、Track 1 = Chord (channel 0, GM 0)、Track 2 = Drum (channel 9、GM Drum Map)、パレット全長ループ |
| UI | playback-bar 行3 に MIDI ボタン（Pro 未保有時 🔒）+ `ProModal`（購入 + ライセンス入力） |
| バンドル上限 | gzip 147 kB（@tonejs/midi 約 15 kB 増分許容、超過時は動的 import） |

### 必要な環境変数（Vercel Project Settings）

サーバーのみ（**`VITE_` プレフィクス禁止**）:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `LICENSE_SECRET`（32 文字以上のランダム）
- `STRIPE_PRODUCT_ID_PRO`
- `STRIPE_API_VERSION`

クライアント可:
- `VITE_STRIPE_PAYMENT_URL`
- `VITE_PRO_PRICE_LABEL`

### v3.0 で守る制約

- v2.9.3 までの全機能（再生・編集・転回形 / 3 音色 / Rush サンプル / 5 ジャンルドラム / Beat 軸 / 動画書き出し / 履歴 / モバイル UI）にリグレッションを出さない
- 試聴・基本スケッチをペイウォールの内側に置かない（CVR 維持）
- 秘密鍵がクライアントバンドルに露出しない（grep ゲートで確認）
- 375px モバイル UI の破綻なし、iOS Safari の AudioContext lifecycle 維持

---

## ビジョン

Chord Palette は **TikTok 集客 × Web アプリ課金 × 有料 note** のフライホイールの中心プロダクトである。  
機能追加は「作曲体験」だけでなく **検索流入・課金転換・動画映え・実装の再販可能さ** を満たすかで優先度を決める。

## フリーミアム境界（Planner 確定・レポート準拠）

### 無料（集客・バイラル維持）

| 領域 | 内容 |
|------|------|
| コア | コード進行スケッチ、試聴、編集・差し替え、T/SD/D 表示 |
| 音 | Rush / SenseElepix / Upright、5 ジャンルドラム、Beat 軸、メロディプリセット（v3.0） |
| 共有 | 動画書き出し（現行 720p）、テキスト共有、`#ChordPalette` |
| 保存 | `localStorage` によるセッション復元、**履歴 5 件**（現行） |

### Pro（有料解放 — 実装優先度順）

| 優先 | 機能 | 要件 | 技術 |
|------|------|------|------|
| P1 | **MIDI エクスポート** | 現在の `palette` から 1 ファイル DL。DAW ドラッグ前提 | クライアントのみ `midi-writer-js`。サーバー処理なし |
| P2 | **自動トランスポーズ** | ヘッダーでキー変更時、パレット内コードを一括再計算（度数・テンション・オンコード維持） | `musicTheory.ts` 拡張（`@tonaljs` は任意） |
| P3 | **進行ライブラリ** | 名前付き複数スロットの保存・呼び出し | IndexedDB 推奨（容量）。認証・クラウド同期は **Phase 3 以降** |

**product 判断で Pro にできる候補（レポート・M3 案）:** 1080p 動画、ウォーターマーク除去、転回形フル、短調キー、クラウド同期（Supabase）。

## 課金・ライセンス（DB/Auth 不要）

| 項目 | 仕様 |
|------|------|
| 決済 | **Lemon Squeezy**（ライセンスキー + 任意サブスク）。初期は Stripe Customer Portal を置かない |
| サーバー | `activate` / `validate` のみ（Vercel Serverless Functions 等）。**Next.js 前提ではない**（Vite SPA） |
| クライアント状態 | `licenseKey` + `instanceId` を localStorage（`cp_state_v1` とはキー分離） |
| 購入後 | リダイレクト URL `?license_key=` を起動時に検出し、自動 activate → Pro UI 解放 |
| セキュリティ | `LEMON_SQUEEZY_VARIANT_ID` で variant 照合。instance 上限による使い回し防止 |
| env（例） | `LEMON_SQUEEZY_API_KEY`（サーバーのみ）、`LEMON_SQUEEZY_VARIANT_ID`、`VITE_LEMON_CHECKOUT_URL` |

**既存 M2（Ko-fi / Waitlist）:** Phase 1 検証用として維持可。本番ペイウォールは Lemon Squeezy に統一する方向。

## マーケ・成長に直結するプロダクト要件

### SEO・ランディング

- 検索キーワード **「コードパレット」** での指名検索を前提（TikTok 説明欄から URL コピー不可）
- `index.html` の `<title>` / `description` / OGP に日本語キーワードを含める
- 動画・Canvas フッターに `chord-palette.vercel.app` を表示（現行 `videoRenderer` 方針と一致）

### TikTok / 動画

- ラスト 3 秒スライド案: 「ブラウザで『コードパレット』と検索」（アプリ外制作でも可）
- **3 大進行デモ**（コンテンツ・オンボーディング用プリセット候補）:
  - 王道 4-5-3-6（C: F–G–Em–Am）
  - チル（C: F△7–C△7–E/F#–Em/A）
  - 丸サ系（C: Fmaj7–E7–Am7–Gm7–C7）
- CRP 向け **1 分以上**解説動画はアプリ外だが、**1 分未満の書き出し上限**と矛盾しないよう product で線引き

### 映え UI（オプション機能）

録画・デモモードで和音構成音を **役割別 5 色**でハイライト（既存 T/SD/D とは別レイヤ）:

| 役割 | 色 |
|------|-----|
| ルート | `#10b981` |
| 3 度 | `#f59e0b` |
| 5 度 | `#0ea5e9` |
| 7 度 | `#6366f1` |
| テンション | `#d946ef` |

背景トーン目安: `#090a0c`, `#111215`（既存ダークテーマと両立）

## 計測要件（Analytics）

`src/utils/analytics.ts` に追加予定のイベント（Plausible 等）:

| イベント | 用途 |
|----------|------|
| `license_activate_success` / `license_activate_fail` | 課金ファネル |
| `midi_export` | Pro 価値検証 |
| `checkout_click` | Lemon 購入導線 |
| `landing` + UTM / `?from=tiktok` | TikTok 流入 |

Phase 1 ゲート（`docs/phase1-gate.md`）の UU / `video_export` / シェア指標は **継続して監視**する。

## スプリントへの落とし込み（未割当 → Planner）

| スプリント案 | スコープ |
|--------------|----------|
| **M4-monetization-core** | Lemon Squeezy、license API、Pro フラグ、購入後 URL、P1 MIDI |
| **M5-transpose-pro** | P2 自動トランスポーズ + キー変更 UX |
| **M6-library-local** | P3 IndexedDB ライブラリ |
| **M7-growth-ui** | SEO meta、3 大進行プリセット、5 色ハイライト（デモモード） |

`docs/sprints/sprint-m3-monetization.md`（Supabase + Stripe）は **MAU・WTP 証明後**。本セクションの Lemon Squeezy フリーミアムが先。

## 制約（収益化スプリント共通）

- 375px モバイル・iOS AudioContext・既存 v2.9/v3.0 機能にリグレッションなし
- **試聴・基本スケッチをペイウォールの内側に置かない**
- 特定楽曲・アーティスト名を UI ラベルに使わない（v3.0 著作権方針）
- ライセンス検証失敗時は **無料機能は常に利用可能**（エラーはトースト + 再入力）

---

# Chord Palette v2.9（Rush 音色のサンプル化：ハイブリッド方式）

## 概要（v2.9）

v2.8 までで「ピアノ音色 3 種 × 5 ジャンルドラム × 転回形 × Beat 軸独立化 × 動画書き出し × モバイル UI」が
ほぼ完成形に達した。v2.9 ではユーザー体験の中心である **デフォルト音色 Rush だけ** を
**実サンプル音源（smplr 経由）** に置き換え、「Web Audio 合成では到達しがたい “本物の Steinway 感”」を獲得する。

**Synth El. Piano / Upright は現行合成のまま維持する** ことで、3 音色のキャラ差別化と既存挙動を守る。

### 採用技術（調査レポート確定）

| 項目 | 採用 |
|---|---|
| ライブラリ | [`smplr`](https://github.com/danigb/smplr) v0.26.0（MIT、外部依存ゼロ、gzip +23 kB 程度） |
| サンプルセット | **SplendidGrandPiano**（パブリックドメイン Steinway、AKAI 配布、Attribution 不要） |
| 配信元 | `https://smpldsnds.github.io/sfzinstruments-SplendidGrandPiano/`（Vercel バンドルに乗らない CDN 配信） |
| 適用範囲 | **Rush のみ**。Synth El. Piano / Upright は従来通り Web Audio 合成 |
| AudioContext | 既存 `audioContext` / `masterGain` / `limiter` / `reverb` を流用。Tone.js のような Context 置換は禁止 |

### 二本柱

1. **Rush サンプラー化（ハイブリッド方式）**
   - `smplr` の `Sampler` を **遅延ロード**（Rush が選ばれた瞬間 or Rush で初回タップした瞬間）
   - サンプラー出力ノードを既存マスターチェーン（80Hz HPF + 5kHz shelf + reverbSend → limiter）に接続
   - ロード未完了時は **既存合成版 Rush で代替再生**（無音回避）
   - 2 回目以降は **Cache Storage** 経由で即時利用（smplr デフォルト挙動）

2. **動画書き出し・ライフサイクル統合**
   - `videoExporter.ts` は書き出し開始前に `await sampler.loaded` を実行
   - 書き出し中の Tone セレクタ disabled（Sprint 9 で実装済み）を維持
   - iOS Safari の AudioContext resume / suspend / interruption に影響を与えない

### v2.9 機能一覧

| 優先度 | 機能 | スプリント |
|---|---|---|
| 高 | `smplr` を `package.json` の dependencies に追加 | Sprint 14 |
| 高 | `instrumentPresets.ts`（または専用モジュール）に Rush サンプラー初期化 + 再生分岐 | Sprint 14 |
| 高 | `audioEngine.ts` の `playChord` / `playPaletteSequence` が Rush 時に sampler 経由で発音 | Sprint 14 |
| 高 | サンプル未ロード時の **合成版 Rush フォールバック**（無音禁止） | Sprint 14 |
| 高 | `videoExporter.ts` で書き出し開始前に `await sampler.loaded` | Sprint 14 |
| 高 | ロード中インジケータ UI（Tone セレクタ / playback-bar 近辺） | Sprint 14 |
| 中 | sound-critic 用 試聴チェックリスト（3 音色 × 進行 3 パターン） | Sprint 14 |

### v2.9 で守る制約

- 既存の v2.8.2 機能（転回形 / 5 ジャンルドラム / Beat 軸独立化 / 3 音色 / 動画書き出し / モバイル UI）にリグレッションを出さない
- 375px モバイル最優先、iOS Safari の AudioContext lifecycle 維持
- 既存の Rush 合成コード（`pleasantAcoustics` / `INSTRUMENT_PRESETS.rush`）は **削除せず残す**（フォールバック用）
- `localStorage` の `instrumentId` 値・形式は不変
- Synth El. Piano / Upright は完全に従来挙動を維持（音量バランス・聴感に変化なし）
- マスターチェーン構成（80Hz HPF + 5kHz shelf + reverbSend → limiter → masterGain）に変更を加えない
- 進行横断 voice-leading（Sprint 8）・転回形（Sprint 10）は MIDI 値レベルで動作するためサンプル化しても挙動維持
- 動画書き出し時に Rush サンプル音が `MediaStreamAudioDestinationNode` に正しく乗ること
- gzip 後の JS バンドルサイズ増分は **smplr +23 kB の目安**を超えない（合計 145 kB 上限）

### 既存制約の緩和（v2.5 / v2.6 / v2.7 から変更）

v2.5 / v2.6 / v2.7 で明記していた制約：

> 「サンプル音源・サンプル WAV / SoundFont / 外部音声 npm パッケージは追加しない（Web Audio API 合成のみ）」

これを v2.9 で以下のように緩和する：

> **「デフォルト音色（Rush）のみ smplr 経由でサンプル音源を採用可。Synth El. Piano / Upright は Web Audio 合成のままとする。Tone.js のような AudioContext を置き換える系のフレームワークは引き続き追加しない。」**

この緩和は **Rush 音色 1 種に限定**され、Synth El. Piano / Upright・ドラム合成・マスターチェーン構造には適用しない。

---

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
