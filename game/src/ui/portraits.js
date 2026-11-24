// Procedural character portraits for dialogue, the mission tracker and the crew panel, drawn with canvas paths.

import { roundRect } from './minimap.js';

/** Look of every speaking character: skin, hair style and colour, clothes, extras and backdrop. */
export const FACES = {
  MARCO: { skin: '#c98d62', hair: 'short', hairC: '#1d1410', shirt: '#1fb5a8', bg: '#ffd24a', stubble: true, jacket: true, role: 'Getaway driver', color: '#ffd24a' },
  LOU: { skin: '#b8774f', hair: 'bun', hairC: '#d8ccd2', streak: '#ff6ac1', shirt: '#ff6ac1', bg: '#ff6ac1', glasses: true, earring: true, role: 'Chop-shop owner, Cinder Row', color: '#ff6ac1' },
  TEO: { skin: '#d9a27a', hair: 'slick', hairC: '#0e0c10', shirt: '#36d6ff', bg: '#36d6ff', mustache: true, chain: true, role: 'Fixer, Ocelot Lounge', color: '#4ae4ff' },
  'DET. MARR': { skin: '#f0c9a8', hair: 'bob', hairC: '#e8c46a', shirt: '#2a3560', bg: '#8c9cff', badge: true, role: 'Solara PD detective', color: '#8c9cff' },
  CRANE: { skin: '#f2d2b8', hair: 'swept', hairC: '#b8bcc4', shirt: '#16161c', bg: '#ff5a5a', tie: '#d81e2c', role: 'CEO, Crane Holdings', color: '#ff5a5a' },
  ROCCO: { skin: '#a8704a', hair: 'bald', hairC: '#2a1a10', shirt: '#e8e4da', bg: '#9fe3c8', beard: true, role: 'Owes Teo money', color: '#9fe3c8' },
  NYLA: { skin: '#7a4a30', hair: 'afro', hairC: '#1a0f0a', shirt: '#5f7d3a', bg: '#9fe3c8', earring: true, headset: true, role: 'Armorer, Bolt & Barrel', color: '#9fe3c8' },
  PASSENGER: { skin: '#e0b090', hair: 'short', hairC: '#6a3a1a', shirt: '#f6c445', bg: '#f6c445', role: 'Brisa Cab fare', color: '#f6c445' },
};

export function faceOf(who) { return FACES[who] || null; }

/**
 * Draw a portrait in the square (x, y, s). talk (0..1) opens the mouth, so speakers move their lips while typing.
 */
