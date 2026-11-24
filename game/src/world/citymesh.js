// Turns the city description into merged static geometry: ground, roads, buildings, foliage, beach, docks, pier.

import { MeshBuilder, MAT } from '../engine/mesh.js';
import { hexColor, makeRng } from '../engine/math.js';
import { BLOCKS, PITCH, ROAD, CITY_MAX, BEACH_X0, SHORE_X, LAND, PIER, roadCoord } from './city.js';

const C = (hex) => hexColor(hex);
const shade = (col, k) => [col[0] * k, col[1] * k, col[2] * k];

const GROUND_BY_DISTRICT = {
  meridian: '#c9c3b8', midtown: '#aaa59c', strand: '#e9dcc2', brisas: '#6ea04a', cinder: '#7d7771',
  mercado: '#cbb28c', docks: '#8b8881', park: '#5f9e45',
};

export function buildCityMeshes(city) {
  const m = new MeshBuilder();
  const rng = makeRng(99);
  buildGround(m);
  buildRoads(m);
  for (const lot of city.lots) buildLot(m, lot);
  for (const b of city.buildings) buildBuilding(m, b, rng);
  for (const h of city.houses) buildHouse(m, h);
  for (const p of city.pools) buildPool(m, p);
  for (const h of city.hedges) buildHedge(m, h);
  for (const n of city.neon) buildNeon(m, n);
  for (const a of city.awnings) buildAwning(m, a);
  for (const b of city.billboards) buildBillboard(m, b);
  for (const p of city.palms) buildPalm(m, p.x, p.z, p.h, p.lean, rng);
  for (const t of city.trees) buildTree(m, t);
  for (const l of city.lamps) buildLamp(m, l);
  for (const u of city.umbrellas) buildUmbrella(m, u);
  for (const l of city.loungers) { m.at(l.x, 0, l.z, l.yaw); m.cbox(0, 0.05, 0, 0.8, 0.35, 2.0, C('#f4f4f0')); m.at(0, 0, 0); }
  for (const h of city.huts) buildLifeguardHut(m, h);
  for (const c of city.containers) buildContainer(m, c);
  for (const c of city.cranes) buildCrane(m, c);
  for (const f of city.fountains) buildFountain(m, f);
  for (const b of city.benches) { m.cbox(b.x, 0.16, b.z, 2.2, 0.5, 0.7, C('#7a5a3a')); }
  buildEdgeGreenery(m, rng);
  buildFreighter(m);
  buildPier(m);
  const ferris = buildFerrisWheel();
  return { city: m.build(), ferris, ferrisCenter: [PIER.x1 - 30, 26, (PIER.z0 + PIER.z1) / 2] };
}

function buildGround(m) {
  // island slab with seawall faces, sand beach, ocean
  m.box(LAND.x0, -3, LAND.z0, BEACH_X0, 0, LAND.z1, C('#a8a296'), MAT.MATTE, { top: C('#9c978d'), noBottom: true });
  m.box(BEACH_X0, -3, LAND.z0, SHORE_X - 20, 0.04, LAND.z1, C('#e8d6a8'), MAT.SAND, { noBottom: true });
  m.quadN([SHORE_X - 20, 0.04, LAND.z0], [SHORE_X - 20, 0.04, LAND.z1], [SHORE_X + 14, -1.6, LAND.z1], [SHORE_X + 14, -1.6, LAND.z0], C('#dcc796'), MAT.SAND);
  m.plane(-1800, -1800, 3000, 3000, -0.7, C('#1a6a7a'), MAT.WATER);
  // quay apron south of the last road
  m.plane(LAND.x0, CITY_MAX + ROAD / 2, BEACH_X0, LAND.z1, 0.01, C('#8e8b84'), MAT.ASPHALT);
  // yellow quay edge
  m.box(LAND.x0, 0, LAND.z1 - 0.6, BEACH_X0, 0.25, LAND.z1, C('#e0b030'));
}

