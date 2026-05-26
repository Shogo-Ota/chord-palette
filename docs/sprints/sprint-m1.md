# Sprint M1 — 収益化の土台（計測 + 共有 CTA）

**ステータス:** 実装済み（v2.6.0）  
**目的:** Phase 1 PMF 証明のため、「使われているか」を計測し、動画・テキスト共有にブランドを載せる。

## スプリント契約

### 必須（Done）

| ID | 要件 | 実装 |
|----|------|------|
| M1-1 | Plausible 互換のカスタムイベント | `src/utils/analytics.ts` + `VITE_PLAUSIBLE_DOMAIN` |
| M1-2 | イベント: `play_sequence`, `video_export`, `tone_change`, `chord_add`, `share_video`, `support_open` | `App.tsx` |
| M1-3 | 共有テキストに `#ChordPalette` + 本番 URL | `shareVideo.ts` |
| M1-4 | 動画フッターにブランド CTA（Made with / ハッシュタグ / URL） | `videoRenderer.ts` |
| M1-5 | ワークスペースに LP 一文 | `CompositionPalette` `heroTagline` |
| M1-6 | `.env.example` に Plausible / マネタイズ用変数 | ルート |

### 計測イベント一覧

| イベント | 発火タイミング | props（例） |
|----------|----------------|-------------|
| `play_sequence` | ▶ 再生 | `chords`, `bpm` |
| `video_export` | 動画書き出し成功後 | `chords`, `mode` |
| `share_video` | 同上 | `mode` |
| `tone_change` | Tone 変更 | `tone` |
| `chord_add` | パレットに追加 | `source` |
| `support_open` | 応援シートを開く | — |
| `tip_click` | Ko-fi リンク | — |
| `waitlist_click` | Waitlist リンク | — |

`pageview` は Plausible スクリプトが自動計測（ドメイン設定時）。

## 本番セットアップ

1. [Plausible](https://plausible.io) で `chord-palette.vercel.app` を登録
2. Vercel の Environment Variables に `VITE_PLAUSIBLE_DOMAIN=chord-palette.vercel.app` を設定
3. 再デプロイ後、Plausible ダッシュボードで Goals に上記カスタムイベントを追加

## 非スコープ

- Stripe / ログイン
- ペイウォール
