---
name: chord-palette-monetization
description: >-
  Chord Palette の三位一体収益化戦略（TikTok × Webアプリ × 有料note）、DB/認証不要の
  Lemon Squeezy フリーミアム、有料機能の優先度、マーケ導線・SEO・映えUIのプロダクト要件。
  課金・MIDI・ライセンス・転調・保存・収益化ロードマップ・Lemon Squeezy・TikTok CRP を
  扱うとき、または monetization / freemium / Pro 機能を実装・企画するときに使う。
---

# Chord Palette — 収益化・グロース戦略（開発前提）

出典: `Chord Palette 収益化ロードマップ策定.pdf`（三位一体型ストック収益化戦略レポート）  
詳細: 同ディレクトリの [reference.md](./reference.md) / プロダクト要件は [docs/spec.md](../../../docs/spec.md#収益化プロダクト要件三位一体モデル) / [docs/monetization-roadmap.md](../../../docs/monetization-roadmap.md)

## いつこのスキルを使うか

- 有料機能・ペイウォール・ライセンス入力 UI を追加するとき
- 「DB なし」「Auth なし」方針と矛盾する実装を検討するとき
- SEO・TikTok 導線・動画映え UI をプロダクトに組み込むとき
- スプリント M3 / 新規 monetization スプリントを Planner が書くとき

## ビジネス前提（開発が知るべき一点）

**単体アプリ課金だけがゴールではない。** TikTok 集客 → アプリ課金 → 開発・CVR データを有料 note で販売、の **フライホイール** が設計の中心。

```
TikTok（5分/本量産） → 検索「コードパレット」→ Vercel アプリ
    → Lemon Squeezy 課金（DB/Auth 不要）
    → 実装・マーケ数値を note（5,000円+）で再収益化 → 再びアプリへ流入
```

収益の式（レポート要約）: TikTok 流入 × アプリ CVR × 単価 + CRP 再生報酬 + note 流入 × note CVR × 単価。  
ベンチマーク: アプリ CVR **5〜6%**、LTV/ARPU 約 **3,000円**（個人開発アプリ平均として言及）。

## 技術方針（実装の絶対条件）

| 方針 | 内容 |
|------|------|
| 決済 | **Lemon Squeezy** ライセンス API（MoR・税務代行・キー自動発行）。初期は Stripe 本格サブスクを避ける |
| 認証 | **ユーザー Auth なし**（メール OAuth / Supabase Auth は Phase 3 相当の別軌道） |
| DB | **サーバー DB なし**。課金状態は `licenseKey` + `instanceId` を **localStorage**（再検証は API） |
| バックエンド | 最小: **ライセンス activate / validate** のみ（レポートは Next.js Route Handler 例 → 本リポは **Vite + Vercel Serverless Functions** で同等実装） |
| 購入後導線 | 決済完了リダイレクト `?license_key=XXXX` → クライアントが自動 activate → 即 Pro 解放 |

**既存コードとの関係:** `docs/sprints/sprint-m2.md` の Ko-fi / Waitlist は **Phase 1 検証用**として残してよい。本戦略の本番課金は Lemon Squeezy に寄せる。`sprint-m3-monetization.md` の Supabase+Stripe は **MAU 証明後の拡張案**であり、レポートの「極限フリーミアム」とは別フェーズ。

## 有料機能 — 優先度と技術（レポート確定）

| 優先 | 機能 | 実装方針 | 無料/有料 |
|------|------|----------|-----------|
| **1** | **MIDI エクスポート** | クライアントのみ `midi-writer-js` → Data URI ダウンロード。サーバー処理なし | **Pro** |
| **2** | **自動トランスポーズ** | キー変更時にパレット内コードを一括再計算（`musicTheory.ts` 拡張。`@tonaljs` は任意） | **Pro** |
| **3** | **進行のローカル保存** | IndexedDB または localStorage で JSON 配列。複数スロット・名前付き保存 | 基本は無料でも可。レポートは「全ユーザー価値」— **無制限・複数スロットは Pro** で差別化を検討 |

**無料で維持（集客・バイラル）:** コード進行スケッチ、試聴、3 音色、ドラム/Beat、動画書き出し（現行）、履歴 5 件程度、モバイル UI。

**Pro で解放（レポートのキラー）:** MIDI、キー変更時の進行一括移調、（ product 判断で）保存スロット無制限・1080p 等。

## ライセンス実装チェックリスト

1. `POST /api/license/activate` — `license_key` を Lemon Squeezy に送り、`variant_id` を env と照合
2. `POST /api/license/validate` — 再起動時に `instance_id` + `license_key` で `active` 確認
3. クライアント: `localStorage` に `cp_license_key`, `cp_instance_id`（キー名は既存 `cp_state_v1` と分離）
4. 購入 URL からの `?license_key=` を `App` 起動時に検出してサイレント activate
5. 多重アクティベーション: Lemon Squeezy の instance 上限・deactivate ポリシーをドキュメント化
6. env: `LEMON_SQUEEZY_VARIANT_ID`, API シークレットは **サーバーのみ**

## マーケ・プロダクトに効く実装要件

### TikTok / SEO 導線（リンク貼れない前提）

- 動画ラスト 3 秒: **「ブラウザで『コードパレット』と検索」**（コピペ不要）
- `index.html` の title / description / OGP に **「コードパレット」** を含め検索 1 位を狙う
- アプリ内・動画フッター URL: `chord-palette.vercel.app` を維持

### 動画映え・理論可視化（差別化 UI）

- ベース: 漆黒 `#090a0c` / `#111215`（既存ダーク UI と整合）
- **音階役割の 5 色明滅**（TikTok 用オプション or 録画モード）:
  - ルート `#10b981` / 3度 `#f59e0b` / 5度 `#0ea5e9` / 7度 `#6366f1` / テンション `#d946ef`
- コンテンツ用 **3 大進行**（プリセット or デモ用）— reference.md 参照

### 計測（note 販売の一次データ）

既存 `analytics.ts` を拡張し、少なくとも次を区別可能にする:

- `license_activate_success` / `license_activate_fail`
- `midi_export`（Pro）
- `search_landing`（UTM または `?from=tiktok`）
- TikTok 動画 ID は外部管理でもよいが、**表示 → 流入 → 課金** のファネルを手動で突合できるイベント名を固定する

## 実装時の禁止・注意

- **レポートの Next.js 例をそのまま移植しない** — 本リポは Vite。API は `api/` 配下の Vercel Functions 等
- Auth + DB を「簡単だから」先に入れない（保守コストがレポートの価値提案と矛盾）
- 特定アーティスト名・楽曲名をプリセットラベルに使わない（v3.0 著作権方針と同じ）
- ペイウォールで **試聴・基本スケッチ** を塞がない（CVR 低下）

## ロードマップとの対応（Day 1–90 要約）

| フェーズ | 日数 | 開発フォーカス |
|----------|------|----------------|
| 1 | 1–15 | Lemon Squeezy 設定、MIDI、license API、購入後リダイレクト、映え配色 |
| 2 | 16–45 | SEO meta、3 大進行デモ、動画テンプレ連携（CapCut はマーケ側） |
| 3 | 46–90 | Analytics 整理、note 用コードパック、CRP 向け 1 分+ 動画はコンテンツ側 |

## 関連ファイル（現状）

| 領域 | パス |
|------|------|
| 状態保存 | `src/utils/storage.ts` |
| 理論・キー | `src/utils/musicTheory.ts` |
| 動画 | `src/utils/videoExporter.ts`, `videoRenderer.ts` |
| 軽量マネタイズ M2 | `SupportSheet.tsx`, `VITE_KOFI_URL` 等 |
| 旧 Phase 3 案 | `docs/sprints/sprint-m3-monetization.md` |

新規実装のスプリントは **Planner** に `docs/spec.md` の収益化セクションと本スキルを読ませること。
