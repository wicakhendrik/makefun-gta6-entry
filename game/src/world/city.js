// Port Solara: procedural layout of the island city — road grid, districts, buildings, props and landmarks.

import { makeRng } from '../engine/math.js';

export const BLOCKS = 12;          // blocks per side
export const PITCH = 80;           // road centre to road centre
export const ROAD = 16;            // road width
export const LANE = 3.2;           // traffic lane offset from the centre line
export const PARK_LANE = 6.3;      // parked cars sit this far from the centre line
export const CITY_MAX = BLOCKS * PITCH;
export const BEACH_X0 = CITY_MAX + ROAD / 2 + 4;
export const SHORE_X = 1080;
export const LAND = { x0: -44, z0: -44, x1: SHORE_X, z1: 1000 };
export const PIER = { x0: 1070, x1: 1230, z0: 474, z1: 488 };

export const DISTRICTS = {
  meridian: { name: 'Meridian', tag: 'Financial District' },
  midtown: { name: 'Midtown', tag: 'Heart of the city' },
  strand: { name: 'Coral Strand', tag: 'Neon nights, pastel days' },
  brisas: { name: 'Las Brisas', tag: 'Palms and private pools' },
  cinder: { name: 'Cinder Row', tag: 'Garages and grit' },
  mercado: { name: 'El Mercado', tag: 'Music on every corner' },
  docks: { name: 'Saltmarsh Docks', tag: 'Where cargo goes missing' },
  park: { name: 'Halcyon Park', tag: 'Green lungs of Solara' },
  beach: { name: 'Solara Beach', tag: 'Sun, sand, sirens' },
  pier: { name: 'Sunfall Pier', tag: 'Ride the big wheel' },
};

const PALETTES = {
  meridian: ['#9fb6c8', '#c9d3da', '#7fa3b8', '#d8c9b0', '#8a9aa8', '#b4c7c9'],
  midtown: ['#e3cdb0', '#d99a7c', '#c9b79c', '#e8dfcf', '#a9b8b9', '#d8a77f', '#f0e2c4'],
  strand: ['#9fe3c8', '#f7a8b8', '#f6e27a', '#c7b3f0', '#f4f1ea', '#8fd8e8', '#ffc59a'],
  brisas: ['#f4efe4', '#efe3cc', '#f6dcc4', '#e9efe6', '#f2e8d8'],
  cinder: ['#8a4b3c', '#6c5a50', '#7e6f62', '#5d6670', '#9a6a4a', '#544a48'],
  mercado: ['#f29b4b', '#3fb8b0', '#e0527a', '#f2cf4b', '#7a6fd8', '#5fbf6a', '#f07a5a'],
  docks: ['#6f7f8c', '#4f6f8f', '#8c5a3c', '#7d8b78', '#5a5f66'],
};
export const NEON = ['#ff3fa4', '#36f2ff', '#ffe04a', '#9a5cff', '#3dff8e', '#ff7a2f'];
const CONTAINER = ['#c8442f', '#2f6fc8', '#e0a82e', '#2e9e6a', '#7c4fb0', '#d86a2a', '#3a8fa0'];

export const roadCoord = (i) => i * PITCH;
export const blockMin = (b) => b * PITCH + ROAD / 2;
export const blockMax = (b) => (b + 1) * PITCH - ROAD / 2;
export const blockCenter = (b) => b * PITCH + PITCH / 2;

export function districtOfBlock(bx, bz) {
  if ((bx === 5 || bx === 6) && bz === 7) return 'park';
  if (bz >= 10) return 'docks';
  if (bx >= 9) return 'strand';
  if (bx >= 4 && bx <= 7 && bz >= 3 && bz <= 6) return 'meridian';
  if (bx <= 3 && bz <= 5) return 'brisas';
  if (bz <= 2) return 'cinder';
  if (bx <= 3) return 'mercado';
  return 'midtown';
}

/** District key for any world position (roads count toward the nearest block). */
export function districtAt(x, z) {
  if (x > PIER.x0 - 6 && z > PIER.z0 - 4 && z < PIER.z1 + 4) return 'pier';
  if (x > CITY_MAX + ROAD / 2) return 'beach';
  const bx = Math.max(0, Math.min(BLOCKS - 1, Math.floor(x / PITCH)));
  const bz = Math.max(0, Math.min(BLOCKS - 1, Math.floor(z / PITCH)));
  return districtOfBlock(bx, bz);
}