function buildRoads(m) {
  const asphalt = C('#3b3e45');
  const yellow = C('#f2c230'), white = C('#ecece6');
  const span0 = -ROAD / 2, span1 = CITY_MAX + ROAD / 2;
  for (let i = 0; i <= BLOCKS; i++) {
    const c = roadCoord(i);
    m.plane(span0, c - ROAD / 2, span1, c + ROAD / 2, 0.02, asphalt, MAT.ASPHALT);
    m.plane(c - ROAD / 2, span0, c + ROAD / 2, span1, 0.021, asphalt, MAT.ASPHALT);
  }
  for (let i = 0; i <= BLOCKS; i++) {
    const c = roadCoord(i);
    for (let k = 0; k < BLOCKS; k++) {
      const a = k * PITCH + ROAD / 2 + 2, b = (k + 1) * PITCH - ROAD / 2 - 2;
      // double yellow centre line
      m.plane(a, c - 0.3, b, c - 0.12, 0.04, yellow);
      m.plane(a, c + 0.12, b, c + 0.3, 0.04, yellow);
      m.plane(c - 0.3, a, c - 0.12, b, 0.04, yellow);
      m.plane(c + 0.12, a, c + 0.3, b, 0.04, yellow);
      // dashed lane edges
      for (let t = a + 2; t < b - 3; t += 7) {
        m.plane(t, c - 5.0, t + 3, c - 4.8, 0.04, white);
        m.plane(t, c + 4.8, t + 3, c + 5.0, 0.04, white);
        m.plane(c - 5.0, t, c - 4.8, t + 3, 0.04, white);
        m.plane(c + 4.8, t, c + 5.0, t + 3, 0.04, white);
      }
    }
  }
  // zebra crossings on every intersection approach
  for (let i = 0; i <= BLOCKS; i++) {
    for (let j = 0; j <= BLOCKS; j++) {
      const x = roadCoord(i), z = roadCoord(j);
      for (let s = -ROAD / 2 + 1; s < ROAD / 2 - 1; s += 1.6) {
        m.plane(x + s, z - ROAD / 2 - 3.2, x + s + 0.8, z - ROAD / 2 - 0.4, 0.045, white);
        m.plane(x + s, z + ROAD / 2 + 0.4, x + s + 0.8, z + ROAD / 2 + 3.2, 0.045, white);
        m.plane(x - ROAD / 2 - 3.2, z + s, x - ROAD / 2 - 0.4, z + s + 0.8, 0.045, white);
        m.plane(x + ROAD / 2 + 0.4, z + s, x + ROAD / 2 + 3.2, z + s + 0.8, 0.045, white);
      }
    }
  }
  // the beach promenade sidewalk
  m.box(CITY_MAX + ROAD / 2, 0, -ROAD / 2, BEACH_X0, 0.15, CITY_MAX + ROAD / 2, C('#d9cfc0'));
}

function buildLot(m, lot) {
  const { x0, z0, x1, z1, d } = lot;
  m.box(x0, 0, z0, x1, 0.15, z1, C('#bdb8ae'), MAT.MATTE, { noBottom: true, top: C('#c4beb3') });
  const g = C(GROUND_BY_DISTRICT[d] || '#aaa59c');
  const mat = d === 'brisas' || d === 'park' ? MAT.FOLIAGE : MAT.MATTE;
  m.plane(x0 + 4, z0 + 4, x1 - 4, z1 - 4, 0.16, g, mat);
  if (d === 'park') {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    m.plane(cx - 1.6, z0 + 4, cx + 1.6, z1 - 4, 0.17, C('#d8c8a0'));
    m.plane(x0 + 4, cz - 1.6, x1 - 4, cz + 1.6, 0.17, C('#d8c8a0'));
  }
}

