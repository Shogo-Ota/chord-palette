## Sprint 6: 実機 iPhone UI 回収（safe-area / Header / 375px レイアウト）

### 背景

v2.3 までで PC ブラウザのレスポンシブ対応は完了しているが、実機 iPhone（Safari）での確認で
以下の破綻が報告されている。

- **Key セレクタが見切れる**: 右端で `<select>` の値が切れて読めない
- **ヘッダーが 2 行に折り返す**: ブランド + Key + アクション群が縦に積み上がってヘッダーが厚くなる
- **safe-area-inset 対応漏れ**: ノッチ / ホームインジケータの下に UI が潜り込む箇所がある
- **その他 375px ビューでのレイアウト崩れ全般**

Sprint 5（🎬 動画エクスポート）の途中で Header に Key セレクタを `header-row-top` に内包する暫定変更が
入っているが、実機での挙動は未確認で、まだ破綻が残る可能性が高い。
また Sprint 5 で 📤 共有ボタンが **🎬 動画ボタンに置き換わっている**ため、共有ボタン回りの実機 UI 確認も
本スプリントで動画ボタン基準に置き換えて行う。

### 目的

iPhone 13 mini（375×812）/ iPhone SE2（375×667）/ iPhone 15 Pro Max（430×932）の **実機 Safari** で、
ヘッダーから画面下部まですべての UI が **1 画面内に破綻なく収まる**状態にする。
ノッチ・ホームインジケータと UI が重ならないことを保証する。

### スコープ

#### 含む
- `index.html`: `viewport-fit=cover` の確認・維持
- `src/index.css`: `env(safe-area-inset-*)` の左右 / 上下適用の総点検
- `src/components/Header.tsx` および `.header` 系 CSS: 375px で 1 行に収まるレイアウト
- Key セレクタ（`<select>`）の幅・パディング・ドロップ矢印位置の最終調整
- `.workspace`, `.workspace-center`, `.playback-bar`, `.bottom-sheet` の safe-area 確認
- ボトムシートと画面下端（ホームインジケータ）の重なり解消

#### 含まない
- 機能追加（Sprint 5 / 7 の範囲）
- デザイントークンの大幅変更
- iPad / デスクトップでの追加調整（既存挙動を維持できれば OK）

### 実装する機能

- Header を **必ず 1 行**で収める CSS 設計（ブランド + Key + アクションを横並び）
- Key セレクタの「見切れ」を起こさない最小幅と矢印スペースの保証
- 上下左右 safe-area-inset の取り込み徹底
- 375px / 360px / 320px のブレークポイントを確定
- ボトムシートが開いた状態でホームインジケータと干渉しない padding-bottom

### スプリント契約（完了条件）

#### Header（375px / 実機 iPhone Safari）
- [ ] iPhone 13 mini（375px）で `.header` の高さが 1 行に収まる（2 行折り返しが起きない）
- [ ] Key セレクタの選択中の値（`C` 〜 `B`）が末尾まで省略なく表示される
- [ ] Key セレクタのドロップ矢印（`▼`）が文字と重ならない
- [ ] ブランド（♪ アイコン + タイトル）と Key と アクション群（戻る/保存/クリア）が **同じ横軸**に並ぶ
- [ ] タイトルが長すぎる場合は ellipsis（`…`）で省略される（360px 以下では非表示でも可）
- [ ] アクションボタンが最小タップ領域 40×40px を維持する

#### safe-area-inset
- [ ] `index.html` の viewport meta に `viewport-fit=cover` が含まれる
- [ ] `body` または `.workspace` に `env(safe-area-inset-left)` / `right` が適用される
- [ ] `.header` 内側 padding に `env(safe-area-inset-left)` / `right` が適用される
- [ ] ボトムシートの最下部（または `.workspace` 下端）に `env(safe-area-inset-bottom)` が適用される
- [ ] ノッチ付き iPhone を横向きにしてもコンテンツがノッチに隠れない

#### 375px レイアウト全般
- [ ] 横スクロールバーが出ない（`overflow-x: hidden` が body / html 両方に効いている）
- [ ] パレットのピル型コードが 375px で最低 2 列入る
- [ ] 再生バー（playback-bar）の要素が 375px で 1 行（または既定の 2 行化ルール）に収まる
- [ ] ボトムシートを開いた状態で、シート最下部がホームインジケータと重ならない
- [ ] 画面回転（縦 → 横 → 縦）後もレイアウトが復元する

#### 320px（iPhone SE 第 1 世代相当）
- [ ] 320px 幅でも横スクロールが発生しない
- [ ] Header の Key セレクタは表示され続ける（タイトルは非表示で可）

#### リグレッション
- [ ] 既存の PC 表示（1200px 超）で Header / playback-bar / ボトムシートが従来通り表示される
- [ ] Sprint 5 の 🎬 動画ボタンが iPhone Safari で押下可能・タップ領域 40×40px 以上
- [ ] 🎬 動画ボタンの ⏺ パルス状態（録画中）が iPhone Safari でも視認できる
- [ ] 動画書き出し中に再生ボタンが disabled になっていることが iPhone Safari で確認できる
- [ ] `npm run build` が成功する

### 検証手順（Evaluator 向けメモ）

- Chrome DevTools の Device Mode（iPhone SE / 13 mini / 15 Pro Max）でまず確認
- 可能なら実機 iPhone Safari でも目視確認（safe-area は DevTools のみでは正確に再現できない）
- スクリーンショットを `docs/design-references/sprint-6-*.png` に保存して比較する
