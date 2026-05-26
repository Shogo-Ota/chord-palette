## Sprint 16: Stripe + MIDI エクスポート Pro（DB / Auth なし買い切りライセンス）

### 目的

v2.9.3 までで完成した「無料の作曲スケッチ体験」を維持したまま、**MIDI エクスポートだけを Pro 機能として有料化**する。
**DB なし・ログインなし・買い切り**を貫き、決済は **Stripe Payment Link**、ライセンスは **HMAC 署名による自己検証式**を採用する。
完了をもって **v3.0 リリース候補**とする。

> **設計判断の更新（M4 案からの差分）:** `docs/monetization-roadmap.md` / `SKILL.md` の Lemon Squeezy 案は **Stripe Payment Link + HMAC ライセンス**に置き換える。
> 理由: (1) ユーザーが日本市場で Stripe を選好、(2) Lemon Squeezy API への instance 紐付け管理が不要となり「DB なし」をより純粋に実現可能、(3) HMAC 自己検証なら Stripe ダウン時もアプリは無料機能で動作継続。
> Lemon Squeezy 統合計画は本スプリント完了後にアーカイブする。

---

### A. ライセンスキー仕様

| 項目 | 仕様 |
|---|---|
| フォーマット | `XXXX-XXXX-XXXX`（base32 大文字 4 文字 × 3 ブロック、ハイフン区切り、計 14 文字） |
| 文字集合 | RFC 4648 base32 大文字（`A–Z`, `2–7`）。`0` / `O` / `1` / `I` を含まないため手入力で誤読しにくい |
| 生成元 | `HMAC-SHA256(LICENSE_SECRET, "v1:" + stripe_customer_id + ":" + stripe_payment_intent_id)` の **先頭 60bit** を base32 12 文字に丸める |
| 名前空間 | プレフィクス `"v1:"` を HMAC 入力に含める。将来 v2 形式に拡張する場合は `"v2:"` を採用し、サーバー側で両方検証する |
| 失効 | **永続ライセンス（買い切り）**。Stripe `payment_intent_id` が一意なため衝突なし |
| 多端末利用 | **許容**（DB なし制約のため。同一キーが N 端末で使用されても無料機能に影響なし） |
| 失効リスト | 初期は実装しない。返金時の rev 対応は将来 `LICENSE_REVOKED_LIST`（env のカンマ区切り）で対応する設計余地のみ残す |

**キー検証アルゴリズム（サーバー）**:

1. 受信した `license` を `XXXX-XXXX-XXXX` 正規表現でバリデーション
2. Stripe Customers + Payment Intents を **検索 API でスキャン**（直近 90 日分、`limit=100` ページング）し、各組み合わせで HMAC を再計算
3. 受信キーと一致する組み合わせが見つかれば `{ valid: true, features: ["midi-export"] }`
4. 一致なしなら `{ valid: false }`
5. **Stripe スキャンの効率化**: 初回検証成功時、サーバーは Stripe Customer Metadata に `cp_license_key=XXXX-XXXX-XXXX` を保存。次回以降は Metadata から検索可能になる

---

### B. Vercel Function 仕様

#### B-1. `POST /api/stripe-webhook`

| 項目 | 内容 |
|---|---|
| メソッド | POST のみ（他は 405） |
| 認証 | Stripe 署名ヘッダ `stripe-signature` を `STRIPE_WEBHOOK_SECRET` で検証 |
| 処理対象イベント | `checkout.session.completed` のみ。他は 200 で no-op 返却 |
| 処理内容 | (1) Session から `customer` / `payment_intent` を取得、(2) HMAC でライセンスキー生成、(3) Stripe Customer Metadata に `cp_license_key` を保存 |
| 副次処理 | Stripe Receipt Email 経由でキーを顧客に通知（Stripe ダッシュボード側で Receipt にカスタム文言を入れる準備をユーザーが行う前提） |
| レスポンス | 200 `{ received: true }` |
| 冪等性 | 同じ session.completed が再送されてもキーが変わらない（HMAC が決定的）。Metadata 上書きは安全 |
| ランタイム | Node.js（Vercel デフォルト）。`stripe` npm パッケージ（**dependencies に追加可、サーバー専用**） |