function buildBuilding(m, b, rng) {
  const col = C(b.color);
  const mat = b.mat === 'tower' ? MAT.TOWER : b.mat === 'ribbon' ? MAT.RIBBON : MAT.FACADE;
  const roof = shade(col, 0.62);
  const opts = { top: roof, topMat: MAT.MATTE, noBottom: true };
  if (b.setback) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const h1 = b.h * 0.42, h2 = b.h * 0.78;
    m.box(b.x0, 0, b.z0, b.x1, h1, b.z1, col, mat, opts);
    m.box(b.x0 + w * 0.1, h1, b.z0 + d * 0.1, b.x1 - w * 0.1, h2, b.z1 - d * 0.1, col, mat, opts);
    m.box(b.x0 + w * 0.22, h2, b.z0 + d * 0.22, b.x1 - w * 0.22, b.h, b.z1 - d * 0.22, col, mat, opts);
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    m.cylinder(cx, b.h, cz, 0.3, 0.1, b.h * 0.18, 5, C('#c0c4c8'));
    m.cbox(cx, b.h + b.h * 0.18, cz, 0.6, 0.6, 0.6, C('#ff3030'), MAT.EMISSIVE);
    if (b.landmark === 'crane') {
      // glowing crown rings on the Crane Tower
      for (let k = 0; k < 3; k++) {
        const y = b.h - 2 - k * 6, ix = w * 0.22 - 0.3, iz = d * 0.22 - 0.3;
        m.box(b.x0 + ix, y, b.z0 + iz, b.x1 - ix, y + 0.6, b.z1 - iz, C('#ffd36a'), MAT.NEON, { noBottom: true });
      }
    }
  } else {
    m.box(b.x0, 0, b.z0, b.x1, b.h, b.z1, col, mat, opts);
    // parapet and roof clutter
    m.box(b.x0, b.h, b.z0, b.x1, b.h + 0.8, b.z0 + 0.4, roof);
    m.box(b.x0, b.h, b.z1 - 0.4, b.x1, b.h + 0.8, b.z1, roof);
    const n = Math.floor(rng.range(1, 4));
    for (let k = 0; k < n; k++) {
      const ax = rng.range(b.x0 + 2, b.x1 - 4), az = rng.range(b.z0 + 2, b.z1 - 4);
      m.box(ax, b.h, az, ax + 2.2, b.h + 1.4, az + 1.6, C('#9aa0a6'));
    }
    if (b.warehouse) {
      // corrugated look: roll-up doors along the long face
      for (let x = b.x0 + 4; x < b.x1 - 6; x += 9) m.box(x, 0, b.z1, x + 5, 5, b.z1 + 0.15, C('#d8d2c4'));
    }
    if (b.special === 'garage') {
      m.box(b.x0 + 6, 0, b.z1, b.x1 - 6, 6, b.z1 + 0.1, C('#22252a'));
    }
    if (b.special === 'precinct') {
      m.box(b.x0 + 4, 3.5, b.z1, b.x1 - 4, 4.4, b.z1 + 0.2, C('#2f5fd0'), MAT.NEON);
    }
    if (b.special === 'hospital') {
      const cx = (b.x0 + b.x1) / 2;
      m.box(cx - 3, b.h - 7, b.z1, cx + 3, b.h - 5, b.z1 + 0.25, C('#ff3040'), MAT.NEON);
      m.box(cx - 1, b.h - 9, b.z1, cx + 1, b.h - 3, b.z1 + 0.25, C('#ff3040'), MAT.NEON);
    }
  }
}

function buildHouse(m, h) {
  m.box(h.x0, 0.16, h.z0, h.x1, h.h, h.z1, C(h.color), MAT.FACADE, { noBottom: true, top: C(h.roof), topMat: MAT.MATTE });
  hipRoof(m, h.x0 - 0.6, h.z0 - 0.6, h.x1 + 0.6, h.z1 + 0.6, h.h, 2.4, C(h.roof));
  // door
  const cx = (h.x0 + h.x1) / 2;
  m.box(cx - 0.7, 0.16, h.z1, cx + 0.7, 2.3, h.z1 + 0.08, C('#5a3a2a'));
}

