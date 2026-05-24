## Sprint 7: 非 HTTPS / LAN クリップボード対策の検証と仕上げ

### 背景

開発時に LAN（例: `http://192.168.x.x:5173`）でスマホ実機から確認するケースがあるが、
`navigator.clipboard.writeText` は **secure context（HTTPS / localhost）でしか使えない**。
非 secure context では例外を投げて「コピーに失敗しました」と表示されてしまう。

Sprint 5（初期実装）で `src/utils/clipboard.ts` に `copyTextToClipboard` を追加し、以下の段階的 fallback を実装済み。

1. `navigator.clipboard.writeText`（secure context のみ）
2. 非表示 `<textarea>` + `document.execCommand("copy")`
3. `navigator.share` でテキスト共有
4. すべて失敗 → `false` を返す

本スプリントではこの fallback の **挙動を環境マトリクスで検証**し、
**Sprint 5 で完成した 🎬 動画エクスポート機能の Web Share / DL fallback** と組み合わせた最終 UX を仕上げる。

### 目的

- 非 HTTPS LAN 開発環境 / HTTPS 本番 / iOS Safari / Android Chrome / Desktop Chrome の各環境で
  「🎬 動画エクスポート」「📋 コピー」が **常に何らかの形で成功する**（最低でもテキストコピーには落ちる）ことを保証する
- 失敗時のユーザー向けメッセージが状況を正しく伝える
- 特に **動画 Web Share の fallback パス**（DL / テキストコピーのみ）を全環境で検証する

### スコープ

#### 含む
- `src/utils/clipboard.ts` の `copyTextToClipboard` 挙動の環境マトリクス検証
- `src/utils/shareVideo.ts`（Sprint 5 で新設）の Web Share / DL fallback ロジックの最終確認
- 動画 MIME 採用結果（`video/mp4` or `video/webm`）が実機でどう振る舞うかの確認（特に iOS Safari）
- `App.tsx` の トーストメッセージの文言調整（失敗時の原因示唆）
- LAN 開発時の動作確認手順を `docs/sprints/sprint-7.md`（本ファイル）に明記
- 必要であれば fallback の優先順位の微調整（実装変更が必要な場合のみ）

#### 含まない
- 新規共有手段の追加（QR コード / URL 短縮 等）
- 共有テキストフォーマットの変更（Sprint 5 で確定済み）
- iPhone UI レイアウト調整（Sprint 6 の範囲）

### 検証マトリクス

| 環境 | clipboard.writeText | execCommand fallback | navigator.share | canShare(video file) | 期待動作 |
|---|---|---|---|---|---|
| HTTPS 本番 (chord-palette.vercel.app) / iOS Safari 16.4+ | ○ | ○ | ○ | ○ | 📋 即コピー / 🎬 動画を Web Share で投稿 |
| HTTPS 本番 / Desktop Chrome | ○ | ○ | △ (環境依存) | △ | 📋 即コピー / 🎬 share or 動画 DL fallback |
| LAN http://192.168.x.x:5173 / iOS Safari | × | △ (iOS 制限あり) | ○ | ○ | 📋 share fallback でテキスト送信 / 🎬 share で動画送信 |
| LAN http://192.168.x.x:5173 / Android Chrome | × | ○ | ○ | △ | 📋 execCommand でコピー成功 / 🎬 share or 動画 DL fallback |
| LAN http://192.168.x.x:5173 / Desktop Chrome | × | ○ | × | × | 📋 execCommand でコピー成功 / 🎬 動画 DL fallback |
| localhost:5173 / Desktop Chrome | ○ | ○ | × | × | 📋 即コピー / 🎬 動画 DL fallback |
| 古い Android Chrome（MediaRecorder 制約あり） | × | ○ | ○ | × | 📋 execCommand でコピー / 🎬 動画生成スキップ → テキストのみコピー |

### スプリント契約（完了条件）

#### `copyTextToClipboard` の挙動
- [ ] `window.isSecureContext === true` のとき、まず `navigator.clipboard.writeText` を試す
- [ ] 失敗または非 secure context のとき、`<textarea>` + `document.execCommand("copy")` を試す
- [ ] それも失敗のとき、`navigator.share({ text })` を試す
- [ ] `navigator.share` の AbortError は「成功扱い」（ユーザーがキャンセルしただけ）として true を返す
- [ ] すべて失敗のとき `false` を返し、呼び出し元が「コピーに失敗しました」を表示できる