#### B-2. `POST /api/verify-license`

| 項目 | 内容 |
|---|---|
| メソッド | POST のみ（GET/OPTIONS は CORS preflight として処理） |
| リクエスト Body | `{ license: string }` |
| CORS | `Access-Control-Allow-Origin` は **`https://chord-palette.vercel.app` + 開発時 `http://localhost:5173` のホワイトリスト** |
| レート制限 | 同一 IP からの 1 分あたり 30 リクエストでソフトリミット（429）。実装は in-memory Map で十分（Vercel Function コールドスタートでリセットされる前提） |
| レスポンス（成功） | `{ valid: true, features: ["midi-export"], verifiedAt: <ISO8601> }` |
| レスポンス（失敗） | `{ valid: false, reason: "format" \| "not_found" }`（HTTP 200 で返す。401 は使わない） |
| 副次処理 | 成功時、Stripe Customer Metadata に `cp_last_verified_at` を保存（任意） |

#### B-3. `api/_lib/license.ts`（共通モジュール、Function ではなく内部ヘルパ）

- `generateLicenseKey(customerId, paymentIntentId, secret): string`
- `verifyLicenseKey(license, secret, stripeClient): Promise<{ valid: boolean; customerId?: string }>`
- 両 Function で再利用。テスト容易性のため副作用は外側で起こす

---

### C. 環境変数

| 変数名 | スコープ | 用途 |
|---|---|---|
| `STRIPE_SECRET_KEY` | **サーバーのみ** | Stripe API キー（`sk_live_...` / `sk_test_...`） |
| `STRIPE_WEBHOOK_SECRET` | **サーバーのみ** | `whsec_...`。Webhook 署名検証用 |
| `LICENSE_SECRET` | **サーバーのみ** | HMAC キー。32 文字以上の英数記号。**ローテーションは破壊的**（既存キー全失効）なので慎重に設定 |
| `STRIPE_PRODUCT_ID_PRO` | サーバーのみ | Product ID。Webhook で誤った商品の決済を弾くために使用 |
| `STRIPE_API_VERSION` | サーバーのみ | 例: `2025-04-30.basil`（Stripe Node SDK 18 系の最新）。コードでハードコードでもよいが env 化で更新性向上 |
| `VITE_STRIPE_PAYMENT_URL` | **クライアント可** | Payment Link URL。`https://buy.stripe.com/xxxx` |
| `VITE_PRO_PRICE_LABEL` | クライアント可 | UI 表示用価格文字列（例: `¥980`）。Stripe 側の価格と整合させる責任はユーザー |

