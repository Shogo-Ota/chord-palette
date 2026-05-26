# Sprint M3 — 本格 Freemium（Phase 3・未実装）

**開始条件:** Phase 1 ゲート通過（`docs/phase1-gate.md`）  
**かつ:** Waitlist 20+ または 週間 MAU 200+

## スコープ（計画のみ）

### 無料

- 進行スケッチ・基本音色（Rush / SenseElepix / Upright）
- 720p 動画・localStorage 保存
- Root ポジション転回（または転回制限は product 判断）

### Pro（例: 月 480〜980 円）

- Supabase クラウド保存・機種間同期
- 短調キー
- 転回形フル
- 1080p 動画・ウォーターマークなし
- 将来: MIDI / リードシート export

## 技術スタック（既存依存）

- `@supabase/supabase-js` — Auth + DB
- Stripe Customer Portal + Checkout
- 見積: 2〜3 スプリント

## 実装順序（推奨）

1. Supabase Auth（メール or OAuth）
2. `progressions` テーブル + RLS
3. Stripe 1 プラン + webhook で `pro` フラグ
4. Pro 機能 1 つだけ先出し（**クラウド保存**が核）

## オーケストレーター

Phase 3 は **Planner → Generator → Designer → Evaluator** の正式パイプラインでスプリント化すること。
