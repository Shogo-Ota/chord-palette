# Phase 1 ゲート — PMF 証明の判断基準

**期間の目安:** デプロイ後 4〜8 週間  
**前提:** Sprint M1 の Plausible が本番で有効（`VITE_PLAUSIBLE_DOMAIN`）

## ゲート条件（Phase 2 へ進む目安）

| 指標 | 目標 | 確認方法 |
|------|------|----------|
| 週間ユニーク（UU） | **50+ / 週**（副業の第一目標） | Plausible → Unique Visitors（週次） |
| 動画エクスポート | **10+ / 週** | Plausible Goal: `video_export` |
| 外部シェアの兆候 | **1 件以上** | リファラ・SNS 言及・自分以外からの問い合わせ |

### 補助指標（週次レビュー）

- `play_sequence` — 再訪・試聴の proxy
- `tone_change` — 音色への関心
- `chord_add` — 初回〜2 コード目の離脱改善の材料

## 週次チェックリスト

1. Plausible で先週の UU・`video_export` 件数を記録（スプレッドシート or Notion で可）
2. 動画を自分で 1 本シェアし、末尾 CTA（`#ChordPalette`）が読めるか目視
3. 未達なら Phase 1 継続（音質・UI・オンボーディング）— **Stripe は入れない**

## Phase 2 に進んだら

- `VITE_KOFI_URL` / `VITE_WAITLIST_URL` を Vercel に設定（Sprint M2）
- 限定 Pro は `VITE_PRO_PAYMENT_URL`（Stripe Payment Link 1 商品）

## Phase 3 の前提（参考）

- Waitlist **20 人以上** または 週間 MAU **200+**
- 詳細: `docs/sprints/sprint-m3-monetization.md`