export function drawPortrait(ctx, who, x, y, s, talk = 0) {
  const f = FACES[who];
  ctx.save();
  roundRect(ctx, x, y, s, s, s * 0.14);
  ctx.clip();
  const bg = ctx.createRadialGradient(x + s * 0.5, y + s * 0.35, s * 0.1, x + s * 0.5, y + s * 0.5, s * 0.8);
  bg.addColorStop(0, f ? f.bg : '#5a6a8a'); bg.addColorStop(1, '#0b0d18');
  ctx.fillStyle = bg; ctx.fillRect(x, y, s, s);
  // sun stripes behind the head
  ctx.globalAlpha = 0.14; ctx.fillStyle = '#ffffff';
  for (let k = 0; k < 4; k++) ctx.fillRect(x, y + s * (0.18 + k * 0.1), s, s * 0.03);
  ctx.globalAlpha = 1;
  if (!f) { drawPhone(ctx, x + s / 2, y + s / 2, s); ctx.restore(); frame(ctx, x, y, s, '#5a6a8a'); return; }
  const cx = x + s * 0.5, hy = y + s * 0.47, hw = s * 0.21, hh = s * 0.26;
  // big hair sits behind the head
  ctx.fillStyle = f.hairC;
  if (f.hair === 'afro') { circle(ctx, cx, hy - s * 0.06, s * 0.33); ctx.fill(); }
  if (f.hair === 'bob') { roundRect(ctx, cx - hw * 1.25, hy - hh * 1.05, hw * 2.5, hh * 1.9, s * 0.1); ctx.fill(); }
  if (f.hair === 'bun') { circle(ctx, cx, hy - hh * 1.15, s * 0.1); ctx.fill(); }
  // shoulders
  ctx.fillStyle = f.shirt;
  ellipse(ctx, cx, y + s * 1.04, s * 0.46, s * 0.33); ctx.fill();
  if (f.jacket) {
    ctx.fillStyle = '#0d3b38';
    ctx.beginPath(); ctx.moveTo(cx - s * 0.1, y + s * 0.78); ctx.lineTo(cx, y + s); ctx.lineTo(cx + s * 0.1, y + s * 0.78); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f4f0e8'; ctx.beginPath(); ctx.moveTo(cx - s * 0.06, y + s * 0.78); ctx.lineTo(cx, y + s * 0.9); ctx.lineTo(cx + s * 0.06, y + s * 0.78); ctx.closePath(); ctx.fill();
  }
  if (f.tie) {
    ctx.fillStyle = '#f4f0e8'; ctx.beginPath(); ctx.moveTo(cx - s * 0.09, y + s * 0.77); ctx.lineTo(cx, y + s * 0.95); ctx.lineTo(cx + s * 0.09, y + s * 0.77); ctx.closePath(); ctx.fill();
    ctx.fillStyle = f.tie; ctx.beginPath(); ctx.moveTo(cx - s * 0.025, y + s * 0.79); ctx.lineTo(cx + s * 0.025, y + s * 0.79); ctx.lineTo(cx + s * 0.04, y + s * 0.98); ctx.lineTo(cx - s * 0.04, y + s * 0.98); ctx.closePath(); ctx.fill();
  }
  if (f.badge) { drawBadge(ctx, cx + s * 0.22, y + s * 0.88, s * 0.06); }
  if (f.chain) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = s * 0.02; ctx.beginPath(); ctx.arc(cx, y + s * 0.72, s * 0.12, 0.35, Math.PI - 0.35); ctx.stroke(); }
  // neck and head
  ctx.fillStyle = shade(f.skin, -0.18);
  ctx.fillRect(cx - s * 0.08, hy + hh * 0.6, s * 0.16, s * 0.16);
  ctx.fillStyle = f.skin;
  ellipse(ctx, cx, hy, hw, hh); ctx.fill();
  // ears
  ellipse(ctx, cx - hw * 0.98, hy + hh * 0.05, s * 0.035, s * 0.06); ctx.fill();
  ellipse(ctx, cx + hw * 0.98, hy + hh * 0.05, s * 0.035, s * 0.06); ctx.fill();
  if (f.earring) { ctx.fillStyle = '#ffd24a'; circle(ctx, cx - hw * 1.0, hy + hh * 0.32, s * 0.018); ctx.fill(); circle(ctx, cx + hw * 1.0, hy + hh * 0.32, s * 0.018); ctx.fill(); }
  // cheek shading
  ctx.fillStyle = shade(f.skin, -0.12); ctx.globalAlpha = 0.5;
  ellipse(ctx, cx + hw * 0.55, hy + hh * 0.25, hw * 0.35, hh * 0.45); ctx.fill();
  ctx.globalAlpha = 1;
  if (f.stubble || f.beard) {
    ctx.fillStyle = f.beard ? f.hairC : 'rgba(30,20,15,0.35)';
    ctx.beginPath(); ctx.ellipse(cx, hy + hh * 0.35, hw * 0.95, hh * 0.68, 0, 0.1, Math.PI - 0.1); ctx.fill();
  }
  // hair on top
  ctx.fillStyle = f.hairC;
  if (f.hair === 'short' || f.hair === 'slick' || f.hair === 'swept' || f.hair === 'bun' || f.hair === 'bob' || f.hair === 'afro') {
    ctx.beginPath(); ctx.ellipse(cx, hy - hh * 0.38, hw * 1.04, hh * 0.7, 0, Math.PI, Math.PI * 2); ctx.fill();
    if (f.hair === 'swept') { ctx.beginPath(); ctx.ellipse(cx - hw * 0.2, hy - hh * 0.7, hw * 0.9, hh * 0.35, -0.3, 0, Math.PI * 2); ctx.fill(); }
    if (f.hair === 'bob') { ctx.fillRect(cx - hw * 1.08, hy - hh * 0.45, hw * 0.3, hh * 1.05); ctx.fillRect(cx + hw * 0.78, hy - hh * 0.45, hw * 0.3, hh * 1.05); }
    if (f.hair === 'slick') { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = s * 0.015; ctx.beginPath(); ctx.arc(cx, hy - hh * 0.1, hw * 0.8, Math.PI * 1.15, Math.PI * 1.6); ctx.stroke(); }
  }
  if (f.streak) { ctx.fillStyle = f.streak; ctx.beginPath(); ctx.ellipse(cx + hw * 0.35, hy - hh * 0.62, hw * 0.25, hh * 0.3, 0.5, 0, Math.PI * 2); ctx.fill(); }
  if (f.hair === 'bald') { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ellipse(ctx, cx - hw * 0.3, hy - hh * 0.65, hw * 0.3, hh * 0.15); ctx.fill(); }
  if (f.headset) {
    ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.arc(cx, hy - hh * 0.1, hw * 1.12, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.fillStyle = '#2a2a30'; roundRect(ctx, cx - hw * 1.25, hy - hh * 0.1, s * 0.07, s * 0.12, s * 0.02); ctx.fill();
    ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = s * 0.015; ctx.beginPath(); ctx.moveTo(cx - hw * 1.15, hy + hh * 0.1); ctx.quadraticCurveTo(cx - hw * 0.9, hy + hh * 0.6, cx - hw * 0.35, hy + hh * 0.55); ctx.stroke();
  }
  // brows and eyes
  const ey = hy - hh * 0.02, ex = hw * 0.42;
  ctx.strokeStyle = shade(f.hairC === '#d8ccd2' ? '#8a8088' : f.hairC, 0); ctx.lineWidth = s * 0.022; ctx.lineCap = 'round';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sd * ex * 0.55, ey - hh * 0.2); ctx.lineTo(cx + sd * ex * 1.45, ey - hh * 0.24 + (who === 'CRANE' ? sd * -s * 0.0 + s * 0.012 : 0)); ctx.stroke(); }
  for (const sd of [-1, 1]) {
    ctx.fillStyle = '#ffffff'; ellipse(ctx, cx + sd * ex, ey, s * 0.04, s * 0.025); ctx.fill();
    ctx.fillStyle = '#1a1010'; circle(ctx, cx + sd * ex + s * 0.004, ey, s * 0.019); ctx.fill();
  }
  if (f.glasses) {
    ctx.strokeStyle = '#1c1c22'; ctx.lineWidth = s * 0.018;
    for (const sd of [-1, 1]) { roundRect(ctx, cx + sd * ex - s * 0.065, ey - s * 0.045, s * 0.13, s * 0.09, s * 0.03); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - s * 0.03, ey); ctx.lineTo(cx + s * 0.03, ey); ctx.stroke();
  }
  // nose
  ctx.strokeStyle = shade(f.skin, -0.3); ctx.lineWidth = s * 0.016;
  ctx.beginPath(); ctx.moveTo(cx + s * 0.005, ey + hh * 0.12); ctx.lineTo(cx + s * 0.025, ey + hh * 0.38); ctx.lineTo(cx - s * 0.01, ey + hh * 0.42); ctx.stroke();
  // mouth: opens with speech
  const my = hy + hh * 0.62, mw = hw * 0.48;
  if (f.mustache) { ctx.fillStyle = f.hairC; ctx.beginPath(); ctx.ellipse(cx, my - s * 0.025, mw * 1.1, s * 0.02, 0, 0, Math.PI * 2); ctx.fill(); }
  if (talk > 0.05) {
    ctx.fillStyle = '#3a0e12'; ellipse(ctx, cx, my, mw * 0.8, s * 0.012 + talk * s * 0.035); ctx.fill();
    ctx.fillStyle = '#f4f0e8'; ctx.fillRect(cx - mw * 0.5, my - s * 0.012 - talk * s * 0.02, mw, s * 0.012);
  } else {
    ctx.strokeStyle = '#5a1e22'; ctx.lineWidth = s * 0.02;
    ctx.beginPath(); ctx.moveTo(cx - mw, my); ctx.quadraticCurveTo(cx, my + (who === 'CRANE' || who === 'ROCCO' ? -s * 0.01 : s * 0.025), cx + mw, my); ctx.stroke();
  }
  ctx.restore();
  frame(ctx, x, y, s, f.color);
}

function frame(ctx, x, y, s, color) {
  ctx.save();
  roundRect(ctx, x, y, s, s, s * 0.14);
  ctx.lineWidth = 2.5; ctx.strokeStyle = color; ctx.stroke();
  ctx.restore();
}

function drawPhone(ctx, cx, cy, s) {
  ctx.fillStyle = '#e8ecf8';
  roundRect(ctx, cx - s * 0.16, cy - s * 0.28, s * 0.32, s * 0.56, s * 0.05); ctx.fill();
  ctx.fillStyle = '#1a2a4a';
  roundRect(ctx, cx - s * 0.12, cy - s * 0.22, s * 0.24, s * 0.38, s * 0.02); ctx.fill();
  ctx.fillStyle = '#4ae4ff'; ctx.font = `bold ${Math.round(s * 0.2)}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('!', cx, cy - s * 0.03);
}

function drawBadge(ctx, x, y, r) {
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  for (let k = 0; k < 12; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 6, rr = k % 2 ? r * 0.6 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}

function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function ellipse(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
