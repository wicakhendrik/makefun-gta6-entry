// Minimap and full map: a pre-rendered stylised city image, rotated with the camera, with blips for everything.

import { LAND, PIER, BEACH_X0, SHORE_X, CITY_MAX, ROAD, BLOCKS, roadCoord, POI, DISTRICTS } from '../world/city.js';

const MAP_PAD = 40;
const X0 = LAND.x0 - MAP_PAD, Z0 = LAND.z0 - MAP_PAD, X1 = PIER.x1 + MAP_PAD, Z1 = LAND.z1 + 120;
const DISTRICT_TINT = {
  meridian: '#39415a', midtown: '#3a3d48', strand: '#4a3a52', brisas: '#2f4a3a', cinder: '#46393a',
  mercado: '#4a4236', docks: '#33404a', park: '#2f6a3a',
};

export class Minimap {
  constructor(city) {
    this.city = city;
    this.image = this.renderMap();
  }

  /** Draw the whole island once into an offscreen canvas at 1 px per metre. */
  renderMap() {
    const c = document.createElement('canvas');
    c.width = Math.ceil(X1 - X0); c.height = Math.ceil(Z1 - Z0);
    const g = c.getContext('2d');
    const tx = (x) => x - X0, tz = (z) => z - Z0;
    g.fillStyle = '#0d3a4e'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#2a2d35'; g.fillRect(tx(LAND.x0), tz(LAND.z0), BEACH_X0 - LAND.x0, LAND.z1 - LAND.z0);
    g.fillStyle = '#b8a46a'; g.fillRect(tx(BEACH_X0), tz(LAND.z0), SHORE_X - BEACH_X0, LAND.z1 - LAND.z0);
    g.fillStyle = '#7a6a50'; g.fillRect(tx(PIER.x0), tz(PIER.z0), PIER.x1 - PIER.x0, PIER.z1 - PIER.z0);
    for (const lot of this.city.lots) {
      g.fillStyle = DISTRICT_TINT[lot.d] || '#3a3d48';
      g.fillRect(tx(lot.x0), tz(lot.z0), lot.x1 - lot.x0, lot.z1 - lot.z0);
    }
    g.fillStyle = 'rgba(255,255,255,0.10)';
    for (const b of this.city.buildings) g.fillRect(tx(b.x0), tz(b.z0), b.x1 - b.x0, b.z1 - b.z0);
    for (const h of this.city.houses) g.fillRect(tx(h.x0), tz(h.z0), h.x1 - h.x0, h.z1 - h.z0);
    g.fillStyle = '#5d6472';
    for (let i = 0; i <= BLOCKS; i++) {
      const r = roadCoord(i);
      g.fillRect(tx(-ROAD / 2), tz(r - ROAD / 2), CITY_MAX + ROAD, ROAD);
      g.fillRect(tx(r - ROAD / 2), tz(-ROAD / 2), ROAD, CITY_MAX + ROAD);
    }
    g.fillStyle = '#44484f';
    g.fillRect(tx(LAND.x0), tz(CITY_MAX + ROAD / 2), BEACH_X0 - LAND.x0, LAND.z1 - CITY_MAX - ROAD / 2);
    g.fillStyle = '#1f3550'; g.fillRect(tx(160), tz(1012), 310, 38);
    return c;
  }

