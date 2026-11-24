// Low-poly vehicle meshes built from boxes: sports car, sedan, hatch, van, pickup, limo, police and cab variants.

import { MeshBuilder, MAT } from '../engine/mesh.js';
import { hexColor } from '../engine/math.js';

const C = hexColor;
const PAINT = [1, 1, 1];
const PAINT_DARK = [0.72, 0.72, 0.72];
const TRIM = C('#1d1f24');
const TYRE = C('#141414');
const RIM = C('#b8bcc4');

/** Build the mesh for a vehicle spec. Local +Z is the front, the body spans [-wid/2, wid/2] in X. */
export function buildVehicleMesh(spec) {
  const m = new MeshBuilder();
  const L = spec.len, W = spec.wid, H = spec.hgt;
  const hw = W / 2, hl = L / 2;
  const s = spec.shape;
  const ride = 0.28;
  const bodyTop = s === 'sports' ? 0.78 : s === 'van' ? H : s === 'limo' ? 0.95 : 0.98;

  // lower body: a full-height middle with a sloped bonnet and boot (vans stay boxy)
  if (s === 'van') m.box(-hw, ride, -hl, hw, bodyTop, hl, PAINT, MAT.PAINT, { noBottom: true });
  else {
    const nose = s === 'sports' ? 0.75 : 0.6, tail = 0.45;
    const noseDrop = s === 'sports' ? 0.2 : 0.16, tailDrop = 0.1;
    m.box(-hw, ride, -hl + tail, hw, bodyTop, hl - nose, PAINT, MAT.PAINT, { noBottom: true });
    m.box(-hw, ride, hl - nose, hw, bodyTop - noseDrop, hl, PAINT, MAT.PAINT, { noBottom: true });
    m.box(-hw, ride, -hl, hw, bodyTop - tailDrop, -hl + tail, PAINT, MAT.PAINT, { noBottom: true });
    m.wedge(-hw, hw, bodyTop - noseDrop, bodyTop, hl, hl - nose, PAINT, MAT.PAINT);
    m.wedge(-hw, hw, bodyTop - tailDrop, bodyTop, -hl, -hl + tail, PAINT, MAT.PAINT);
    // grille, door seams and mirrors
    m.box(-hw + 0.6, ride + 0.25, hl, hw - 0.6, bodyTop - noseDrop - 0.08, hl + 0.03, TRIM);
    for (const sx of [-1, 1]) {
      m.box(sx * hw - 0.012, ride + 0.25, hl * 0.05, sx * hw + 0.012, bodyTop - 0.04, hl * 0.05 + 0.04, TRIM);
      if (s !== 'sports' && s !== 'hatch') m.box(sx * hw - 0.012, ride + 0.25, -hl * 0.38, sx * hw + 0.012, bodyTop - 0.04, -hl * 0.38 + 0.04, TRIM);
    }
  }
  m.box(-hw - 0.02, ride, -hl + 0.1, hw + 0.02, ride + 0.22, hl - 0.1, PAINT_DARK, MAT.PAINT);
  // bumpers
  m.box(-hw + 0.05, ride - 0.05, hl - 0.05, hw - 0.05, ride + 0.25, hl + 0.12, TRIM);
  m.box(-hw + 0.05, ride - 0.05, -hl - 0.12, hw - 0.05, ride + 0.25, -hl + 0.05, TRIM);

  if (s === 'van') {
    // tall box with a glass cab up front
    m.box(-hw + 0.06, bodyTop * 0.55, hl - 1.2, hw - 0.06, bodyTop - 0.15, hl + 0.01, C('#000000'), MAT.GLASS);
    m.box(-hw - 0.01, bodyTop * 0.55, hl - 1.6, hw + 0.01, bodyTop - 0.4, hl - 1.2, C('#000000'), MAT.GLASS);
    m.box(-hw - 0.03, 0.9, -hl + 0.4, hw + 0.03, 1.5, hl - 2.0, C('#e8e8e8'));
  } else {
    const roofH = s === 'sports' ? H : H;
    let c0, c1; // cabin rear / front z
    if (s === 'sports') { c0 = -hl * 0.45; c1 = hl * 0.12; }
    else if (s === 'hatch') { c0 = -hl * 0.85; c1 = hl * 0.25; }
    else if (s === 'pickup') { c0 = -hl * 0.1; c1 = hl * 0.35; }
    else if (s === 'limo') { c0 = -hl * 0.62; c1 = hl * 0.3; }
    else { c0 = -hl * 0.5; c1 = hl * 0.28; }
    const cw = hw - 0.12;
    m.box(-cw, bodyTop, c0 + 0.25, cw, roofH - 0.06, c1 - 0.35, C('#000000'), MAT.GLASS, { noBottom: true });
    m.box(-cw - 0.02, roofH - 0.08, c0 + 0.3, cw + 0.02, roofH, c1 - 0.38, PAINT, MAT.PAINT);
    // sloped windscreen and rear glass
    m.wedge(-cw, cw, bodyTop, roofH - 0.06, c1 + 0.35, c1 - 0.35, C('#000000'), MAT.GLASS);
    m.wedge(-cw, cw, bodyTop, roofH - 0.06, c0 - (s === 'hatch' ? 0.05 : 0.3), c0 + 0.25, C('#000000'), MAT.GLASS);
    if (s === 'pickup') {
      // open load bed
      const bz0 = -hl + 0.1, bz1 = c0 - 0.35;
      m.box(-hw, bodyTop, bz0, -hw + 0.12, bodyTop + 0.35, bz1, PAINT, MAT.PAINT);
      m.box(hw - 0.12, bodyTop, bz0, hw, bodyTop + 0.35, bz1, PAINT, MAT.PAINT);
      m.box(-hw, bodyTop, bz0, hw, bodyTop + 0.35, bz0 + 0.12, PAINT, MAT.PAINT);
      m.box(-hw + 0.12, bodyTop - 0.02, bz0 + 0.12, hw - 0.12, bodyTop + 0.01, bz1, C('#2a2a2a'));
    }
    if (s === 'sports') m.box(-hw + 0.1, bodyTop + 0.3, -hl + 0.05, hw - 0.1, bodyTop + 0.38, -hl + 0.45, TRIM);
    if (s === 'limo') for (let z = c0 + 1; z < c1 - 0.5; z += 1.3) m.box(-cw - 0.03, bodyTop + 0.05, z, cw + 0.03, roofH - 0.12, z + 0.08, PAINT, MAT.PAINT);
  }

  // lights
  const ly = s === 'sports' ? 0.6 : 0.75;
  m.box(-hw + 0.12, ly - 0.08, hl, -hw + 0.55, ly + 0.08, hl + 0.06, C('#fff4d8'), MAT.EMISSIVE);
  m.box(hw - 0.55, ly - 0.08, hl, hw - 0.12, ly + 0.08, hl + 0.06, C('#fff4d8'), MAT.EMISSIVE);
  m.box(-hw + 0.1, ly - 0.06, -hl - 0.06, -hw + 0.5, ly + 0.08, -hl, C('#ff2030'), MAT.EMISSIVE);
  m.box(hw - 0.5, ly - 0.06, -hl - 0.06, hw - 0.1, ly + 0.08, -hl, C('#ff2030'), MAT.EMISSIVE);

  if (spec.police) {
    m.box(-hw - 0.015, ride + 0.2, -hl * 0.35, hw + 0.015, bodyTop + 0.01, hl * 0.25, C('#15171c'));
    m.box(-0.7, H, -0.2, -0.05, H + 0.16, 0.2, C('#ff2028'), MAT.EMISSIVE);
    m.box(0.05, H, -0.2, 0.7, H + 0.16, 0.2, C('#2050ff'), MAT.EMISSIVE);
    m.box(-0.05, H, -0.2, 0.05, H + 0.14, 0.2, C('#d0d0d0'));
  }
  if (spec.taxi) {
    m.box(-0.45, H, -0.25, 0.45, H + 0.3, 0.25, C('#fff0b0'), MAT.EMISSIVE);
    m.box(-hw - 0.015, 0.7, -hl * 0.4, hw + 0.015, 0.8, hl * 0.4, C('#1a1a1a'));
  }

  // wheels, with dark arches so they read as set into the body
  const wr = s === 'van' || s === 'pickup' ? 0.4 : 0.34;
  const wz = hl * 0.66;
  for (const sx of [-1, 1]) for (const z of [-wz, wz]) m.box(sx > 0 ? hw - 0.02 : -hw - 0.02, ride - 0.05, z - wr - 0.12, sx > 0 ? hw + 0.02 : -hw + 0.02, ride + wr * 1.1, z + wr + 0.12, TRIM);
  if (s !== 'van') for (const sx of [-1, 1]) m.box(sx * (hw + 0.14) - 0.07, bodyTop + 0.05, (s === 'sports' ? hl * 0.12 : s === 'pickup' ? hl * 0.35 : s === 'hatch' ? hl * 0.25 : hl * 0.28) - 0.5, sx * (hw + 0.14) + 0.07, bodyTop + 0.2, (s === 'sports' ? hl * 0.12 : s === 'pickup' ? hl * 0.35 : s === 'hatch' ? hl * 0.25 : hl * 0.28) - 0.35, PAINT, MAT.PAINT);
  for (const x of [-hw + 0.14, hw - 0.14]) {
    for (const z of [-wz, wz]) {
      m.wheel(x, wr, z, wr, 0.3, 8, TYRE);
      m.wheel(x + Math.sign(x) * 0.02, wr, z, wr * 0.55, 0.3, 6, RIM);
    }
  }
  return m.build();
}

