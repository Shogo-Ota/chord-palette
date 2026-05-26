# 心地よい音色設計（pleasantAcoustics）

Chord Palette v2.5+ で採用している、研究・実務に基づく音響方針のメモ。

## 理論的背景（要約）

| 要因 | 内容 | 実装 |
|------|------|------|
| ハーモニシティ | 整数比に近い倍音が協和・快に寄与 | Lush プリセットの自然倍音列（sine 1〜6次） |
| 適度なビート | ごく弱いデチューンによるゆっくりしたうねり | ±7セントのコーラス（ラフネス域を避ける） |
| ラフネス回避 | 20Hz超の干渉ビートは不快になりやすい | デチューン幅を抑える、Wurli トレモロを浅く |
| 温かみ | 低次倍音を厚く | ベース・上声部の LP、ソフトクリップ |
| 空間 | 短残響で楽器らしさ・満足感 | 共有アルゴリズムリバーブ（軽量） |

参考文献の例:

- Bowling, Purves 等 — 協和感はハーモニシティ・干渉・文化要因の複合（PMC7032667）
- Jacoby 等 — 音色により「心地よい」音程の好みが変わる（Science News / MPIEA）
- McDermott 等 — 倍音構造と協和感の関係（Nature Communications 2024）

## コード上のモジュール

- `src/utils/pleasantAcoustics.ts` — 定数、ソフトクリップ、リバーブバス
- `src/utils/instrumentPresets.ts` — プリセットごとの `chorusDepth` / `reverbSend` / `useSoftClip`
- `src/utils/audioEngine.ts` — マスターリバーブ・コンプ（リミッター）連携

## 推奨プリセット

**Rush**（デフォルト）— 上記を最も積極的に適用。コードスケッチ用途の「また聴きたい」体験向け。

## v2.6 で導入した周波数バランス（Sprint 11）

v2.6 では「人が聴いて気持ちよい周波数帯（200Hz〜4kHz）にエネルギーを集中させたクリアな音」
を目標に、共有マスターチェーンと 3 プリセットを再設計した。

### 共有マスターチェーンに追加した処理

| 処理 | パラメータ | 効果 |
|------|-----------|------|
| **80Hz HPF（cleanup highpass）** | biquad highpass / 80Hz / Q≈0.707（-12 dB/oct） | サブベース帯のモゴモゴ・ボワつきを除去。モバイルスピーカーでもクリアに聴こえる |
| **5kHz high-shelf** | biquad highshelf / 5000Hz / -4 dB | シャリつき・歯擦音的な刺さりを抑える |
| **リバーブ damp LP** | 4200Hz → **3800Hz** に下げる | リバーブテイルの高域刺さりを抑え、空間が耳に痛くないように |
| **ベース音ローカット** | `scheduleNoteVoice` 内で 80Hz HPF を二段目に挿入 | 低音弦のサブブーストを個別に切り、共有 HPF と合わせ −24 dB/oct 相当の処理になる |

### 新マスターチェーンのシグナルフロー

```
(各 voice scheduleNoteVoice の出力)
            │
            ├─ dry ───────────────┐
            │                     ▼
            │              ┌──────────────┐
            │              │  masterGain  │ ◀── (reverb wet)
            │              └──────┬───────┘
            │                     ▼
            │              ┌──────────────┐
            │              │ trebleShelf  │  highshelf 5kHz / -4 dB
            │              └──────┬───────┘
            │                     ▼
(drumGain)──┼────────────▶ ┌──────────────┐
            │              │ cleanupHPF   │  highpass 80Hz / Q 0.707
            │              └──────┬───────┘
            │                     ▼
            │              ┌──────────────┐
            │              │   limiter    │  threshold -14 dB / ratio 2.5
            │              └──────┬───────┘
            │                     ▼
            │              ┌──────────────┐
            │              │ destination  │
            │              └──────────────┘
            │
            └─ reverbSend ─▶ pleasantReverb.input ─▶ wet ─▶ (masterGain へ戻る)
```

ドラムは `masterGain` を介さず `cleanupHPF` 直前に合流するが、`cleanupHPF` → `limiter` の
2 段は必ず通る。動画書き出し（`attachCaptureDestination`）は `limiter` の後段から
`MediaStreamAudioDestinationNode` を分岐して取得しているため、新しい周波数バランスが
書き出しファイルにも反映される。

### 3 プリセットの差別化目標

| プリセット | キャラクター | filterCutoffTreble | attack / decay / release | chorusDepth | reverbSend |
|---|---|---|---|---|---|
| **Rush** | 明るく前に出るポップピアノ | **5800Hz** | 8 ms / 140 ms / 140 ms | **1.0** | 0.28 |
| **SenseElepix** | 上品で透明感のあるエレピ | 5000Hz | **15 ms** / 120 ms / 120 ms | 0.5 | **0.40**（最大） |
| **Upright** | 暗くウォームなアップライト | **3900Hz**（最低） | 10 ms / **200 ms** / **180 ms** | 0.4 | **0.18**（最少） |

最低 3 指標（filterCutoffTreble / decay / release / chorusDepth / reverbSend）で互いに値が
異なるよう INSTRUMENT_PRESETS のリテラル値で保証している。

### 聴感の差別化キー

- **Rush ↔ SenseElepix**: アタックの硬さ（8 ms vs 15 ms）が明確に違う
- **Rush ↔ Upright**: 高域の明るさ（5800Hz vs 3900Hz の LP カット）が明確に違う
- **SenseElepix ↔ Upright**: リバーブセンド（0.40 vs 0.18）で余韻の長さが明確に違う
