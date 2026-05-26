# Stripe Payment Link — 購入後の自動 Pro 解放

## 貼る URL（コピペ）

```
https://chord-palette.vercel.app/pro/success?session_id={CHECKOUT_SESSION_ID}
```

`{CHECKOUT_SESSION_ID}` は **Stripe の変数そのまま**。削除しない。

---

## ダッシュボードでどこを触るか（日本語 UI）

いま見ている **「概要」タブには出ません。** 必ず **編集画面** に入ります。

### 手順

1. **Payment Links（支払いリンク）** の一覧で、対象リンク（例: Chord Palette MIDI書出し機能）を開く  
2. 画面右上の **「編集」** をクリック  
   - プレビュー（右側）の上あたりにあるボタン  
   - 「概要」タブのままでは設定できない  
3. 編集ウィザードの **上部タブ** で **「お支払い後」**（英語 UI なら **After payment**）を選ぶ  
4. **「確認ページ」** のところで次のどちらかを選ぶ:  
   - **「お客様をウェブサイトにリダイレクト」**  
   - または **「確認ページを表示しない」** → リダイレクト URL を入力  
5. URL 欄に上記を貼る → **保存**

### 見つからないとき

| 状況 | 対処 |
|------|------|
| 「編集」がない / グレーアウト | リンク作成者アカウントでログインしているか確認。別アカウントなら権限不足の可能性 |
| 「お支払い後」タブがない | ウィザードを **左のステップ一覧** から探す（商品 → 支払い方法 → **お支払い後**） |
| リダイレクト欄が出ない | 「カスタムメッセージを表示」のままになっていないか確認。**リダイレクト**側を選択 |
| 既存リンクを直せない | 下の **API で更新** を使う |

---

## API で更新（ダッシュボードに項目がない場合）

ターミナル（`STRIPE_SECRET_KEY` はテストキー `sk_test_...`）:

```bash
# 1. Payment Link ID を確認（ダッシュボード URL の plink_... または API 一覧）
stripe payment_links list --limit 3

# 2. リダイレクトを設定（plink_xxx を自分の ID に置き換え）
stripe payment_links update plink_XXXXXXXXX \
  -d "after_completion[type]=redirect" \
  --data-urlencode "after_completion[redirect][url]=https://chord-palette.vercel.app/pro/success?session_id={CHECKOUT_SESSION_ID}"
```

---

## 404 が出るとき（いまの状態）

**`api/` フォルダと `vercel.json` がまだ Vercel にデプロイされていない**と  
`https://chord-palette.vercel.app/api/stripe-webhook` は **404** になります。

### 直し方

1. 変更を **git commit & push**（または Vercel ダッシュボードから再デプロイ）
2. Vercel の **Environment Variables** に Stripe 用 env を入れる
3. デプロイ完了後、ブラウザで  
   `https://chord-palette.vercel.app/api/stripe-webhook`  
   を開く → **JSON**（`ok: true`）が出れば OK（404 ではない）

> Webhook は **POST 専用**ですが、生存確認のため GET でも JSON を返します。  
> Stripe ダッシュボードの Webhook テストは **POST** です。

---

## Webhook（別設定・必須）

**開発者** → **Webhook** → エンドポイント追加

- URL: `https://chord-palette.vercel.app/api/stripe-webhook`
- イベント: **`checkout.session.completed`** のみ

---

## 購入後の流れ

```
支払い完了
  → /pro/success?session_id=cs_test_...
  → ライセンス取得（最大約30秒）
  → /?license=XXXX-XXXX-XXXX
  → Pro 有効（MIDI 🔓）
```

失敗時: アプリで **Pro モーダル** からキー手入力（`/?open_pro=1`）。