/** Landmark blocks used by the story, the shops and the safehouse. */
export const SPECIAL = {
  garage: [5, 1], safehouse: [10, 5], lounge: [2, 8], precinct: [8, 3], hospital: [3, 7],
  gunshop: [8, 9], tower: [6, 4], warehouse: [3, 11], villa: [1, 2],
};

function blockFront(bx, bz, side = 'south') {
  // a point on the sidewalk in front of a block, facing the given road
  const cx = blockCenter(bx), cz = blockCenter(bz);
  if (side === 'south') return { x: cx, z: blockMax(bz) + 1.5 };
  if (side === 'north') return { x: cx, z: blockMin(bz) - 1.5 };
  if (side === 'east') return { x: blockMax(bx) + 1.5, z: cz };
  return { x: blockMin(bx) - 1.5, z: cz };
}

export const POI = {
  garage: { ...blockFront(5, 1, 'south'), name: "Lou's Body & Soul" },
  safehouse: { ...blockFront(10, 5, 'west'), name: 'Seabreeze Apartments' },
  lounge: { ...blockFront(2, 8, 'east'), name: 'Ocelot Lounge' },
  precinct: { ...blockFront(8, 3, 'south'), name: 'SPD Central Precinct' },
  hospital: { ...blockFront(3, 7, 'east'), name: 'St. Amara Medical' },
  gunshop: { ...blockFront(8, 9, 'north'), name: 'Bolt & Barrel' },
  tower: { ...blockFront(6, 4, 'south'), name: 'Crane Tower' },
  warehouse: { ...blockFront(3, 11, 'north'), name: 'Pier 9 Warehouse' },
  villa: { ...blockFront(1, 2, 'east'), name: 'Villa Serrano' },
};

