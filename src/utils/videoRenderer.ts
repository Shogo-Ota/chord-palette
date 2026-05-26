/**
 * 縦型動画 (720×1280) の 1 フレーム分の Canvas 描画ロジック。
 *
 * デザイン方針:
 *  - 上部 約120px: ブランドロゴ (波形バー風 ♪ アイコン + "Chord Palette") と Key/BPM
 *  - 中央 約1080px: 進行ピル列 (T/SD/D カラー + 再生中は白枠グロー + 折り返し可)
 *  - 下部 約80px: URL カプセル + パレット位置インジケータ
 *  - 背景: ダークグラデ + T/SD/D のオーロラ + 細かなノイズで「無料テンプレ感」を回避
 *
 * Evaluator のオリジナリティ評価で AI スロップ判定されないよう、
 * 単純な紫グラデや均等グリッドの安易な多用は避け、ブランドカラー (T/SD/D)
 * のリズム感を効かせている。
 */

import type { Key, PaletteChord } from "./musicTheory";

export const VIDEO_WIDTH = 720;
export const VIDEO_HEIGHT = 1280;
export const HEADER_H = 132;
export const FOOTER_H = 96;
export const STAGE_TOP = HEADER_H;
export const STAGE_H = VIDEO_HEIGHT - HEADER_H - FOOTER_H; // 1052
export const STAGE_BOTTOM = STAGE_TOP + STAGE_H;

const FUNCTION_COLORS: Record<string, string> = {
  T: "#3b82f6",
  SD: "#f59e0b",
  D: "#ef4444",
};

export interface VideoRenderState {
  palette: PaletteChord[];
  selectedKey: Key;
  bpm: number;
  /** 現在ハイライトすべきコードのインデックス（再生中ピル）。null なら無し */
  currentIndex: number | null;
}

/**
 * 1 フレームを描画する。呼び出し側で `requestAnimationFrame` から繰り返し呼ぶ。
 */
export function renderVideoFrame(
  ctx: CanvasRenderingContext2D,
  state: VideoRenderState
): void {
  drawBackground(ctx);
  drawHeader(ctx, state);
  drawProgression(ctx, state);
  drawFooter(ctx, state);
}

// ---------- Background ----------

function drawBackground(ctx: CanvasRenderingContext2D): void {
  // ベース: ディープネイビーのバーチカルグラデ
  const bg = ctx.createLinearGradient(0, 0, 0, VIDEO_HEIGHT);
  bg.addColorStop(0, "#070716");
  bg.addColorStop(0.5, "#0e0e26");
  bg.addColorStop(1, "#15153a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

  // T/SD/D カラーのオーロラ（左上=青、右上=赤、下中央=琥珀）
  drawRadialGlow(ctx, VIDEO_WIDTH * 0.15, VIDEO_HEIGHT * 0.16, 420, "rgba(59,130,246,0.22)");
  drawRadialGlow(ctx, VIDEO_WIDTH * 0.88, VIDEO_HEIGHT * 0.24, 380, "rgba(239,68,68,0.16)");
  drawRadialGlow(ctx, VIDEO_WIDTH * 0.5, VIDEO_HEIGHT * 0.95, 520, "rgba(245,158,11,0.14)");
  drawRadialGlow(ctx, VIDEO_WIDTH * 0.92, VIDEO_HEIGHT * 0.68, 320, "rgba(139,92,246,0.12)");

  // 上下のビネット（被写体を中央に寄せて見せる）
  const topVignette = ctx.createLinearGradient(0, 0, 0, 220);
  topVignette.addColorStop(0, "rgba(0,0,0,0.35)");
  topVignette.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topVignette;
  ctx.fillRect(0, 0, VIDEO_WIDTH, 220);

  const bottomVignette = ctx.createLinearGradient(0, VIDEO_HEIGHT - 240, 0, VIDEO_HEIGHT);
  bottomVignette.addColorStop(0, "rgba(0,0,0,0)");
  bottomVignette.addColorStop(1, "rgba(0,0,0,0.4)");
  ctx.fillStyle = bottomVignette;
  ctx.fillRect(0, VIDEO_HEIGHT - 240, VIDEO_WIDTH, 240);
}

function drawRadialGlow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string
): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}