  /** Rotating minimap in a rounded square at (x, y). */
  draw(ctx, game, x, y, size, blips) {
    const p = game.player;
    const v = p.vehicle;
    const scale = v ? 0.75 - Math.min(v.speed, 50) * 0.006 : 0.95;
    const rot = game.camera.yaw + Math.PI;
    ctx.save();
    roundRect(ctx, x, y, size, size, 14);
    ctx.fillStyle = '#0d3a4e'; ctx.fill();
    ctx.clip();
    const cx = x + size / 2, cy = y + size / 2;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.drawImage(this.image, X0 - p.x, Z0 - p.z);
    ctx.restore();
    ctx.save();
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const toScreen = (wx, wz) => {
      const dx = (wx - p.x) * scale, dz = (wz - p.z) * scale;
      return [cx + dx * cos - dz * sin, cy + dx * sin + dz * cos];
    };
    const half = size / 2 - 9;
    for (const b of blips) {
      let [sx, sy] = toScreen(b.x, b.z);
      const ox = sx - cx, oy = sy - cy;
      const outside = Math.abs(ox) > half || Math.abs(oy) > half;
      if (outside) {
        if (!b.edge) continue;
        const k = half / Math.max(Math.abs(ox), Math.abs(oy));
        sx = cx + ox * k; sy = cy + oy * k;
      }
      drawBlip(ctx, sx, sy, b, outside);
    }
    // player arrow
    const pa = (v ? v.heading : p.heading) - game.camera.yaw;
    ctx.translate(cx, cy);
    ctx.rotate(-pa);
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6.5, 7); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#111'; ctx.stroke();
    ctx.restore();
    // frame and north tick
    ctx.save();
    roundRect(ctx, x, y, size, size, 14);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,12,20,0.85)'; ctx.stroke();
    roundRect(ctx, x + 2, y + 2, size - 4, size - 4, 12);
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.stroke();
    // world north (-z) projected onto the frame
    const nX = cx + sin * (half + 1), nY = cy - cos * (half + 1);
    ctx.fillStyle = '#ff5f6d'; ctx.beginPath(); ctx.arc(nX, nY, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', nX, nY + 0.5);
    ctx.restore();
  }

  /** Full-screen map for the pause menu. */
  drawFull(ctx, game, x, y, w, h, blips) {
    const s = Math.min(w / this.image.width, h / this.image.height);
    const ox = x + (w - this.image.width * s) / 2, oy = y + (h - this.image.height * s) / 2;
    ctx.drawImage(this.image, ox, oy, this.image.width * s, this.image.height * s);
    ctx.font = 'bold 13px "Trebuchet MS", Arial';
    ctx.textAlign = 'center';
    const labels = { meridian: [6, 4.6], midtown: [8.5, 8], strand: [10.5, 3], brisas: [2, 2.6], cinder: [6.5, 1], mercado: [1.6, 8], docks: [5, 10.8], park: [6, 7.5] };
    for (const [k, [bx, bz]] of Object.entries(labels)) {
      const px = ox + (bx * 80 - X0) * s, pz = oy + (bz * 80 - Z0) * s;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(DISTRICTS[k].name.toUpperCase(), px + 1, pz + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(DISTRICTS[k].name.toUpperCase(), px, pz);
    }
    const toScreen = (wx, wz) => [ox + (wx - X0) * s, oy + (wz - Z0) * s];
    for (const b of blips) { const [sx, sy] = toScreen(b.x, b.z); drawBlip(ctx, sx, sy, b, false); }
    const p = game.player;
    const [px, py] = toScreen(p.x, p.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(-(p.vehicle ? p.vehicle.heading : p.heading) + Math.PI);
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke(); ctx.restore();
    return { ox, oy, s };
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Blip shapes: dot, square, letter badge, star. */
function drawBlip(ctx, x, y, b, edge) {
  const r = b.size || 5;
  ctx.save();
  if (b.letter) {
    ctx.beginPath(); ctx.arc(x, y, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = b.color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#101018'; ctx.stroke();
    ctx.fillStyle = '#101018'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.letter, x, y + 0.5);
  } else if (b.shape === 'square') {
    ctx.fillStyle = b.color; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#101018'; ctx.strokeRect(x - r, y - r, r * 2, r * 2);
  } else if (b.shape === 'diamond') {
    ctx.beginPath(); ctx.moveTo(x, y - r - 2); ctx.lineTo(x + r + 2, y); ctx.lineTo(x, y + r + 2); ctx.lineTo(x - r - 2, y); ctx.closePath();
    ctx.fillStyle = b.color; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#101018'; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = b.color; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#101018'; ctx.stroke();
  }
  if (edge && b.pulse) { ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.strokeStyle = b.color; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
}

export { POI };