/** Build the full city description. Pure data: geometry is made in citymesh.js. */
export function generateCity(seed = 1337) {
  const rng = makeRng(seed);
  const city = {
    buildings: [], colliders: [], palms: [], trees: [], lamps: [], umbrellas: [], loungers: [], towers: [],
    containers: [], cranes: [], pools: [], awnings: [], neon: [], houses: [], hedges: [], lots: [], parking: [],
    benches: [], huts: [], fountains: [], billboards: [],
  };
  const addCollider = (x0, z0, x1, z1, h = 40) => city.colliders.push({ x0, z0, x1, z1, h });

  for (let bx = 0; bx < BLOCKS; bx++) {
    for (let bz = 0; bz < BLOCKS; bz++) {
      const d = districtOfBlock(bx, bz);
      const x0 = blockMin(bx), x1 = blockMax(bx), z0 = blockMin(bz), z1 = blockMax(bz);
      city.lots.push({ bx, bz, d, x0, z0, x1, z1 });
      const ix0 = x0 + 4, ix1 = x1 - 4, iz0 = z0 + 4, iz1 = z1 - 4;
      const special = Object.entries(SPECIAL).find(([, b]) => b[0] === bx && b[1] === bz)?.[0];
      if (d === 'park') { genPark(city, rng, ix0, iz0, ix1, iz1); continue; }
      if (special === 'tower') { genCraneTower(city, rng, ix0, iz0, ix1, iz1, addCollider); continue; }
      if (special === 'garage') { genGarage(city, rng, ix0, iz0, ix1, iz1, addCollider); continue; }
      if (d === 'brisas') { genHouses(city, rng, ix0, iz0, ix1, iz1, addCollider, special === 'villa'); }
      else if (d === 'docks') { genDocksLot(city, rng, ix0, iz0, ix1, iz1, addCollider, bz); }
      else genUrbanLot(city, rng, d, ix0, iz0, ix1, iz1, addCollider, special);
      // sidewalk props
      if (d === 'strand' || d === 'brisas' || d === 'mercado') {
        for (let t = 0; t < 4; t++) {
          const u = 6 + t * 16;
          city.palms.push({ x: x0 + u, z: z0 + 1.4, h: rng.range(7, 11), lean: rng.range(-0.25, 0.25) });
          city.palms.push({ x: x0 + u, z: z1 - 1.4, h: rng.range(7, 11), lean: rng.range(-0.25, 0.25) });
        }
      }
    }
  }

  // street lamps along every road, both sides
  for (let i = 0; i <= BLOCKS; i++) {
    const c = roadCoord(i);
    for (let k = 0; k < BLOCKS; k++) {
      for (const t of [0.3, 0.75]) {
        const along = k * PITCH + ROAD / 2 + t * (PITCH - ROAD);
        city.lamps.push({ x: c - ROAD / 2 - 0.8, z: along, yaw: Math.PI / 2 });
        city.lamps.push({ x: along, z: c + ROAD / 2 + 0.8, yaw: Math.PI });
      }
    }
  }

  // parked cars along curbs (avoid intersections)
  for (let i = 0; i <= BLOCKS; i++) {
    for (let k = 0; k < BLOCKS; k++) {
      if (rng() < 0.32) city.parking.push({ x: roadCoord(i) + PARK_LANE, z: k * PITCH + rng.range(22, 58), heading: Math.PI });
      if (rng() < 0.32) city.parking.push({ x: k * PITCH + rng.range(22, 58), z: roadCoord(i) - PARK_LANE, heading: -Math.PI / 2 });
    }
  }

  genBeach(city, rng);
  genQuay(city, rng, addCollider);

  // island boundary walls
  addCollider(LAND.x0 - 10, LAND.z0 - 10, LAND.x1 + 200, LAND.z0, 3);
  addCollider(LAND.x0 - 10, LAND.z0, LAND.x0, LAND.z1 + 10, 3);
  addCollider(LAND.x0 - 10, LAND.z1, LAND.x1 + 200, LAND.z1 + 10, 3);
  addCollider(SHORE_X + 8, LAND.z0, SHORE_X + 18, PIER.z0, 3);
  addCollider(SHORE_X + 8, PIER.z1, SHORE_X + 18, LAND.z1, 3);
  addCollider(PIER.x0 + 10, PIER.z0 - 3, PIER.x1, PIER.z0 - 0.5, 2);
  addCollider(PIER.x0 + 10, PIER.z1 + 0.5, PIER.x1, PIER.z1 + 3, 2);
  addCollider(PIER.x1, PIER.z0 - 3, PIER.x1 + 3, PIER.z1 + 3, 2);
  return city;
}

function genUrbanLot(city, rng, d, x0, z0, x1, z1, addCollider, special) {
  const pal = PALETTES[d];
  const parcels = splitLot(rng, x0, z0, x1, z1, d === 'meridian' ? 1 : d === 'cinder' ? 2 : 3);
  for (const p of parcels) {
    const w = p.x1 - p.x0, dd = p.z1 - p.z0;
    const inset = d === 'meridian' ? rng.range(2, 6) : rng.range(0.5, 2.5);
    const b = { x0: p.x0 + inset, z0: p.z0 + inset, x1: p.x1 - inset, z1: p.z1 - inset, d };
    if (d === 'meridian') { b.h = rng.range(55, 135); b.mat = rng() < 0.6 ? 'tower' : 'facade'; }
    else if (d === 'midtown') { b.h = rng.range(14, 46); b.mat = rng() < 0.2 ? 'tower' : 'facade'; }
    else if (d === 'strand') { b.h = rng.range(11, 28); b.mat = 'ribbon'; }
    else if (d === 'cinder') { b.h = rng.range(6, 15); b.mat = 'facade'; }
    else { b.h = rng.range(8, 17); b.mat = 'facade'; }
    if (special === 'precinct' || special === 'hospital') { b.h = 24; b.mat = 'facade'; }
    b.color = special === 'precinct' ? '#d6dde4' : special === 'hospital' ? '#f2f4f2' : rng.pick(pal);
    b.setback = d === 'meridian' && b.h > 70 && rng() < 0.7;
    b.special = special;
    if (w < 8 || dd < 8) continue;
    city.buildings.push(b);
    addCollider(b.x0, b.z0, b.x1, b.z1, b.h);
    if (d === 'strand') {
      city.neon.push({ b, color: rng.pick(NEON), color2: rng.pick(NEON) });
      if (rng() < 0.5) city.awnings.push({ b, color: rng.pick(NEON) });
    }
    if (d === 'mercado' || d === 'midtown') if (rng() < 0.55) city.awnings.push({ b, color: rng.pick(PALETTES.mercado) });
    if (d === 'midtown' && rng() < 0.15 && b.h > 20) city.billboards.push({ b, seed: rng.int(0, 9999) });
  }
}