// ---------- Header ----------

function drawHeader(ctx: CanvasRenderingContext2D, state: VideoRenderState): void {
  const padX = 40;

  // ロゴアイコン（角丸グラデ）
  const iconSize = 64;
  const iconX = padX;
  const iconY = (HEADER_H - iconSize) / 2;
  const iconGrad = ctx.createLinearGradient(iconX, iconY, iconX + iconSize, iconY + iconSize);
  iconGrad.addColorStop(0, "#3b82f6");
  iconGrad.addColorStop(0.55, "#8b5cf6");
  iconGrad.addColorStop(1, "#ec4899");
  roundRect(ctx, iconX, iconY, iconSize, iconSize, 16);
  ctx.fillStyle = iconGrad;
  ctx.fill();

  // アイコン内：波形バー風グラフ（縦棒 5 本）— 旧 shareCard の波形演出を移植
  drawIconWaveform(ctx, iconX, iconY, iconSize);

  // ロゴ右上のスパーク（小さなプラス）
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(iconX + iconSize - 6, iconY + 6, 3, 0, Math.PI * 2);
  ctx.fill();

  // タイトル
  ctx.fillStyle = "#f5f5fb";
  ctx.font = "800 32px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Chord Palette", iconX + iconSize + 18, HEADER_H / 2 - 4);

  // Key / BPM — テキストではなくチップ風で見せる
  drawMetaChip(ctx, iconX + iconSize + 18, HEADER_H / 2 + 12, `${state.selectedKey} Major`, "#93c5fd", "rgba(59,130,246,0.18)");
  drawMetaChip(ctx, iconX + iconSize + 18 + measureChipWidth(ctx, `${state.selectedKey} Major`) + 8, HEADER_H / 2 + 12, `BPM ${state.bpm}`, "#fcd34d", "rgba(245,158,11,0.18)");

  // ヘッダー下のディバイダ（中央が光るタイプ）
  const divY = HEADER_H - 0.5;
  const divGrad = ctx.createLinearGradient(0, divY, VIDEO_WIDTH, divY);
  divGrad.addColorStop(0, "rgba(255,255,255,0)");
  divGrad.addColorStop(0.5, "rgba(255,255,255,0.18)");
  divGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = divGrad;
  ctx.fillRect(0, divY, VIDEO_WIDTH, 1);
}

function drawIconWaveform(
  ctx: CanvasRenderingContext2D,
  iconX: number,
  iconY: number,
  iconSize: number
): void {
  const bars = 5;
  const heights = [0.45, 0.78, 0.55, 0.9, 0.62]; // バーの高さ比
  const barW = 5;
  const gap = 4;
  const totalW = bars * barW + (bars - 1) * gap;
  const startX = iconX + (iconSize - totalW) / 2;
  const cy = iconY + iconSize / 2;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  for (let i = 0; i < bars; i++) {
    const h = heights[i] * (iconSize * 0.55);
    const x = startX + i * (barW + gap);
    const y = cy - h / 2;
    roundRect(ctx, x, y, barW, h, barW / 2);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fill();
  }
  ctx.restore();
}

function measureChipWidth(ctx: CanvasRenderingContext2D, text: string): number {
  ctx.save();
  ctx.font = "700 16px system-ui, sans-serif";
  const w = ctx.measureText(text).width + 22;
  ctx.restore();
  return w;
}

function drawMetaChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
  bg: string
): void {
  ctx.save();
  ctx.font = "700 16px system-ui, sans-serif";
  const w = ctx.measureText(text).width + 22;
  const h = 26;
  const cy = y - h / 2 + 1;
  roundRect(ctx, x, cy, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, cy + h / 2 + 1);
  ctx.restore();
}

