# Sprint M2 — 軽量マネタイズ（副業向け）

**ステータス:** 実装済み（UI + env フック）  
**目的:** 月数千〜数万円規模の**仮説検証**。インフラ最小。

## スプリント契約

### 必須（Done）

| ID | 要件 | 実装 |
|----|------|------|
| M2-1 | ヘッダー「応援」→ サポートシート | `Header.tsx` + `SupportSheet.tsx` |
| M2-2 | Ko-fi（または同等）リンク | `VITE_KOFI_URL` |
| M2-3 | Pro Waitlist リンク | `VITE_WAITLIST_URL` |
| M2-4 | 限定 Pro 試験（任意） | `VITE_PRO_PAYMENT_URL`（Stripe Payment Link） |
| M2-5 | クリック計測 | `tip_click`, `waitlist_click` |

### まだやらない（契約外）

- 全機能ペイウォール
- 複数プラン・サブスク管理 UI
- Supabase Auth

## 運用セットアップ

1. [Ko-fi](https://ko-fi.com) 等でページ作成 → URL を `VITE_KOFI_URL` に
2. Waitlist: Google Form / Notion / Tally 等 → `VITE_WAITLIST_URL`
3. （任意）Stripe で Payment Link 1 本 → `VITE_PRO_PAYMENT_URL`
4. Vercel で Production に env を追加し再デプロイ

## 成功の目安（8 週〜）

- 投げ銭: 月 500〜3,000 円が不定期で入る
- Waitlist: 10 人以上が登録
- Payment Link 試験: 5〜10 人に手動招待して WTP を聞く