function hipRoof(m, x0, z0, x1, z1, y, rise, col) {
  const w = x1 - x0, d = z1 - z0;
  if (w >= d) {
    const hw = d / 2, cz = (z0 + z1) / 2;
    m.quadN([x0, y, z1], [x1, y, z1], [x1 - hw, y + rise, cz], [x0 + hw, y + rise, cz], col);
    m.quadN([x1, y, z0], [x0, y, z0], [x0 + hw, y + rise, cz], [x1 - hw, y + rise, cz], col);
    m.quadN([x0, y, z0], [x0, y, z1], [x0 + hw, y + rise, cz], [x0 + hw, y + rise, cz], col);
    m.quadN([x1, y, z1], [x1, y, z0], [x1 - hw, y + rise, cz], [x1 - hw, y + rise, cz], col);
  } else {
    const hd = w / 2, cx = (x0 + x1) / 2;
    m.quadN([x1, y, z1], [x1, y, z0], [cx, y + rise, z0 + hd], [cx, y + rise, z1 - hd], col);
    m.quadN([x0, y, z0], [x0, y, z1], [cx, y + rise, z1 - hd], [cx, y + rise, z0 + hd], col);
    m.quadN([x0, y, z1], [x1, y, z1], [cx, y + rise, z1 - hd], [cx, y + rise, z1 - hd], col);
    m.quadN([x1, y, z0], [x0, y, z0], [cx, y + rise, z0 + hd], [cx, y + rise, z0 + hd], col);
  }
}

function buildPool(m, p) {
  m.box(p.x0 - 0.6, 0.16, p.z0 - 0.6, p.x1 + 0.6, 0.3, p.z1 + 0.6, C('#f2f0ea'));
  m.plane(p.x0, p.z0, p.x1, p.z1, 0.31, C('#39c6d8'), MAT.WATER);
}

function buildHedge(m, h) {
  const g = C('#3f7a34'), t = 0.8, y = 0.16, hh = 1.3;
  const mx = (h.x0 + h.x1) / 2, mz = (h.z0 + h.z1) / 2;
  const segs = [
    [h.x0 + 4, h.z0 + 4, mx - 4, h.z0 + 4 + t], [mx + 4, h.z0 + 4, h.x1 - 4, h.z0 + 4 + t],
    [h.x0 + 4, h.z1 - 4 - t, mx - 4, h.z1 - 4], [mx + 4, h.z1 - 4 - t, h.x1 - 4, h.z1 - 4],
    [h.x0 + 4, h.z0 + 4, h.x0 + 4 + t, mz - 4], [h.x0 + 4, mz + 4, h.x0 + 4 + t, h.z1 - 4],
    [h.x1 - 4 - t, h.z0 + 4, h.x1 - 4, mz - 4], [h.x1 - 4 - t, mz + 4, h.x1 - 4, h.z1 - 4],
  ];
  for (const s of segs) m.box(s[0], y, s[1], s[2], y + hh, s[3], g, MAT.FOLIAGE);
}

function buildNeon(m, n) {
  const b = n.b, c1 = C(n.color), c2 = C(n.color2);
  const y = b.h - 0.8;
  m.box(b.x0 - 0.12, y, b.z1, b.x1 + 0.12, y + 0.35, b.z1 + 0.14, c1, MAT.NEON, { noBottom: true });
  m.box(b.x0 - 0.12, y, b.z0 - 0.14, b.x1 + 0.12, y + 0.35, b.z0, c1, MAT.NEON, { noBottom: true });
  m.box(b.x1, y, b.z0, b.x1 + 0.14, y + 0.35, b.z1, c1, MAT.NEON, { noBottom: true });
  m.box(b.x0 - 0.14, y, b.z0, b.x0, y + 0.35, b.z1, c1, MAT.NEON, { noBottom: true });
  // a vertical blade sign by the entrance
  const sx = b.x0 + 2.5;
  m.box(sx - 0.25, 4, b.z1, sx + 0.25, Math.min(b.h - 2, 13), b.z1 + 1.8, shade(c2, 0.25));
  m.box(sx - 0.3, 4.4, b.z1 + 0.15, sx + 0.3, Math.min(b.h - 2.4, 12.6), b.z1 + 1.65, c2, MAT.NEON);
  if (n.garage) m.box(b.x0 + 6, 6.4, b.z1, b.x1 - 6, 7.2, b.z1 + 0.2, c2, MAT.NEON);
}

function buildAwning(m, a) {
  const b = a.b, col = C(a.color);
  const w = Math.min(b.x1 - b.x0 - 2, 14), cx = (b.x0 + b.x1) / 2;
  m.quadN([cx - w / 2, 3.6, b.z1], [cx - w / 2, 3.0, b.z1 + 2.2], [cx + w / 2, 3.0, b.z1 + 2.2], [cx + w / 2, 3.6, b.z1], col, MAT.MATTE, true);
}