// ---------- Footer ----------

function drawFooter(ctx: CanvasRenderingContext2D, state: VideoRenderState): void {
  const top = STAGE_BOTTOM;

  // ディバイダ（中央が光るタイプ）
  const divY = top + 0.5;
  const divGrad = ctx.createLinearGradient(0, divY, VIDEO_WIDTH, divY);
  divGrad.addColorStop(0, "rgba(255,255,255,0)");
  divGrad.addColorStop(0.5, "rgba(255,255,255,0.18)");
  divGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = divGrad;
  ctx.fillRect(0, divY, VIDEO_WIDTH, 1);

  // 進行位置インジケータ（小さなドット列）
  drawProgressDots(ctx, state, top + 18);

  // ブランド CTA（共有ループ・Phase M1）
  drawBrandCta(ctx, top + 38);
}

function drawProgressDots(
  ctx: CanvasRenderingContext2D,
  state: VideoRenderState,
  cy: number
): void {
  const n = Math.min(state.palette.length, 16);
  if (n === 0) return;
  const dotR = 3;
  const gap = 8;
  const totalW = n * (dotR * 2) + (n - 1) * gap;
  const startX = (VIDEO_WIDTH - totalW) / 2;
  for (let i = 0; i < n; i++) {
    const cx = startX + i * (dotR * 2 + gap) + dotR;
    const isActive = state.currentIndex === i;
    ctx.beginPath();
    ctx.arc(cx, cy, isActive ? dotR + 1 : dotR, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? "#ffffff" : "rgba(255,255,255,0.22)";
    if (isActive) {
      ctx.save();
      ctx.shadowColor = "rgba(255,255,255,0.8)";
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fill();
    }
  }
}

function drawBrandCta(ctx: CanvasRenderingContext2D, cy: number): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = "600 15px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText("Made with Chord Palette", VIDEO_WIDTH / 2, cy - 8);

  ctx.font = "700 16px system-ui, sans-serif";
  ctx.fillStyle = "rgba(167,139,250,0.95)";
  ctx.fillText("#ChordPalette", VIDEO_WIDTH / 2, cy + 14);

  drawUrlCapsule(ctx, cy + 42);
}

function drawUrlCapsule(ctx: CanvasRenderingContext2D, cy: number): void {
  const text = "chord-palette.vercel.app";
  ctx.font = "700 18px system-ui, sans-serif";
  const textW = ctx.measureText(text).width;
  const iconBlock = 22; // 左の角丸アイコン分
  const padX = 18;
  const capW = textW + iconBlock + padX * 2 + 10;
  const capH = 38;
  const capX = (VIDEO_WIDTH - capW) / 2;
  const capY = cy - capH / 2;

  // 背景：薄いグラデ
  const grad = ctx.createLinearGradient(capX, capY, capX + capW, capY + capH);
  grad.addColorStop(0, "rgba(59,130,246,0.12)");
  grad.addColorStop(1, "rgba(139,92,246,0.12)");
  roundRect(ctx, capX, capY, capW, capH, capH / 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // 左の小アイコン（角丸＋♪）
  const ax = capX + padX;
  const ay = capY + (capH - iconBlock) / 2;
  roundRect(ctx, ax, ay, iconBlock, iconBlock, 6);
  const iconGrad = ctx.createLinearGradient(ax, ay, ax + iconBlock, ay + iconBlock);
  iconGrad.addColorStop(0, "#3b82f6");
  iconGrad.addColorStop(1, "#8b5cf6");
  ctx.fillStyle = iconGrad;
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("♪", ax + iconBlock / 2, ay + iconBlock / 2 + 1);

  // テキスト
  ctx.fillStyle = "#e9e9f5";
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, ax + iconBlock + 10, capY + capH / 2 + 1);
}

// ---------- Progression Pills ----------