#### 環境マトリクス検証
- [ ] HTTPS 本番 + iOS Safari 実機で 📋 が即コピーする
- [ ] LAN（非 HTTPS）+ iOS Safari 実機で 📋 が `navigator.share` 経由でテキストを送出する
- [ ] LAN + Android Chrome 実機（or DevTools UA エミュ）で 📋 が `execCommand` でコピー成功する
- [ ] LAN + Desktop Chrome で 📋 が `execCommand` でコピー成功する
- [ ] LAN + iOS Safari で 🎬 動画エクスポートが動作する（Web Share API は HTTPS でなくても LAN で動くケースが多いが、動作不可なら DL fallback に落ちることを確認）
- [ ] HTTPS 本番 + iOS Safari 実機で 🎬 動画が Instagram / TikTok ストーリーに投稿できる（目視確認）
- [ ] LAN + Desktop Chrome で 🎬 押下 → 動画ファイルが DL される + テキストがクリップボードに入る

#### 🎬 動画エクスポートの fallback ロジック（Sprint 5 で実装済みの再確認）
- [ ] `navigator.share` 対応 + `canShare({ files: [videoFile] })` true で 動画 + テキストが 1 回の share で送信される
- [ ] `canShare({ files })` false で 動画 DL + テキストのみ share
- [ ] `navigator.share` 完全非対応で 動画 DL + テキストがクリップボードへ
- [ ] MediaRecorder 非対応 / 録画失敗で「テキストコピーのみ」にフォールバックし、専用トーストが出る
- [ ] 上記すべてのパスで `AbortError` は失敗トーストを出さない

#### 動画 MIME / Codec の実機検証
- [ ] iOS Safari 16.4+ で `video/mp4` が採用される（拡張子 `.mp4`、生成された動画が「写真」アプリで再生できる）
- [ ] Android Chrome / Desktop Chrome で `video/webm` が採用される（拡張子 `.webm`、生成された動画が VLC 等で再生できる）
- [ ] 採用された MIME に応じて出力ファイル名の拡張子が正しく変わる

#### トースト文言
- [ ] 「動画を作成中… 画面はそのままにしてください」（録画開始時）
- [ ] 「共有シートを開きました」（Web Share 成功時）
- [ ] 「動画を保存しました（テキストをコピーしました）」（DL fallback 成功時）
- [ ] 「動画は作れませんでした。テキストだけコピーしました」（MediaRecorder 非対応時）
- [ ] 「コピーに失敗しました」（`copyTextToClipboard` が false を返した時）
- [ ] 「共有に失敗しました」あるいは具体的なエラーメッセージ（例外発生時、AbortError 以外）
- [ ] LAN 環境で `clipboard.writeText` が失敗してもユーザーに「失敗」と誤表示しない（fallback が成功すれば「コピーしました」になる）

#### ドキュメント
- [ ] LAN 開発時の確認手順（`vite --host` の起動方法、iPhone から `http://<PC IP>:5173` でアクセス）を README または本ファイル末尾に追記する
- [ ] 環境マトリクスの実測結果を本ファイル末尾に追記する

#### リグレッション
- [ ] Sprint 5 / Sprint 6 で確定した挙動を破壊しない
- [ ] `npm run build` が成功する

### LAN 開発時の確認手順（参考）

```bash
# PC 側
npm run dev -- --host

# 出力されるネットワーク URL（例: http://192.168.1.42:5173）に
# 同一 LAN の iPhone Safari からアクセスして検証する
```

iOS Safari は LAN の http でも `navigator.share` が使えるケースが多いが、
端末・iOS バージョンにより異なるため必ず実機で確認する。

非 secure context（LAN）で起動した場合、開発者コンソールに以下の warning が出る（v2.4 / Sprint 7 で追加）。

```
[Chord Palette] 非 secure context で動作中です (例: http://192.168.x.x:5173)。
navigator.clipboard.writeText は無効化されており、execCommand / navigator.share に fallback します。
本番では HTTPS でのアクセスを推奨します。
```

これはあくまで開発者向けの示唆。ユーザー向け UI には出ない。

### Sprint 7 実装の最終形（コード変更点）