**禁止事項**: `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `LICENSE_SECRET` に **`VITE_` プレフィクスを付けてはならない**（クライアントバンドルに露出する）。

---

### D. UI 設計

#### D-1. MIDI Export ボタン（CompositionPalette playback-bar 行3）

- 配置: トランスポート行（再生 / ループ / 🎬動画書き出し）の **🎬 の右隣**
- ラベル: `🎹 MIDI`（21px アイコン + 小キャプション）
- 状態:
  - **Pro 未保有**: 🔒 オーバーレイ + グレースケール。タップで `ProModal` を開く
  - **Pro 保有 + パレット空**: disabled（既存の動画書き出しと同じルール）
  - **Pro 保有 + パレットあり**: 通常状態、タップで MIDI 生成 → ダウンロード or Web Share

#### D-2. ProModal（購入 + ライセンス入力）

```
┌─────────────────────────────┐
│  🎹 MIDI エクスポートで        │
│     DAW へ書き出し            │
│                              │
│  コード進行 + ドラムを MIDI    │
│  ファイル化。Logic / GarageBand│
│  / Ableton 等にドラッグ&ドロップ│
│                              │
│  ¥980（買い切り・永続）      │
│                              │
│  [ Stripe で購入 ]           │
│                              │
│  ─ または ─                  │
│                              │
│  ライセンスキーをお持ちですか？│
│  [ XXXX - XXXX - XXXX ]      │
│  [ 認証する ]                │
│                              │
│           [ 閉じる ]          │
└─────────────────────────────┘
```

- Framer Motion で `<motion.div>` スライドアップ（既存 ChordSelectorSheet と同じトランジション）
- 375px 幅で要素が縦に積み上がる
- 「Stripe で購入」ボタン → `VITE_STRIPE_PAYMENT_URL` へ `window.location.href` で遷移（新規タブではなく同一タブ。戻り時の URL クエリ捕捉を確実にするため）

#### D-3. ライセンス入力フォーム

- 1 入力欄に 12 文字分（ハイフンは `onChange` で自動挿入）
- IME を無効化（`inputMode="text"` + 自動大文字化）
- 入力中は灰色、4 文字ごとに視覚的にブロック分割
- 「認証する」タップ → ローディングスピナー → 成功でトースト `Pro 機能が有効になりました` + モーダル閉じる
- 失敗時は赤エラー文 `ライセンスキーが無効です` を入力欄下に表示

#### D-4. 既購入ユーザーの UI

- ProModal を再度開いた場合: 「Pro 有効」バッジ + ライセンスキー末尾 4 文字のみ表示（例: `••••-••••-AB3F`）
- 「ライセンスを解除」ボタン（localStorage クリア + 確認ダイアログ）

#### D-5. URL クエリからの自動取り込み

- App 起動時に `URLSearchParams.get("license")` を確認
- 存在すれば即 `/api/verify-license` 呼び出し → 成功で localStorage 保存 + URL から `license` パラメータを `history.replaceState` で除去
- 失敗ならトーストで通知（モーダルは開かない）

---

### E. ファイル配置

#### 新規ファイル

| パス | 役割 |
|---|---|
| `api/stripe-webhook.ts` | Stripe Webhook 受信・ライセンス生成 |
| `api/verify-license.ts` | ライセンス検証 |
| `api/_lib/license.ts` | HMAC 生成・検証共通モジュール |
| `src/utils/midiExporter.ts` | `@tonejs/midi` でコード+ドラム → SMF Blob |
| `src/utils/license.ts` | localStorage CRUD + verify API 呼び出し + URL クエリ取り込み |
| `src/hooks/useProLicense.ts` | React Hook（`{ isPro, license, verify, clear, isVerifying }`） |
| `src/components/ProModal.tsx` | 購入 + ライセンス入力モーダル |

#### 修正ファイル

| パス | 修正内容 |
|---|---|
| `src/App.tsx` | `useProLicense` 統合、`ProModal` 制御、MIDI ハンドラ、URL クエリ自動取り込み |
| `src/components/CompositionPalette.tsx` | MIDI ボタン追加、Pro 未保有時のロック表示、`onOpenProModal` prop |
| `src/index.css` | `.btn-midi`, `.btn-midi-locked`, `.pro-modal`, `.license-input` スタイル |
| `package.json` | `@tonejs/midi` + `stripe` を dependencies に追加 |
| `.env.example` | 上記環境変数 7 件を例示 |
| `docs/spec.md` | 収益化セクションに Sprint 16 / v3.0 概要を追記 |
| `vercel.json`（存在しなければ新規） | `api/stripe-webhook.ts` の `bodyParser: false` 設定（Stripe 署名検証のため raw body 必要） |

---

### F. MIDI ファイル仕様

| 項目 | 値 |
|---|---|
| ライブラリ | `@tonejs/midi` ^2.0.x（MIT、gzip 約 15 kB） |
| フォーマット | SMF Type 1（マルチトラック） |
| PPQ | 480 ticks per quarter note |
| テンポトラック | ユーザー設定の `bpm` を 1 イベントで先頭に配置 |
| 拍子 | 4/4 固定（v3.0 では拍子変更 UI なし） |
| トラック数 | **2**（メロディトラックは将来追加。本スプリントには含めない） |

#### F-1. Track 1: Chord

- Channel: 0
- Program (instrument): **0 (Acoustic Grand Piano)** 固定
- ノート構築:
  - `voiceChordForPlayback(palette, instrumentId="rush", useVoiceLeading=true)` で MIDI 配列取得
  - 各コードの `beats`（1 / 0.5 / 0.25）を MIDI duration に変換（`beats * 480` ticks）
  - 同時発音（コード）として 1 つの `time` に複数の `note` を配置
- ベロシティ: 100 固定（将来 voicing 由来で変える余地あり）

#### F-2. Track 2: Drum

- Channel: **9**（GM 規格、ドラム専用）
- Program: 0（無視される）
- ノートマッピング:
  - Kick = 36 (C1)
  - Snare = 38 (D1)
  - HiHat Closed = 42 (F#1)
  - HiHat Open = 46 (A#1)
  - Clap = 39（必要時）
- パターン:
  - 現行 `DrumPattern` の `rock / jazz / funk / pop / soul`（5 ジャンル）を 1 小節 = 16 step として MIDI 化
  - `drumPattern === "none"` の場合は Track 2 を **空のまま出力**（トラック自体は残す）
  - パレット全長（コード数 × beats 合計）に渡ってループ
- ベロシティ: Kick 110 / Snare 100 / HiHat 70 / Clap 95（ゴーストノートは ×0.5）

#### F-3. 出力

- ファイル名: `chord-palette-<YYYYMMDD-HHmmss>.mid`
- 出力方法:
  1. Web Share API が `files: [midiFile]` 対応なら `navigator.share`
  2. 非対応なら `<a download>` でローカル保存
- MIME: `audio/midi`

---

### G. スプリント契約（完了条件）

以下の全 30 項目を満たした場合のみ、このスプリントは完了とする。

#### G-1. 依存追加・ビルド

- [ ] `@tonejs/midi` が `package.json` の `dependencies` に追加されている
- [ ] `stripe`（Node SDK）が `dependencies` に追加されている（API Function でのみ使用）
- [ ] `npm install` 後に `npm run build` がエラーなく通る
- [ ] `npm run lint` がエラーなく通る
- [ ] gzip 後の JS バンドルサイズが **147 kB を超えない**（@tonejs/midi 約 15 kB 追加分を許容、上限は +2 kB バッファ込み）。超過した場合は `midiExporter.ts` を **動的 import** に切り替えて再計測する

#### G-2. サーバー（Vercel Functions）

- [ ] `api/stripe-webhook.ts` が新規作成され、`stripe-signature` ヘッダを `STRIPE_WEBHOOK_SECRET` で検証している
- [ ] Webhook は `checkout.session.completed` のみ処理し、その他イベントは 200 で no-op を返す
- [ ] ライセンスキーが `HMAC-SHA256(LICENSE_SECRET, "v1:" + customerId + ":" + paymentIntentId)` を base32 で 12 文字に丸めて生成され、`XXXX-XXXX-XXXX` 形式で Stripe Customer Metadata に保存される
- [ ] `api/verify-license.ts` が新規作成され、POST のみ受け付け、`{ license }` を HMAC + Stripe Customer 検索で検証する
- [ ] CORS が `https://chord-palette.vercel.app` と `http://localhost:5173` の **2 オリジンのみ許可**
- [ ] `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `LICENSE_SECRET` が **`VITE_` プレフィクスなし**で、サーバー側でのみ参照される（grep で `VITE_STRIPE_SECRET` 等がヒットしないこと）
- [ ] `vercel.json` で `api/stripe-webhook.ts` の raw body を有効化している（Stripe 署名検証のため）

#### G-3. クライアント（ライセンス・UI）

- [ ] `src/utils/license.ts` が localStorage `cp_pro_license` の get/set/clear を提供する（既存 `cp_state_v1` とキー分離）
- [ ] `src/hooks/useProLicense.ts` が `{ isPro, license, verify, clear, isVerifying, error }` を返す
- [ ] App 起動時に localStorage のキーが存在すれば `/api/verify-license` を呼び、24 時間以内に成功した検証履歴があれば API 呼び出しをスキップする（オフライン対応）
- [ ] URL クエリ `?license=XXXX-XXXX-XXXX` が起動時に検出され、verify 成功で localStorage に保存され、`history.replaceState` で URL から除去される
- [ ] `ProModal.tsx` が新規作成され、購入ボタン（`VITE_STRIPE_PAYMENT_URL`）+ ライセンス入力欄 + 認証ボタンを持つ
- [ ] ライセンス入力欄が 12 文字 + ハイフン自動挿入・大文字変換・base32 集合外文字の弾きを行う
- [ ] CompositionPalette の playback-bar 行3 に MIDI ボタンが追加され、Pro 未保有時は 🔒 表示
- [ ] Pro 未保有時に MIDI ボタンをタップすると `ProModal` が開く
- [ ] Pro 保有時に MIDI ボタンをタップすると MIDI ファイルがダウンロード or Web Share される

#### G-4. MIDI 出力

- [ ] `src/utils/midiExporter.ts` が `@tonejs/midi` で SMF Type 1（2 トラック、PPQ 480、テンポトラック）を生成する
- [ ] Track 1 にコード進行が voice-leading 後の MIDI 値で同時発音として配置される
- [ ] Track 2 にドラムパターン（GM channel 9、Kick 36 / Snare 38 / HiHat 42・46）がパレット全長ループで配置される
- [ ] `drumPattern === "none"` の場合 Track 2 は空（トラックは存在）
- [ ] 出力ファイル名が `chord-palette-<YYYYMMDD-HHmmss>.mid`
- [ ] 出力ファイルが Logic Pro / GarageBand / Ableton Live のいずれかにインポート可能（手動確認、`Sound Critic` / `Evaluator` ではなくユーザー実機確認）

#### G-5. セキュリティ・後方互換

- [ ] Pro 未保有でも既存の無料機能（再生・編集・履歴・動画書き出し・転回形・3 音色・5 ジャンルドラム）が **完全に動作する**（リグレッションなし）
- [ ] localStorage `cp_state_v1` の構造に変更を加えていない（互換性維持）
- [ ] iOS Safari の AudioContext lifecycle に影響を与えていない
- [ ] 375px モバイル幅で ProModal / MIDI ボタンが他要素と崩れず配置される

---

### H. 受け入れ条件（Evaluator）

#### H-1. UI / 機能網羅（Playwright MCP）

- [ ] Pro 未保有状態で MIDI ボタンに 🔒 が見える
- [ ] MIDI ボタンタップで ProModal が開く（Framer Motion トランジション）
- [ ] ライセンス入力欄に不正フォーマット（`XXXX-YYY` 等）を入れて認証 → 赤エラー文表示
- [ ] 有効なライセンスキー（テスト用は手動注入: `localStorage.setItem('cp_pro_license', ...)` ではなく **`/api/verify-license` 経由**で取得）を入れて認証 → モーダル閉じ + MIDI ボタンが通常状態に
- [ ] Pro 有効状態で MIDI ボタンタップ → MIDI ファイル（`audio/midi`）のダウンロードまたは share シートが発火（`page.on("download")` で検出）
- [ ] ProModal を再度開くと「Pro 有効」バッジとキー末尾 4 文字が表示される
- [ ] 「ライセンスを解除」で localStorage がクリアされ、MIDI ボタンが再びロックされる
- [ ] 375px ビューポートで全 UI が崩れない

#### H-2. セキュリティ・契約

- [ ] DevTools Sources タブで client バンドルを検索して `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `LICENSE_SECRET` の文字列が **1 件もヒットしない**
- [ ] `api/verify-license` への CORS preflight が許可ドメイン以外から 403 で弾かれる（curl で `Origin: https://evil.example` ヘッダ送信して確認）
- [ ] Stripe Webhook へ署名なし POST → 400 で弾かれる（curl 確認）