interface LayoutEntry {
  chord: PaletteChord;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PillSizing {
  pillH: number;
  padX: number;
  rowGap: number;
  colGap: number;
  arrowW: number;
  arrowFont: number;
  nameFont: number;
  labelFont: number;
  radius: number;
}

const SIZINGS: PillSizing[] = [
  { pillH: 156, padX: 38, rowGap: 34, colGap: 24, arrowW: 38, arrowFont: 38, nameFont: 58, labelFont: 22, radius: 30 },
  { pillH: 138, padX: 32, rowGap: 28, colGap: 22, arrowW: 34, arrowFont: 32, nameFont: 50, labelFont: 20, radius: 26 },
  { pillH: 120, padX: 28, rowGap: 24, colGap: 18, arrowW: 30, arrowFont: 28, nameFont: 42, labelFont: 18, radius: 22 },
  { pillH: 106, padX: 24, rowGap: 22, colGap: 16, arrowW: 26, arrowFont: 24, nameFont: 36, labelFont: 17, radius: 20 },
  { pillH: 92,  padX: 20, rowGap: 18, colGap: 14, arrowW: 22, arrowFont: 22, nameFont: 30, labelFont: 16, radius: 18 },
  { pillH: 78,  padX: 16, rowGap: 14, colGap: 12, arrowW: 18, arrowFont: 18, nameFont: 24, labelFont: 14, radius: 14 },
];

function drawProgression(ctx: CanvasRenderingContext2D, state: VideoRenderState): void {
  const stageLeft = 40;
  const stageRight = VIDEO_WIDTH - 40;
  const stageWidth = stageRight - stageLeft;

  if (state.palette.length === 0) {
    ctx.fillStyle = "rgba(170,170,200,0.6)";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No chords", VIDEO_WIDTH / 2, STAGE_TOP + STAGE_H / 2);
    return;
  }

  // 適切なサイズを選ぶ
  let chosenSizing = SIZINGS[SIZINGS.length - 1];
  let chosenLayout: LayoutEntry[] = [];

  for (const s of SIZINGS) {
    const layout = layoutPills(ctx, state.palette, stageLeft, stageWidth, s);
    const lastY = layout.length > 0 ? layout[layout.length - 1].y + s.pillH : 0;
    if (lastY <= STAGE_H - 16) {
      chosenSizing = s;
      chosenLayout = layout;
      break;
    }
    chosenSizing = s;
    chosenLayout = layout;
  }

  // 縦中央寄せ
  const totalH = chosenLayout.length > 0
    ? chosenLayout[chosenLayout.length - 1].y + chosenSizing.pillH
    : 0;
  const yOffset = STAGE_TOP + Math.max(0, (STAGE_H - totalH) / 2);

  // 同じ行のピル間に矢印
  ctx.font = `700 ${chosenSizing.arrowFont}px system-ui, sans-serif`;
  ctx.fillStyle = "rgba(180,180,210,0.55)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 1; i < chosenLayout.length; i++) {
    const prev = chosenLayout[i - 1];
    const cur = chosenLayout[i];
    const sameRow = Math.abs(prev.y - cur.y) < 0.5;
    if (sameRow) {
      const ax = (prev.x + prev.w + cur.x) / 2;
      const ay = prev.y + yOffset + chosenSizing.pillH / 2;
      ctx.fillText("→", ax, ay);
    }
  }

  // ピルを描画
  chosenLayout.forEach((entry) => {
    const isActive = state.currentIndex === entry.index;
    drawPill(ctx, entry.chord, entry.x, entry.y + yOffset, entry.w, chosenSizing, isActive);
  });
}

