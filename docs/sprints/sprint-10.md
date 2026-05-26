## Sprint 10: 転回形セレクタ（Inversion Selector）

### 目的

各コードに **Root / 1st / 2nd / 3rd** の転回を明示的に指定できるようにし、
コード進行のベース動線・上声部の表情を細やかにコントロール可能にする。
既存の統一ボイシング（Sprint 8）と整合させ、転回指定時はユーザー指定を優先、
未指定（Root のまま）の場合は従来の voice-leading をそのまま使う。

> **実装順序**: 本スプリントは **Sprint 11（音色高品質化）の完了後** に着手する。
> 音色側のノイズが落ち着いた状態で転回差を聴き分けることで、評価が安定する。

### スコープ

#### 含む

- [`src/utils/musicTheory.ts`](../../src/utils/musicTheory.ts)
  - `PaletteChord` に `inversion: 0 | 1 | 2 | 3` を追加（既存値: `0` がデフォルト）
  - コード生成ヘルパー（ダイアトニック / ノンダイアトニック / オンコード）で
    `inversion: 0` を明示的に付与
  - `getMaxInversion(chord)` を新設し、トライアド=2 / テトラッド=3 を返す
- [`src/utils/voicing.ts`](../../src/utils/voicing.ts)
  - `voiceChord` / `voiceChordForPlayback` が `chord.inversion` を解釈
  - `inversion > 0` の場合:
    - ベース PC は **転回後の最低音のピッチクラス**（インターバル昇順で `intervals[inversion]`）に置換
    - 上声部 voice-leading は **無効化**（ユーザー指定優先）し、転回ベースから昇順クローズに配置
  - `inversion === 0` のとき従来挙動を **完全に維持**（リグレッションなし）
  - `chord.bassNoteOverride` が指定されているコード（オンコード）は転回 UI を非表示扱いとし、
    `inversion` は強制的に 0 として扱う（仕様の競合を避ける）
- [`src/components/ChordSelectorSheet.tsx`](../../src/components/ChordSelectorSheet.tsx)
  または編集中ピル長押し UI
  - 編集中（`editingIndex` がセットされている）コードに対して **Inversion トグル** 4 ボタン
    `Root / 1st / 2nd / 3rd` を表示
  - トライアドのとき `3rd` ボタンは disabled（タップ不可、視覚的にも淡色）
  - オンコードのときはトグル群全体を非表示（or disabled + 「On-chord active」ヒント）
  - 現在の選択にはアクティブハイライト（既存のタブ風 UI と統一）
- [`src/App.tsx`](../../src/App.tsx)
  - 転回トグルのイベントハンドラ `handleInversionChange(index, inversion)`
  - パレット差し替え時に `inversion` を引き継ぐ（既存挙動の維持）
  - 単音プレビュー（タップ時）でも転回が反映される
- [`src/utils/storage.ts`](../../src/utils/storage.ts)
  - `PersistedState` の palette に `inversion` を含めて保存・復元
  - サニタイズで `inversion` が未定義/不正なら `0` に補正
  - 旧データ（`inversion` 未保持）は自動的に Root として読み込まれる
- [`src/utils/videoExporter.ts`](../../src/utils/videoExporter.ts) / `videoRenderer.ts`
  - 動画書き出しの再生でも転回が反映される（`voiceChordForPlayback` 経由で自動）
  - フレーム描画側でコード表示テキストに転回を含めるかは**含めない**（ピル UI は従来通り）

#### 含まない

- 譜面表示・ベース音名のテキスト表示
- 開離（Open / Drop2）ボイシングの導入（v2.7 以降）
- 短調・モーダルコードに対する転回（既存スコープのまま、特別扱いしない）

### データ型

```ts
// PaletteChord 拡張
interface PaletteChord {
  // ...既存フィールド
  inversion: 0 | 1 | 2 | 3; // 既定 0
}
```

- `0` = Root position（最低音 = ルート）
- `1` = 1st inversion（最低音 = 3rd）
- `2` = 2nd inversion（最低音 = 5th）
- `3` = 3rd inversion（最低音 = 7th）。トライアドでは指定不可

