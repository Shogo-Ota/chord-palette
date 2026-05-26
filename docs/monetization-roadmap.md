# Chord Palette — 収益化ロードマップ

副業・小規模収益（月数千〜数万円）向け。**本格 Stripe サブスクは MAU が見えてから。**

## フェーズ概要

| Phase | 期間目安 | 焦点 | スプリント |
|-------|----------|------|------------|
| 1 | 今〜8 週 | PMF・計測・共有 CTA・音質 | M1, Sprint 11, 6 |
| 1 ゲート | 4〜8 週観測 | UU / video_export / 外部シェア | `docs/phase1-gate.md` |
| 2 | ゲート後 | Ko-fi / Waitlist / Payment Link | M2 |
| 3 | MAU 証明後 | Supabase + Stripe Freemium | M3 |

## 実装マップ（コード）

| 機能 | ファイル / 設定 |
|------|-----------------|
| 計測 | `src/utils/analytics.ts`, `VITE_PLAUSIBLE_DOMAIN` |
| 共有 CTA | `shareVideo.ts`, `videoRenderer.ts` |
| LP 一文 | `CompositionPalette` |
| 軽量マネタイズ | `SupportSheet.tsx`, `VITE_KOFI_URL` 等 |
| 音質 v2.6 | `pleasantAcoustics.ts`, `instrumentPresets.ts`, `audioEngine.ts` |
| 転回形 | Sprint 10（`musicTheory`, `ChordSelectorSheet`） |

## 意思決定マトリクス

| 質問 | Yes → | No → |
|------|-------|------|
| 週間 MAU を計測しているか？ | Phase 2 マネタイズ | Plausible 設定 |
| 動画に `#ChordPalette` が載るか？ | 拡散施策 | videoRenderer 確認 |
| 10 人以上が週1再訪？ | Freemium 設計 | 音質・UI 改善 |
| Waitlist で WTP が分かる？ | Stripe 本実装 | Payment Link 試験 |

## 関連ドキュメント

- `docs/sprints/sprint-m1.md`
- `docs/sprints/sprint-m2.md`
- `docs/sprints/sprint-m3-monetization.md`
- `docs/phase1-gate.md`
