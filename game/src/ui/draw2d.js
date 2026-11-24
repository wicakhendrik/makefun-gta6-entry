// Shared Canvas 2D helpers for the HUD: fonts, outlined text, bars, panels, stars, key caps and weapon icons.

import { roundRect } from './minimap.js';

export const FONT = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';
export const DISPLAY = '"Arial Black", "Segoe UI Black", Impact, sans-serif';

export function rgb(c) { return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`; }

export function outlined(ctx, text, x, y, font, color, width = 4) {
  ctx.font = font;
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = 'rgba(5,6,14,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(8,10,20,0.7)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}

/** Dark rounded HUD card with a thin rim and an optional coloured accent strip on the left. */
export function panel(ctx, x, y, w, h, accent, alpha = 0.74) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = `rgba(8,10,22,${alpha})`; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.stroke();
  if (accent) { ctx.fillStyle = accent; ctx.fillRect(x, y + 10, 4, h - 20); }
  ctx.restore();
}

/** A keyboard key cap such as [Z]. */
export function keyCap(ctx, label, x, y, color = '#ffd24a') {
  ctx.save();
  ctx.font = `bold 12px ${FONT}`;
  const w = Math.max(18, ctx.measureText(label).width + 8);
  roundRect(ctx, x, y - 13, w, 17, 4);
  ctx.fillStyle = color; ctx.fill();
  ctx.fillStyle = '#10121c'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, x + w / 2, y);
  ctx.restore();
  return w;
}

export function drawStar(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
}

export function wrapText(ctx, text, x, y, maxW, lh, maxLines = 9) {
  const words = text.split(' ');
  let line = '', n = 0;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      if (++n >= maxLines) { ctx.fillText(line + '…', x, y); return y; }
      ctx.fillText(line, x, y); line = w; y += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
  return y;
}

/** Vector weapon silhouettes, centred on (x, y), about 40 px wide at scale 1. */
export function drawWeaponIcon(ctx, w, x, y, scale = 1, color = '#e8e8f0') {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
  if (w === 'fist') {
    roundRect(ctx, -9, -8, 18, 15, 5); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = 0; k < 3; k++) ctx.fillRect(-5 + k * 5, -8, 1.2, 6);
  } else if (w === 'bat') {
    ctx.rotate(-0.6);
    ctx.beginPath(); ctx.moveTo(-18, -1.5); ctx.lineTo(8, -3.5); ctx.quadraticCurveTo(18, -4, 18, 0); ctx.quadraticCurveTo(18, 4, 8, 3.5); ctx.lineTo(-18, 1.5); ctx.fill();
    ctx.fillRect(-20, -2.5, 3, 5);
  } else if (w === 'launcher') {
    ctx.fillRect(-20, -5, 38, 8);
    ctx.fillRect(18, -7, 4, 12);
    ctx.fillRect(-6, 3, 5, 8); ctx.fillRect(4, 3, 4, 6);
    ctx.fillRect(-4, -9, 8, 4);
  } else {
    const len = { pistol: 18, smg: 26, shotgun: 34, rifle: 36 }[w] || 20;
    ctx.translate(-len / 2, 0);
    ctx.fillRect(-2, -6, len, 6);
    ctx.fillRect(-2, -1, 6, 10);
    if (w === 'smg' || w === 'rifle') ctx.fillRect(10, 0, 4, 9);
    if (w === 'rifle' || w === 'shotgun') ctx.fillRect(-10, -5, 9, 8);
  }
  ctx.restore();
}

/** Small padlock glyph for locked slots. */
export function drawLock(ctx, x, y, color = 'rgba(255,255,255,0.55)') {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y - 3, 4, Math.PI, 0); ctx.stroke();
  ctx.fillRect(x - 6, y - 3, 12, 9);
  ctx.restore();
}