/** Police helicopter body (the rotor is a separate mesh so it can spin). */
export function buildHelicopterMesh() {
  const m = new MeshBuilder();
  const body = C('#1c2a44'), white = C('#e8ecf2');
  m.box(-1.1, 0.6, -1.6, 1.1, 2.6, 2.2, body);
  m.box(-1.0, 0.9, 2.2, 1.0, 2.3, 3.4, C('#000000'), MAT.GLASS);
  m.box(-1.12, 1.4, -1.6, 1.12, 1.8, 2.2, white);
  m.box(-0.3, 1.6, -7.0, 0.3, 2.2, -1.6, body);
  m.box(-0.08, 1.8, -7.2, 0.08, 3.4, -6.4, body);
  m.box(-1.2, 0, -1.2, -1.0, 0.1, 2.0, C('#30343a'));
  m.box(1.0, 0, -1.2, 1.2, 0.1, 2.0, C('#30343a'));
  m.box(-1.15, 0, -0.6, -1.0, 0.6, -0.45, C('#30343a'));
  m.box(1.0, 0, -0.6, 1.15, 0.6, -0.45, C('#30343a'));
  m.box(-1.15, 0, 1.2, -1.0, 0.6, 1.35, C('#30343a'));
  m.box(1.0, 0, 1.2, 1.15, 0.6, 1.35, C('#30343a'));
  m.box(-0.2, 2.6, -0.2, 0.2, 3.0, 0.2, C('#30343a'));
  m.box(-0.3, 0.4, 2.0, 0.3, 0.7, 2.4, C('#fffbe0'), MAT.EMISSIVE);
  m.box(-0.15, 2.5, -7.0, 0.15, 2.7, -6.8, C('#ff2020'), MAT.EMISSIVE);
  return m.build();
}

export function buildRotorMesh() {
  const m = new MeshBuilder();
  const c = C('#2a2d33');
  m.box(-0.18, 0, -5.5, 0.18, 0.06, 5.5, c);
  m.box(-5.5, 0, -0.18, 5.5, 0.06, 0.18, c);
  return m.build();
}