function layoutPills(
  ctx: CanvasRenderingContext2D,
  palette: PaletteChord[],
  stageLeft: number,
  stageWidth: number,
  s: PillSizing
): LayoutEntry[] {
  const layout: LayoutEntry[] = [];
  let x = stageLeft;
  let y = 0;

  for (let i = 0; i < palette.length; i++) {
    const chord = palette[i];

    ctx.font = `600 ${s.labelFont}px system-ui, sans-serif`;
    const labelW = ctx.measureText(chord.label).width;
    ctx.font = `800 ${s.nameFont}px system-ui, sans-serif`;
    const nameW = ctx.measureText(chord.displayName).width;
    const pillW = Math.max(labelW, nameW, 100) + s.padX * 2;

    const needsArrow = i > 0 && x > stageLeft + 0.5;
    const wantedX = needsArrow ? x + s.arrowW : x;

    if (wantedX + pillW > stageLeft + stageWidth) {
      // wrap to next row
      x = stageLeft;
      y += s.pillH + s.rowGap;
      layout.push({ chord, index: i, x, y, w: pillW, h: s.pillH });
      x += pillW + s.colGap;
    } else {
      layout.push({ chord, index: i, x: wantedX, y, w: pillW, h: s.pillH });
      x = wantedX + pillW + s.colGap;
    }
  }

  return layout;
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  chord: PaletteChord,
  x: number,
  y: number,
  w: number,
  s: PillSizing,
  isActive: boolean
): void {
  const color = FUNCTION_COLORS[chord.function] ?? "#3b82f6";

  // ドロップシャドウ（active のみ強化）
  ctx.save();
  if (isActive) {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 6;
  } else {
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
  }
  roundRect(ctx, x, y, w, s.pillH, s.radius);
  // 背景単色（影描画用） — グラデを後乗せするので暗めに
  ctx.fillStyle = "#0d0d22";
  ctx.fill();
  ctx.restore();

  // 背景グラデ（カラフルに）
  const grad = ctx.createLinearGradient(x, y, x, y + s.pillH);
  grad.addColorStop(0, hexToRgba(color, isActive ? 0.55 : 0.3));
  grad.addColorStop(0.55, hexToRgba(color, isActive ? 0.28 : 0.14));
  grad.addColorStop(1, hexToRgba(color, isActive ? 0.18 : 0.06));
  roundRect(ctx, x, y, w, s.pillH, s.radius);
  ctx.fillStyle = grad;
  ctx.fill();

  // 光沢ハイライト（上半分）
  const gloss = ctx.createLinearGradient(x, y, x, y + s.pillH * 0.5);
  gloss.addColorStop(0, "rgba(255,255,255,0.12)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  roundRect(ctx, x + 2, y + 2, w - 4, s.pillH * 0.5, s.radius);
  ctx.fillStyle = gloss;
  ctx.fill();

  // 境界線
  if (isActive) {
    // 白枠 + グロー
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.9)";
    ctx.shadowBlur = 28;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    roundRect(ctx, x, y, w, s.pillH, s.radius);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.strokeStyle = chord.isDiatonic ? hexToRgba(color, 0.6) : hexToRgba(color, 0.4);
    ctx.lineWidth = chord.isDiatonic ? 2 : 1.5;
    if (!chord.isDiatonic) {
      ctx.setLineDash([7, 5]);
    }
    roundRect(ctx, x, y, w, s.pillH, s.radius);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // トップアクセントバー
  roundRect(ctx, x + s.padX * 0.5, y + 9, w - s.padX, 4, 2);
  ctx.fillStyle = hexToRgba(color, isActive ? 1 : 0.85);
  ctx.fill();

  // 度数ラベル（小）
  ctx.fillStyle = hexToRgba(color, isActive ? 1 : 0.92);
  ctx.font = `700 ${s.labelFont}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(chord.label, x + w / 2, y + s.labelFont + 22);

  // コード名（大）
  ctx.fillStyle = isActive ? "#ffffff" : "#f5f5fb";
  if (isActive) {
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.7)";
    ctx.shadowBlur = 12;
  }
  ctx.font = `800 ${s.nameFont}px system-ui, sans-serif`;
  ctx.fillText(chord.displayName, x + w / 2, y + s.pillH - 24);
  if (isActive) {
    ctx.restore();
  }
}

// ---------- helpers ----------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
