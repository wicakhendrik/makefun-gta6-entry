// Blocky people with swinging limbs (anim channel: ±1 legs, ±2 arms). The shirt takes a per-instance tint.

import { MeshBuilder, MAT } from '../engine/mesh.js';
import { hexColor } from '../engine/math.js';

const C = hexColor;
const SKINS = ['#f1c9a5', '#d9a47c', '#b07a52', '#8a5a3a', '#5e3c26', '#e8b896'];
const HAIRS = ['#1a1410', '#3a2618', '#6a4a2a', '#c8a060', '#2a2a2a', '#8a3a20', '#d8d8d0'];
const PANTS = ['#2a3550', '#3a3a40', '#c8b898', '#4a3a2a', '#1a1a1e', '#5a6a7a', '#e8e4da'];

export const SHIRTS = ['#ff6a5a', '#36b8c8', '#f6d24a', '#ffffff', '#8c6cf0', '#5fbf6a', '#ff9a3c', '#e85a9a', '#4a7ad8', '#f4f0e0'];

/**
 * opts: { skin, hair, pants, hat, glasses, suit } as hex strings / flags.
 */
export function buildHumanMesh(opts = {}) {
  const m = new MeshBuilder();
  const skin = C(opts.skin || SKINS[0]), hair = C(opts.hair || HAIRS[0]), pants = C(opts.pants || PANTS[0]);
  const shoe = C(opts.shoe || '#1c1c1c');
  const shirt = [1, 1, 1];
  // legs (+x is the figure's left side when facing +z)
  for (const side of [1, -1]) {
    const x = side * 0.11;
    m.box(x - 0.085, 0.1, -0.1, x + 0.085, 0.94, 0.1, pants, MAT.MATTE, { anim: side });
    m.box(x - 0.09, 0, -0.11, x + 0.09, 0.12, 0.17, shoe, MAT.MATTE, { anim: side });
  }
  // torso
  m.box(-0.23, 0.9, -0.13, 0.23, 1.5, 0.13, shirt, MAT.PAINT);
  if (opts.suit) m.box(-0.05, 1.1, 0.131, 0.05, 1.48, 0.14, C('#e8e8e8'));
  if (opts.badge) m.box(0.08, 1.32, 0.131, 0.16, 1.4, 0.14, C('#f0c040'), MAT.EMISSIVE);
  // arms: sleeve takes the shirt tint, forearm is skin
  for (const side of [1, -1]) {
    const x = side * 0.3;
    m.box(x - 0.07, 1.16, -0.08, x + 0.07, 1.5, 0.08, shirt, MAT.PAINT, { anim: side * 2 });
    m.box(x - 0.06, 0.84, -0.07, x + 0.06, 1.17, 0.07, opts.gloves ? C('#1c1c1c') : skin, MAT.MATTE, { anim: side * 2 });
  }
  // head
  m.box(-0.06, 1.5, -0.06, 0.06, 1.56, 0.06, skin);
  m.box(-0.12, 1.55, -0.12, 0.12, 1.82, 0.13, skin);
  m.box(-0.13, 1.74, -0.14, 0.13, 1.86, 0.1, hair);
  if (opts.hat) {
    m.box(-0.14, 1.8, -0.15, 0.14, 1.92, 0.14, C(opts.hat));
    m.box(-0.13, 1.8, 0.1, 0.13, 1.83, 0.25, C(opts.hat));
  }
  if (opts.glasses) m.box(-0.11, 1.68, 0.13, 0.11, 1.73, 0.15, C('#101010'));
  return m.build();
}

/** A few civilian looks plus the special characters. */
export function humanLooks() {
  const looks = [];
  for (let k = 0; k < 10; k++) {
    looks.push({ skin: SKINS[k % SKINS.length], hair: HAIRS[(k * 3) % HAIRS.length], pants: PANTS[(k * 5) % PANTS.length], hat: k % 4 === 1 ? '#f4f0e0' : null, glasses: k % 3 === 0 });
  }
  return {
    civilians: looks,
    player: { skin: '#c8906a', hair: '#1a1410', pants: '#d8ccb0', glasses: true, shoe: '#f4f4f4' },
    cop: { skin: '#d9a47c', hair: '#2a2a2a', pants: '#1a2440', hat: '#1a2440', badge: true },
    goon: { skin: '#b07a52', hair: '#111111', pants: '#141418', suit: true, glasses: true, gloves: true },
    boss: { skin: '#f1c9a5', hair: '#d8d8d0', pants: '#e8e4da', suit: true },
  };
}