#### H-3. リグレッション

- [ ] v2.9.3 までの全機能（再生・編集・転回形・3 音色・Rush サンプル・5 ジャンルドラム・Beat 軸・動画書き出し・履歴・モバイル UI）が動作

---

### I. 手動確認シナリオ（実 Stripe テスト含む）

#### I-1. 開発環境セットアップ

1. `npm install` で `@tonejs/midi` / `stripe` を取得
2. `.env.local` に下記を設定:
   ```
   STRIPE_SECRET_KEY=sk_test_xxx
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   LICENSE_SECRET=<32 文字以上のランダム文字列>
   STRIPE_PRODUCT_ID_PRO=prod_xxx
   STRIPE_API_VERSION=2025-04-30.basil
   VITE_STRIPE_PAYMENT_URL=https://buy.stripe.com/test_xxx
   VITE_PRO_PRICE_LABEL=¥980
   ```
3. Stripe CLI で webhook をローカルへ転送:
   ```
   stripe listen --forward-to localhost:3000/api/stripe-webhook
   ```
4. `npm run dev` で起動（Vite + Vercel Functions は `vercel dev` で同時起動推奨）

#### I-2. 購入フローのエンドツーエンド

5. ブラウザで `http://localhost:5173` を開き、MIDI ボタンに 🔒 がついていることを確認
6. MIDI ボタンタップ → ProModal が開く
7. 「Stripe で購入」タップ → Stripe テスト Payment Link に遷移
8. テストカード `4242 4242 4242 4242` で決済完了
9. リダイレクト URL に `?license=XXXX-XXXX-XXXX` が含まれて戻ることを確認
10. アプリ自動で verify → トースト表示 → MIDI ボタンが通常状態に
11. URL から `?license=` が `history.replaceState` で消えていることを確認