#### `src/utils/clipboard.ts`
- 段階的 fallback を 3 関数 (`tryAsyncClipboard` / `tryExecCommand` / `tryNavigatorShare`) に分離
- 非 secure context 判定は `window.isSecureContext` を直接見る
- iOS Safari 向け：textarea を画面外ではなく viewport 左上 1px に置き、`contentEditable = "true"` + `Range`/`Selection` で確実に選択
- iOS のオートズーム抑止のため `font-size: 16px` を指定
- `<textarea>` の DOM 残留を try/finally で防止
- フォーカスを元の要素に戻す（入力中だった場合の UX 回復）
- `navigator.share` の AbortError（ユーザーキャンセル）は「成功扱い」で true
- `warnIfInsecureContext()` を追加し `main.tsx` から呼び出す

#### `src/utils/shareVideo.ts`
- 戻り値の型を 4 値に拡張：`"shared"` / `"shared-text-only"` / `"downloaded-copied"` / `"downloaded-only"`
- 2 段目（テキストだけ share + 動画 DL）の中で share が失敗したら最終 fallback（クリップボード）を試す
- 動画 DL を share 試行の前に走らせるよう順序を調整（share シート操作中も DL を確実に完了させる）
- 最終 fallback の `copyTextToClipboard` の戻り値で `downloaded-copied` / `downloaded-only` を区別

#### `src/App.tsx#handleExportVideo`
- `ShareVideoMode` 4 値ごとにトースト文言を切り替え
- `shareVideoFile` 内の AbortError 以外の例外は「共有に失敗しました: <理由>」として表示
- MediaRecorder 非対応時のトーストを契約文面に合わせ「動画は作れませんでした。テキストだけコピーしました」 / 「コピーに失敗しました」に変更

### 環境マトリクス（実装後 — コード経路の予測）

| 環境 | 1段目 writeText | 2段目 execCommand | 3段目 share | 期待される最終ステータス |
|---|---|---|---|---|
| HTTPS 本番 + iOS Safari 16.4+ | ○ | (到達せず) | (到達せず) | 📋 即コピー / 🎬 `shared`（動画+テキスト） |
| HTTPS 本番 + Desktop Chrome | ○ | (到達せず) | (到達せず) | 📋 即コピー / 🎬 share or `downloaded-copied` |
| http://localhost:5173 + Desktop Chrome | ○ (localhost は secure 扱い) | (到達せず) | (到達せず) | 📋 即コピー / 🎬 `downloaded-copied` |
| http://192.168.x.x:5173 + iOS Safari | × (skip) | △ (端末差あり) | ○ | 📋 share fallback / 🎬 `shared` or `shared-text-only` |
| http://192.168.x.x:5173 + Android Chrome | × (skip) | ○ | ○ (Android は share あり) | 📋 execCommand コピー / 🎬 `shared-text-only` |
| http://192.168.x.x:5173 + Desktop Chrome | × (skip) | ○ | × | 📋 execCommand コピー / 🎬 `downloaded-copied` |
| MediaRecorder 非対応端末 | (動画非対応分岐) | — | — | 🎬 → 「動画は作れませんでした。テキストだけコピーしました」 |

### 実測結果欄（ユーザー手動検証用）

検証時に以下に追記する。本ファイルは Generator 段階では空欄のまま提出。

| 日付 | 環境 | 📋 結果 | 🎬 結果 | メモ |
|---|---|---|---|---|
| YYYY-MM-DD | 本番 / iOS 17 / Safari | — | — | — |
| YYYY-MM-DD | LAN / iOS 17 / Safari | — | — | — |
| YYYY-MM-DD | LAN / Android 14 / Chrome | — | — | — |
| YYYY-MM-DD | LAN / Desktop Chrome | — | — | — |

### Generator → Designer/Evaluator への引き継ぎ

- **コードレビュー観点で受け入れ基準を満たしている**：fallback ロジックは網羅、トーストは契約文面、ドキュメントは追記済み
- **実機検証は必須**：本契約の「環境マトリクス検証」セクションは実機での確認が前提のため、Evaluator は Playwright での自動検証は限定的（Desktop Chrome での execCommand 経路は検証可能、iOS Safari の Web Share は手動）
- **壊してはいけない箇所**：🎬 onClick 順序 / `disabled={isExportingVideo}` / `.palette-pill.locked` / videoExporter cleanup 4 点セット / MIME 5 段順 / ビットレート / Header 1 行レイアウト / Key セレクタ width / safe-area-inset — すべて未変更