function buildBillboard(m, bb) {
  const b = bb.b, cx = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2;
  m.cbox(cx - 4, b.h, z, 0.4, 3, 0.4, C('#555'));
  m.cbox(cx + 4, b.h, z, 0.4, 3, 0.4, C('#555'));
  m.cbox(cx, b.h + 3, z, 12, 5, 0.5, C('#20242c'));
  const palette = [['#ff6a3d', '#ffd84a'], ['#36c9ff', '#ffffff'], ['#ff3fa4', '#2a1a40'], ['#3dff8e', '#103020']][bb.seed % 4];
  m.box(cx - 5.6, b.h + 3.4, z + 0.26, cx + 5.6, b.h + 7.6, z + 0.3, C(palette[0]), MAT.EMISSIVE);
  m.box(cx - 4.6, b.h + 4.6, z + 0.31, cx + 1.5, b.h + 6.4, z + 0.34, C(palette[1]), MAT.EMISSIVE);
}

export function buildPalm(m, x, z, h, lean, rng) {
  const trunk = C('#8c6c4c'), seg = 5;
  let px = x, pz = z, py = 0.15;
  const lx = Math.cos(lean * 7) * lean, lz = Math.sin(lean * 7) * lean;
  for (let k = 0; k < seg; k++) {
    const t = k / seg, sh = h / seg;
    const nx = px + lx * sh * (0.4 + t), nz = pz + lz * sh * (0.4 + t);
    m.cylinder(px, py, pz, 0.32 - t * 0.1, 0.3 - t * 0.1, sh + 0.05, 6, shade(trunk, 0.9 + (k % 2) * 0.12));
    px = nx; pz = nz; py += sh;
  }
  const leaf = C('#3f8f3a');
  const fronds = 8;
  for (let k = 0; k < fronds; k++) {
    const a = (k / fronds) * Math.PI * 2 + rng() * 0.4;
    const ca = Math.cos(a), sa = Math.sin(a);
    const L = rng.range(3.6, 4.6), wdt = 0.55;
    const px2 = -sa * wdt, pz2 = ca * wdt;
    const mid = [px + ca * L * 0.5, py + 0.6, pz + sa * L * 0.5];
    const tip = [px + ca * L, py - 1.4, pz + sa * L];
    const g = shade(leaf, 0.8 + rng() * 0.4);
    m.quadN([px, py, pz], [mid[0] - px2, mid[1], mid[2] - pz2], [mid[0] + px2, mid[1], mid[2] + pz2], [px, py + 0.01, pz], g, MAT.FOLIAGE, true);
    m.quadN([mid[0] - px2, mid[1], mid[2] - pz2], [tip[0], tip[1], tip[2]], [tip[0], tip[1] + 0.01, tip[2]], [mid[0] + px2, mid[1], mid[2] + pz2], g, MAT.FOLIAGE, true);
  }
  m.cbox(px, py - 0.5, pz, 0.6, 0.5, 0.6, C('#6a5030'));
}

function buildTree(m, t) {
  m.cylinder(t.x, 0.16, t.z, 0.3, 0.22, t.h * 0.45, 6, C('#6e4e32'));
  m.cylinder(t.x, t.h * 0.35, t.z, t.r, t.r * 0.55, t.h * 0.4, 7, C('#4c8a38'), MAT.FOLIAGE);
  m.cylinder(t.x, t.h * 0.7, t.z, t.r * 0.7, 0.1, t.h * 0.4, 7, C('#5a9a40'), MAT.FOLIAGE);
}

function buildLamp(m, l) {
  m.at(l.x, 0, l.z, l.yaw);
  m.cylinder(0, 0.15, 0, 0.12, 0.09, 7.2, 5, C('#3c4048'));
  m.box(-0.08, 7.0, 0, 0.08, 7.18, 2.2, C('#3c4048'));
  m.box(-0.3, 6.8, 1.6, 0.3, 7.0, 2.5, C('#ffe6b0'), MAT.EMISSIVE);
  m.at(0, 0, 0);
}