### スプリント契約（完了条件）

以下の全条件を満たした場合のみ、このスプリントは完了とする。

- [ ] `PaletteChord` に `inversion: 0 | 1 | 2 | 3` が追加され、既存のコード生成ヘルパー全てが `0` を付与する
- [ ] `getMaxInversion(chord)` がトライアド時 `2`、テトラッド（4 音以上）時 `3` を返す
- [ ] `voiceChord(chord, prev)` は `inversion === 0` のとき従来と**完全に同一の MIDI 配列**を返す（既存テスト/再生に副作用なし）
- [ ] `voiceChord(chord, prev)` は `inversion > 0` のとき最低音のピッチクラスが `intervals[inversion]` に対応する
- [ ] `inversion > 0` のときは voice-leading 状態（`lastVoicing`）の影響を受けず、転回指定が常に最低音 PC を決める
- [ ] `bassNoteOverride` が指定されているコード（オンコード）では `inversion` の値に関わらず Root と同じ発音になる
- [ ] ChordSelectorSheet（または同等 UI）で編集中のコードに Root / 1st / 2nd / 3rd の 4 ボタンが表示される
- [ ] トライアドのとき `3rd` ボタンが disabled（タップしても状態が変わらない）
- [ ] オンコード編集中はトグル群が非表示 or disabled で、ユーザーに競合が示唆される
- [ ] トグルをタップすると、編集中コードの再生プレビュー（タップ音）に即座に反映される
- [ ] localStorage 永続化: 転回を指定したパレットをリロードしても全コードの `inversion` が復元される
- [ ] 旧 localStorage（`inversion` フィールドなし）からの起動で全コードが `inversion = 0` として読み込まれる
- [ ] 動画書き出しで、転回指定の再生が映像内オーディオに反映される（コード表示テキストは従来通り）
- [ ] 375px 幅で ChordSelectorSheet が破綻しない（トグル 4 つが 1 行に収まる、または整然と折り返す）
- [ ] `npm run build` が通る
- [ ] `npm run lint` が通る

### 受け入れ条件（Evaluator / Sound Critic）

- [ ] C メジャーで `C - C/E - F - G` を作って `C` を `2nd inv (G ベース)` に切り替えると、ベース音が G に変わって聴こえる
- [ ] `Dm7` を `3rd inv` にすると最低音が C（7th）に変わり、`G7` への移行が滑らかになる
- [ ] トライアド `F` で 3rd ボタンが押せない（disabled）
- [ ] オンコード `C/E` 編集時に Inversion トグルが操作できないことが UI で示される
- [ ] リロード後も転回が保持されている
- [ ] iOS Safari 実機: タップで転回切替→そのまま再生で正しい音が鳴る

### 手動確認シナリオ

1. **基本動作**: `C → F → G → C` を作成。2 番目の `F` を 1st inv に切り替え。最低音が A に変わって聴こえること
2. **テトラッド**: `Cmaj7 → Dm7 → G7 → Cmaj7` を作成。各コードを 1st / 2nd / 3rd inv に切り替えて聴感差を確認
3. **トライアド制限**: `C` 編集時に `3rd` ボタンが disabled
4. **オンコード共存**: `C/E` 編集時にトグルが操作できないことを確認
5. **永続化**: 転回指定したパレットを保存→リロード→転回が復元
6. **動画**: 転回指定済みパレットを動画書き出し→出力ファイルの音に転回が反映
7. **モバイル**: iPhone Safari 実機で 375px 幅レイアウト確認

### 依存・前提

- **前提スプリント**: Sprint 11（音色高品質化）が完了し、Rush / SenseElepix / Upright が安定して鳴ること
- 既存の `voicing.ts` のレジスター制約（BASS 48–57 / UPPER 60–79）は維持する。
  転回によりベース PC が変わるため、稀に MAX_UPPER_SPAN を超える可能性 → `compressUpperSpan` で吸収