/** Recursively split a lot into parcels with a guaranteed minimum size. */
function splitLot(rng, x0, z0, x1, z1, depth) {
  if (depth <= 0 || (x1 - x0 < 24 && z1 - z0 < 24)) return [{ x0, z0, x1, z1 }];
  const alongX = x1 - x0 > z1 - z0 ? true : x1 - x0 < z1 - z0 ? false : rng() < 0.5;
  const t = rng.range(0.38, 0.62);
  if (alongX) {
    const m = x0 + (x1 - x0) * t;
    return [...splitLot(rng, x0, z0, m, z1, depth - 1), ...splitLot(rng, m, z0, x1, z1, depth - 1)];
  }
  const m = z0 + (z1 - z0) * t;
  return [...splitLot(rng, x0, z0, x1, m, depth - 1), ...splitLot(rng, x0, m, x1, z1, depth - 1)];
}

function genCraneTower(city, rng, x0, z0, x1, z1, addCollider) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const b = { x0: cx - 15, z0: cz - 13, x1: cx + 15, z1: cz + 9, h: 190, mat: 'tower', color: '#2f5f7a', d: 'meridian', setback: true, landmark: 'crane' };
  city.buildings.push(b);
  addCollider(b.x0, b.z0, b.x1, b.z1, b.h);
  city.fountains.push({ x: cx, z: z1 - 7 });
  city.palms.push({ x: x0 + 3, z: z1 - 3, h: 9, lean: 0.1 }, { x: x1 - 3, z: z1 - 3, h: 9, lean: -0.1 });
  addCollider(cx - 3.2, z1 - 10.2, cx + 3.2, z1 - 3.8, 1.2);
}

function genGarage(city, rng, x0, z0, x1, z1, addCollider) {
  // Lou's chop shop: a wide workshop with an open bay facing south
  const b = { x0: x0 + 6, z0: z0 + 6, x1: x1 - 6, z1: z1 - 22, h: 9, mat: 'facade', color: '#c5583e', d: 'cinder', special: 'garage' };
  city.buildings.push(b);
  addCollider(b.x0, b.z0, b.x1, b.z1, b.h);
  city.neon.push({ b, color: '#ff3fa4', color2: '#36f2ff', garage: true });
  for (let k = 0; k < 5; k++) city.containers.push({ x: x0 + 4 + k * 2.6, z: z1 - 6, yaw: Math.PI / 2, color: '#5a4a44', stack: 1, len: 2.4 });
}

function genHouses(city, rng, x0, z0, x1, z1, addCollider, villa) {
  if (villa) {
    const b = { x0: x0 + 10, z0: z0 + 8, x1: x1 - 12, z1: z1 - 22, h: 9, mat: 'ribbon', color: '#f6f1e6', d: 'brisas', special: 'villa' };
    city.buildings.push(b);
    addCollider(b.x0, b.z0, b.x1, b.z1, b.h);
    city.pools.push({ x0: x0 + 12, z0: z1 - 18, x1: x1 - 16, z1: z1 - 8 });
    for (let k = 0; k < 6; k++) city.palms.push({ x: x0 + 4 + k * 9, z: z1 - 4, h: 10, lean: rng.range(-0.2, 0.2) });
    city.hedges.push({ x0, z0, x1, z1 });
    return;
  }
  const cols = 2, rows = 2;
  const cw = (x1 - x0) / cols, rh = (z1 - z0) / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const hx0 = x0 + i * cw, hz0 = z0 + j * rh;
      const w = rng.range(12, 17), dd = rng.range(10, 13);
      const cx = hx0 + cw / 2 + rng.range(-2, 2), cz = hz0 + rh / 2 + (j === 0 ? -3 : 3);
      const h = { x0: cx - w / 2, z0: cz - dd / 2, x1: cx + w / 2, z1: cz + dd / 2, h: rng.range(4.5, 7.5), color: rng.pick(PALETTES.brisas), roof: rng.pick(['#c0603a', '#b5523a', '#9e4e3a', '#c97b4a']) };
      city.houses.push(h);
      addCollider(h.x0, h.z0, h.x1, h.z1, h.h + 3);
      if (rng() < 0.6) {
        const pz = j === 0 ? hz0 + 1.5 : hz0 + rh - 7.5;
        city.pools.push({ x0: cx - 4, z0: pz, x1: cx + 4, z1: pz + 5 });
      }
      city.palms.push({ x: hx0 + 2.5, z: hz0 + 2.5, h: rng.range(6, 9), lean: rng.range(-0.3, 0.3) });
    }
  }
  city.hedges.push({ x0, z0, x1, z1 });
}