#### I-3. MIDI 書き出し

12. パレットに `CM7 - Am7 - FM7 - G7` を並べ、ドラムを `pop` に設定、BPM 120
13. MIDI ボタンタップ → `chord-palette-<timestamp>.mid` がダウンロード
14. GarageBand / Logic / Ableton Live のいずれかにドラッグ&ドロップ
15. Track 1（Piano）にコード進行、Track 2（Drum）にパターンが正しく載っていることを確認
16. テンポ 120 BPM、4/4、PPQ 480 で再生される

#### I-4. ライセンス手動入力

17. localStorage をクリア（DevTools > Application）
18. MIDI ボタンタップ → ProModal で I-2 で取得したキーを手入力
19. 認証成功でモーダル閉じ + MIDI ボタン有効化

#### I-5. 後方互換・リグレッション

20. Pro 解除（ProModal > 「ライセンスを解除」）
21. 再生 / 編集 / 転回形 / 動画書き出し / 履歴 / 3 音色切替 / 5 ジャンルドラム切替 がすべて動作
22. iPhone 実機（iOS 16.4+）で同上手順を実施し、AudioContext / 動画書き出しに影響がないことを確認

---

### J. ユーザー準備事項（Stripe ダッシュボード設定）

スプリント着手前に **ユーザー自身**で完了させる必要がある作業:

1. **Stripe アカウント作成・本人確認完了**（既に完了している前提）
2. **Product 作成**: ダッシュボード > Products > 「Chord Palette Pro」/ 一括払い / ¥980（または希望価格）/ Statement descriptor `CHORD PALETTE`
3. **Payment Link 作成**: 上記 Product を選択、成功 URL を `https://chord-palette.vercel.app/?license={CHECKOUT_SESSION_LICENSE}` ... ではなく Stripe 標準の `?session_id={CHECKOUT_SESSION_ID}` を使用し、サーバー側 Webhook でメール通知。**OR** カスタムドメインで `https://chord-palette.vercel.app/pro/success?session_id={CHECKOUT_SESSION_ID}` ページを別途用意し、そこで session_id から license を取得して `?license=` 付きで `/` にリダイレクトさせる方式が安全
4. **Webhook エンドポイント追加**: ダッシュボード > Developers > Webhooks > `https://chord-palette.vercel.app/api/stripe-webhook` / イベント `checkout.session.completed` のみ / signing secret を `STRIPE_WEBHOOK_SECRET` に登録
5. **Stripe Receipt 設定**: ダッシュボード > Settings > Emails > Receipts を有効化。カスタムフッターに「ライセンスキーは購入後の Chord Palette アプリ画面にて自動表示されます」を追記
6. **Vercel 環境変数登録**: Vercel Project Settings > Environment Variables に C 節の全変数を Production / Preview / Development それぞれに登録
7. **LICENSE_SECRET の生成**: `openssl rand -base64 48`（または等価）で生成し、Vercel に登録。**ローカルメモには控えず、Vercel UI でのみ管理**
8. **テストモード動作確認**: Stripe テストキー（`sk_test_` / `pk_test_`）で I-1 〜 I-3 を完走
9. **本番切替**: テスト完走後、Stripe 本番キー（`sk_live_`）に Vercel env を差し替え、本番 Payment Link を再発行
10. **TikTok / SEO 文言更新**（任意）: 動画概要欄に「Pro 機能で MIDI 書き出し対応（¥980 買い切り）」を追加