function buildUmbrella(m, u) {
  m.cylinder(u.x, 0, u.z, 0.05, 0.05, 2.3, 4, C('#e8e8e8'));
  m.cylinder(u.x, 1.8, u.z, 2.2, 0.05, 0.65, 8, C(u.color));
  m.quadN([u.x - 2.2, 1.8, u.z], [u.x + 2.2, 1.8, u.z], [u.x + 2.2, 1.8, u.z + 0.01], [u.x - 2.2, 1.8, u.z + 0.01], C(u.color));
}

function buildLifeguardHut(m, h) {
  const col = C(h.color);
  for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) m.cbox(h.x + dx, 0, h.z + dz, 0.2, 2.6, 0.2, C('#f0f0f0'));
  m.cbox(h.x, 2.6, h.z, 3.4, 2.4, 3.4, col, MAT.FACADE);
  m.cbox(h.x, 5.0, h.z, 4.0, 0.3, 4.0, C('#ff5f6d'));
  m.quadN([h.x + 1.7, 2.6, h.z - 0.6], [h.x + 1.7, 2.6, h.z + 0.6], [h.x + 4, 0, h.z + 0.6], [h.x + 4, 0, h.z - 0.6], C('#f0f0f0'), MAT.MATTE, true);
}

function buildContainer(m, c) {
  const col = C(c.color);
  for (let s = 0; s < c.stack; s++) {
    const tint = shade(col, 0.85 + ((s * 7 + Math.floor(c.x)) % 3) * 0.08);
    m.at(c.x, s * 2.6, c.z, c.yaw);
    m.cbox(0, 0, 0, c.len, 2.55, 2.4, tint);
    for (let r = -c.len / 2 + 0.4; r < c.len / 2; r += 0.6) m.cbox(r, 0.05, 1.2, 0.08, 2.45, 0.06, shade(tint, 0.8));
  }
  m.at(0, 0, 0);
}

function buildCrane(m, c) {
  const y = C('#e8a828'), r = C('#c8442f');
  for (const [dx, dz] of [[-8, -4], [8, -4], [-8, 4], [8, 4]]) m.cbox(c.x + dx, 0, c.z + dz, 1.2, 30, 1.2, y);
  m.box(c.x - 9, 28, c.z - 5, c.x + 9, 31, c.z + 5, y);
  m.box(c.x - 1.6, 30, c.z - 30, c.x + 1.6, 32.2, c.z + 60, r);
  m.box(c.x - 2.5, 24, c.z + 2, c.x + 2.5, 28, c.z + 7, C('#f0f0f0'), MAT.FACADE);
  m.cbox(c.x, 31, c.z - 28, 1.2, 9, 1.2, y);
  m.cbox(c.x, 40, c.z - 28, 0.7, 0.7, 0.7, C('#ff2020'), MAT.EMISSIVE);
}

function buildFountain(m, f) {
  m.cylinder(f.x, 0.15, f.z, 3.2, 3.2, 0.7, 12, C('#d8d0c0'));
  m.cylinder(f.x, 0.86, f.z, 2.8, 2.8, 0.01, 12, C('#3fb8d0'), MAT.WATER);
  m.cylinder(f.x, 0.15, f.z, 0.5, 0.35, 2.4, 8, C('#d8d0c0'));
  m.cylinder(f.x, 2.5, f.z, 1.2, 0.2, 0.4, 8, C('#d8d0c0'));
}

function buildEdgeGreenery(m, rng) {
  // mangrove-like scrub along the north and west shores
  for (let t = -30; t < CITY_MAX + 10; t += 9) {
    buildTree(m, { x: t + rng.range(-2, 2), z: -26 + rng.range(-4, 4), h: rng.range(5, 8), r: rng.range(2.5, 3.8) });
    buildTree(m, { x: -26 + rng.range(-4, 4), z: t + rng.range(-2, 2), h: rng.range(5, 8), r: rng.range(2.5, 3.8) });
  }
}