function genDocksLot(city, rng, x0, z0, x1, z1, addCollider, bz) {
  if (rng() < 0.55 || bz === 11) {
    const b = { x0: x0 + 3, z0: z0 + 3, x1: x1 - 3, z1: z0 + rng.range(26, 34), h: rng.range(9, 14), mat: 'facade', color: rng.pick(PALETTES.docks), d: 'docks', warehouse: true };
    city.buildings.push(b);
    addCollider(b.x0, b.z0, b.x1, b.z1, b.h);
    genContainerRows(city, rng, x0 + 3, b.z1 + 5, x1 - 3, z1 - 2, addCollider);
  } else genContainerRows(city, rng, x0 + 2, z0 + 3, x1 - 2, z1 - 2, addCollider);
}

function genContainerRows(city, rng, x0, z0, x1, z1, addCollider) {
  for (let z = z0 + 1.5; z + 2.6 < z1; z += 5.5) {
    let x = x0 + 1;
    while (x + 6.1 < x1) {
      if (rng() < 0.8) {
        const stack = rng.int(1, 3);
        city.containers.push({ x: x + 3, z: z + 1.3, yaw: 0, color: rng.pick(CONTAINER), stack, len: 6 });
      }
      x += 6.4;
    }
    addCollider(x0 + 1, z, x - 0.3, z + 2.6, 8);
  }
}

function genPark(city, rng, x0, z0, x1, z1) {
  for (let k = 0; k < 16; k++) {
    const x = rng.range(x0 + 2, x1 - 2), z = rng.range(z0 + 2, z1 - 2);
    if (Math.abs(x - (x0 + x1) / 2) < 4 || Math.abs(z - (z0 + z1) / 2) < 4) continue;
    city.trees.push({ x, z, h: rng.range(5, 9), r: rng.range(2.2, 3.6) });
  }
  city.fountains.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2 });
  for (let k = 0; k < 4; k++) city.benches.push({ x: (x0 + x1) / 2 + (k - 1.5) * 6, z: (z0 + z1) / 2 + 7, yaw: 0 });
}

function genBeach(city, rng) {
  for (let z = 10; z < CITY_MAX; z += 14) {
    if (z > PIER.z0 - 14 && z < PIER.z1 + 10) continue;
    city.palms.push({ x: BEACH_X0 + 3 + rng.range(-1, 1), z: z + rng.range(-2, 2), h: rng.range(9, 13), lean: rng.range(-0.35, 0.35) });
    if (rng() < 0.7) {
      const ux = rng.range(BEACH_X0 + 28, SHORE_X - 18);
      city.umbrellas.push({ x: ux, z: z + rng.range(-3, 3), color: rng.pick(['#ff5f6d', '#ffd24a', '#36c9d6', '#ffffff', '#ff9a3c', '#8c6cf0']) });
      city.loungers.push({ x: ux + 1.5, z: z + 2, yaw: Math.PI / 2 });
    }
  }
  for (const z of [120, 330, 620, 840]) city.huts.push({ x: BEACH_X0 + 40, z, color: rng.pick(['#9fe3c8', '#f7a8b8', '#f6e27a', '#8fd8e8']) });
}

function genQuay(city, rng, addCollider) {
  // gantry cranes along the southern quay and a docked freighter
  for (const x of [120, 260, 400, 540]) city.cranes.push({ x, z: 984 });
  for (const x of [120, 260, 400, 540]) addCollider(x - 9, 979, x + 9, 989, 30);
}
