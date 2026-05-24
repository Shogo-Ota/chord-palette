## Sprint 2: 画面録画時の音声安定化

### 実装する機能
- AudioContext statechange / visibilitychange 対応
- activeOscillators 管理と stop 時全停止
- ドラム時刻クランプ・ゲイン調整・コンプレッサー緩和
- interrupted 時 toast 通知

### スプリント契約（完了条件）
- [ ] suspended 時に resume 無限ループしない（最大3回後停止）
- [ ] stopPaletteSequence で発音中オシレーターが全停止する
- [ ] visibilitychange で suspend 検知時に再生停止する
- [ ] resetAudioEngine が pagehide 等から呼ばれる
- [ ] getAudioContextState / onAudioInterrupted コールバックが App から利用可能
- [ ] npm run build が成功する