function buildFreighter(m) {
  const x0 = 160, x1 = 470, z0 = 1012, z1 = 1050;
  m.box(x0, -6, z0, x1, 5, z1, C('#1f3550'), MAT.MATTE, { top: C('#7a4a3a') });
  m.box(x0 - 0.1, -1.2, z0 - 0.1, x1 + 0.1, -0.4, z1 + 0.1, C('#b83a30'));
  m.box(x1 - 34, 5, z0 + 4, x1 - 8, 22, z1 - 4, C('#f2f2ee'), MAT.FACADE, { top: C('#c8c8c4') });
  m.cbox(x1 - 18, 22, (z0 + z1) / 2, 4, 6, 4, C('#d84a30'));
  const cols = ['#c8442f', '#2f6fc8', '#e0a82e', '#2e9e6a', '#7c4fb0', '#d86a2a'];
  for (let x = x0 + 10, k = 0; x < x1 - 44; x += 6.5, k++) {
    for (let r = 0; r < 4; r++) {
      const h = 1 + ((k * 3 + r * 5) % 3);
      for (let s = 0; s < h; s++) m.box(x, 5 + s * 2.6, z0 + 4 + r * 7.5, x + 6, 7.5 + s * 2.6, z0 + 6.4 + r * 7.5, shade(C(cols[(k + r + s) % 6]), 0.9));
    }
  }
}

function buildPier(m) {
  const wood = C('#9a7656');
  m.box(PIER.x0, -0.6, PIER.z0, PIER.x1, 0.02, PIER.z1, wood, MAT.MATTE, { top: C('#a8845e') });
  for (let x = PIER.x0 + 4; x < PIER.x1; x += 8) {
    m.cbox(x, -3, PIER.z0 + 0.5, 0.6, 3, 0.6, C('#5a4632'));
    m.cbox(x, -3, PIER.z1 - 0.5, 0.6, 3, 0.6, C('#5a4632'));
  }
  m.box(PIER.x0 + 10, 0, PIER.z0 - 0.3, PIER.x1, 1.1, PIER.z0, C('#f4f0e8'));
  m.box(PIER.x0 + 10, 0, PIER.z1, PIER.x1, 1.1, PIER.z1 + 0.3, C('#f4f0e8'));
  // snack stalls
  const stall = [['#ff5f6d', 40], ['#36c9d6', 70], ['#ffd24a', 100]];
  for (const [c, dx] of stall) {
    m.cbox(PIER.x0 + dx, 0, PIER.z0 + 2.4, 4, 2.6, 3, C('#f4f0e8'), MAT.FACADE);
    m.cbox(PIER.x0 + dx, 2.6, PIER.z0 + 2.4, 4.6, 0.5, 3.6, C(c), MAT.NEON);
  }
  // ferris wheel A-frame supports
  const fx = PIER.x1 - 30, cz = (PIER.z0 + PIER.z1) / 2;
  for (const s of [-1, 1]) {
    m.quadN([fx + s * 4, 0, cz - 8], [fx + s * 4, 0, cz + 8], [fx + s * 2.2, 26, cz + 0.6], [fx + s * 2.2, 26, cz - 0.6], C('#e8e8ea'), MAT.MATTE, true);
  }
}

function buildFerrisWheel() {
  const m = new MeshBuilder();
  const R = 22, spokes = 16;
  const white = C('#f4f4f6');
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * Math.PI * 2, a2 = ((k + 1) / spokes) * Math.PI * 2;
    const x = Math.cos(a) * R, y = Math.sin(a) * R, x2 = Math.cos(a2) * R, y2 = Math.sin(a2) * R;
    for (const z of [-1.6, 1.6]) {
      m.quadN([0, 0, z], [x, y, z], [x + 0.3, y + 0.3, z], [0.3, 0.3, z], white, MAT.MATTE, true);
      m.quadN([x, y, z], [x2, y2, z], [x2, y2 + 0.5, z], [x, y + 0.5, z], C(k % 2 ? '#ff3fa4' : '#36f2ff'), MAT.NEON, true);
    }
    // gondola
    const cabin = C(['#ff5f6d', '#ffd24a', '#36c9d6', '#8c6cf0'][k % 4]);
    m.box(x - 1, y - 2.4, -1.2, x + 1, y - 0.6, 1.2, cabin);
  }
  m.box(-0.8, -0.8, -2.2, 0.8, 0.8, 2.2, C('#c8c8cc'));
  return m.build();
}
