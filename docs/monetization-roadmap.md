# Chord Palette — 収益化ロードマップ

**戦略レポート（北極星）:** `Chord Palette 収益化ロードマップ策定.pdf` — 三位一体モデル（TikTok × アプリ × note）  
**開発スキル:** `.agents/skills/chord_palette_monetization/SKILL.md`  
**プロダクト要件:** `docs/spec.md` § 収益化・プロダクト要件

---

## 収益モデル概要

個人開発の人的資源を「開発・集客・収益化」で分断せず、**各チャネルが相互にレバレッジするフライホイール**を回す。

```
TikTok（週5本+/5分制作） ──検索「コードパレット」──► Webアプリ
        ▲                      │
        │                      ▼ Lemon Squeezy（DB/Auth不要）
        │                 MIDI・転調・保存=Pro
        │                      │
        └──── note 5,000円+ ◄── 実装コード + CVR実数値
```

**収益の柱:** アプリ課金（CVR 目安 5–6%、ARPU 約 3,000円）+ TikTok CRP + 有料 note。

---

## フェーズ対応表（レポート × 既存 Phase）

| レポート Phase | 日数 | 焦点 | 既存ドキュメント |
|----------------|------|------|------------------|
| 技術基盤・課金 | Day 1–15 | Lemon Squeezy、MIDI、license API、映え UI | **新: M4**（下記） |
| トラフィック | Day 16–45 | TikTok 量産、SEO、3 大進行デモ | Phase 1 継続 + **M7** |
| note・CRP | Day 46–90 | 1分動画、Analytics、note 販売 | Phase 2 データを note に |

| 既存 Phase | 内容 | 本レポートとの関係 |
|------------|------|---------------------|
| **Phase 1** | PMF・Plausible・動画シェア・音質 | **継続** — ゲート `docs/phase1-gate.md` |
| **Phase 2 (M2)** | Ko-fi / Waitlist / Payment Link | **並行検証** — 本番課金は Lemon に寄せる |
| **Phase 3 (M3)** | Supabase + Stripe Freemium | **後段** — MAU 証明後。レポートの初期方針より後 |

---

## 実装マップ（コード）

| 機能 | 状態 | ファイル / 備考 |
|------|------|-----------------|
| 計測 | 一部 | `src/utils/analytics.ts`, `VITE_PLAUSIBLE_DOMAIN` |
| 共有・動画 CTA | 済 | `shareVideo.ts`, `videoRenderer.ts`, `videoExporter.ts` |
| 軽量マネタイズ M2 | 済 | `SupportSheet.tsx`, `VITE_KOFI_URL` 等 |
| セッション保存 | 済 | `storage.ts`（`cp_state_v1`） |
| **Lemon Squeezy ライセンス** | **未** | `api/license/*`（Vercel Functions 想定） |
| **MIDI エクスポート** | **未** | `midi-writer-js`、Pro ゲート |
| **自動トランスポーズ** | **未** | `musicTheory.ts` + キー変更フック |
| **進行ライブラリ** | **未** | IndexedDB |
| **Pro 状態** | **未** | localStorage `cp_license_*` |
| 映え 5 色ハイライト | **未** | デモ/録画モード（オプション） |

---

## 有料機能優先度（レポート確定）

1. **MIDI エクスポート** — 最優先キラー（DAW 連携）
2. **自動トランスポーズ** — キー変更時の進行一括更新
3. **ローカル進行ライブラリ** — 複数スロット（無料は履歴 5 件で差別化可）

---

## 意思決定マトリクス（更新）

| 質問 | Yes → | No → |
|------|-------|------|
| Phase 1 ゲートを満たしたか？ | M4 課金実装 + TikTok 本格投入 | 音質・UI・計測を継続 |
| Lemon Squeezy テスト課金が通るか？ | Production Variant 公開 | activate/validate を直す |
| MIDI/転調の Pro 価値が試せるか？ | 価格・LP を固定 | P1/P2 の UX を改善 |
| 週間 MAU 200+ / Waitlist 20+？ | M3（Supabase+Stripe）を検討 | Lemon 買い切り/サブで深掘り |
| TikTok 1万フォロワー+ & 30日10万再生？ | CRP 申請 + 1分動画ライン | 30秒ショート量産を継続 |

---

## スプリント案（Planner 用）

| ID | 名称 | 主な Deliverable |
|----|------|------------------|
| M4 | monetization-core | Lemon Squeezy、license API、Pro フラグ、`?license_key=`、MIDI |
| M5 | transpose-pro | キー変更時の進行一括トランスポーズ |
| M6 | library-local | IndexedDB 進行ライブラリ |
| M7 | growth-ui | SEO meta、3 大進行プリセット、5 色デモモード |

---

## マーケ要件チェックリスト（プロダクト）

- [ ] `index.html` に「コードパレット」を含む title/description
- [ ] 購入完了 → `?license_key=` 自動解放
- [ ] 動画・UI に検索誘導コピー（外部制作含む）
- [ ] Analytics で 流入 → activate → midi_export を追える
- [ ] 3 大進行をワンタップ試聴できるデモ（任意）

---

## 関連ドキュメント

- `docs/spec.md` — § 収益化・プロダクト要件
- `.agents/skills/chord_palette_monetization/` — エージェント向けスキル
- `docs/sprints/sprint-m1.md` / `sprint-m2.md` / `sprint-m3-monetization.md`
- `docs/phase1-gate.md`