---

### K. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| Stripe Webhook が到達しない（ローカル開発） | キー生成テストができない | Stripe CLI `stripe listen` でローカル転送 |
| success_url の `?license=` が見えない（カスタムページ未作成） | 購入後にキー取得経路がない | Webhook の Stripe Receipt メール経由でキーを送付。ユーザーが手入力する経路を Always-On 提供 |
| `LICENSE_SECRET` ローテーション時の既存ユーザー失効 | サポート負荷 | ローテーションは行わない方針。漏洩時のみ実施し、影響を受けたユーザーには Stripe Customer Metadata から再発行 |
| Stripe Customer 検索の N+1 問題（多数顧客時） | verify API レスポンス遅延 | 初回検証時に Customer Metadata へキー保存し、2 回目以降は `search` API で `metadata['cp_license_key']:'XXX'` で 1 件取得 |
| @tonejs/midi のバンドル肥大（gzip 15 kB） | 上限 145 kB 突破 | 動的 import (`import("../utils/midiExporter")`) でユーザーが MIDI ボタン押下時のみロード |
| 同一キーの多端末利用許容によるシェア漏洩 | 売上機会損失 | DB なし制約のため許容。将来サブスク化時に instance 管理を導入する場合は別スプリントで対応 |
| Stripe テストモードと本番モードの混在事故 | 本番でテストキーが通る / 逆 | env を Vercel Production / Preview で完全分離。コード側にモード判定ロジックを入れない |
| `?license=` を含む URL が SNS シェアされて漏洩 | キーの拡散 | `history.replaceState` で起動直後に URL から除去。ユーザーが SNS にコピペする隙を最小化 |
| iOS Safari の Payment Link 戻り時 AudioContext suspend | 戻り直後に再生不能 | 既存の `resumeAudioContext()` 経路でユーザーの次のタップ時に復帰 |

---

### L. 戻し先（不合格時の指針）

| 不合格項目 | 戻し先 |
|---|---|
| ライセンス生成・検証ロジック（HMAC、Stripe API 呼び出し） | Generator |
| Webhook 署名検証失敗 / CORS 設定誤り | Generator |
| MIDI ファイルが DAW で開けない / トラック構造不正 | Generator |
| バンドルサイズ超過（147 kB 超え） | Generator（動的 import 検討） |
| ProModal の 375px レイアウト崩れ / ライセンス入力欄の自動フォーマット不良 | Designer |
| MIDI ボタン 🔒 表示の視認性 / ProModal のアニメーション | Designer |
| Pro 未保有時に既存機能がブロックされた（リグレッション） | Generator |
| iOS Safari での Stripe 戻り時 AudioContext 不整合 | Generator |

---

### M. 完了後の次スプリント案

- **Sprint 17 (M5)**: 自動トランスポーズ Pro 機能（`musicTheory.ts` 拡張、キー変更時のパレット一括再計算）
- **Sprint 18 (M6)**: 進行ライブラリ Pro 機能（IndexedDB、複数スロット名前付き保存）
- **Sprint 19 (M7)**: SEO / 3 大進行プリセット / 5 色映え UI（マーケ要件）

---

### 参考

- 戦略レポート: `Chord Palette 収益化ロードマップ策定.pdf`
- 関連スキル: `.agents/skills/chord_palette_monetization/SKILL.md`
- ロードマップ: `docs/monetization-roadmap.md`
- 製品要件: `docs/spec.md` § 収益化・プロダクト要件
