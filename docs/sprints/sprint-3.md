## Sprint 3: バリエーションツールバー化

### 実装する機能
- ChordVariationToolbar 新規コンポーネント
- TheoryPane カードスリム化（triad/7th のみ）
- ALLOWED_TENSIONS / DiatonicChordType を musicTheory.ts へ移動

### スプリント契約（完了条件）
- [ ] 7 カードの高さが均一になる
- [ ] triad/7th の 1 タップ追加が従来通り動作する
- [ ] 度数選択 → ツールバーで 6/sus2/sus4/9/11/13/オルタが選択できる
- [ ] 度数ごとのテンション制限が disable 表示される
- [ ] 未選択時ツールバーが disabled + ヒント表示
- [ ] npm run build が成功する
