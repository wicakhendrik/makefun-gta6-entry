// Road network helpers: grid nodes, right-hand lanes, segment choice for traffic and greedy routing for police.

import { BLOCKS, PITCH, ROAD, LANE, CITY_MAX } from './city.js';

export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // +x, +z, -x, -z

export const headingOfDir = (d) => Math.atan2(DIRS[d][0], DIRS[d][1]);
/** Driver's right-hand side for a direction (lanes sit on the right). */
export const rightOfDir = (d) => [-DIRS[d][1], DIRS[d][0]];
export const nodePos = (i, j) => [i * PITCH, j * PITCH];
export const nodeValid = (i, j) => i >= 0 && j >= 0 && i <= BLOCKS && j <= BLOCKS;

export function nearestNode(x, z) {
  const i = Math.max(0, Math.min(BLOCKS, Math.round(x / PITCH)));
  const j = Math.max(0, Math.min(BLOCKS, Math.round(z / PITCH)));
  return [i, j];
}

/** Point on the lane centre line of the segment leaving node (i,j) in direction d, at distance `along`. */
export function lanePoint(i, j, d, along) {
  const [x, z] = nodePos(i, j);
  const f = DIRS[d], r = rightOfDir(d);
  return [x + f[0] * along + r[0] * LANE, z + f[1] * along + r[1] * LANE];
}

export function isOnRoad(x, z) {
  if (x < -ROAD / 2 || z < -ROAD / 2 || x > CITY_MAX + ROAD / 2 || z > CITY_MAX + ROAD / 2) return false;
  const ox = Math.abs(x - Math.round(x / PITCH) * PITCH), oz = Math.abs(z - Math.round(z / PITCH) * PITCH);
  return ox < ROAD / 2 || oz < ROAD / 2;
}

/** Pick the next direction at an intersection: mostly straight, never a U-turn unless forced. */
export function chooseNextDir(i, j, d, rng) {
  const opts = [];
  for (const [nd, w] of [[d, 0.5], [(d + 1) % 4, 0.25], [(d + 3) % 4, 0.25]]) {
    if (nodeValid(i + DIRS[nd][0], j + DIRS[nd][1])) opts.push([nd, w]);
  }
  if (!opts.length) return (d + 2) % 4;
  let total = opts.reduce((s, o) => s + o[1], 0), r = rng() * total;
  for (const [nd, w] of opts) { if ((r -= w) <= 0) return nd; }
  return opts[0][0];
}

/** Greedy route step toward a target node: the direction that most reduces the remaining distance. */
export function routeDir(i, j, ti, tj, currentDir) {
  const dx = ti - i, dj = tj - j;
  if (dx === 0 && dj === 0) return currentDir;
  const want = [];
  if (Math.abs(dx) >= Math.abs(dj)) { want.push(dx > 0 ? 0 : 2); if (dj) want.push(dj > 0 ? 1 : 3); }
  else { want.push(dj > 0 ? 1 : 3); if (dx) want.push(dx > 0 ? 0 : 2); }
  // prefer keeping the current direction if it is one of the useful ones (fewer turns)
  if (want.includes(currentDir)) return currentDir;
  return want[0];
}

/** Direction (0..3) closest to a heading angle. */
export function dirOfHeading(h) {
  const fx = Math.sin(h), fz = Math.cos(h);
  let best = 0, bd = -2;
  DIRS.forEach((v, k) => { const dp = v[0] * fx + v[1] * fz; if (dp > bd) { bd = dp; best = k; } });
  return best;
}

/** A random lane spawn point: node, direction and distance along the segment. */
export function randomLaneSpot(rng, nearX, nearZ, minD, maxD) {
  for (let tries = 0; tries < 30; tries++) {
    const i = rng.int(0, BLOCKS), j = rng.int(0, BLOCKS), d = rng.int(0, 3);
    if (!nodeValid(i + DIRS[d][0], j + DIRS[d][1])) continue;
    const along = rng.range(14, PITCH - 14);
    const [x, z] = lanePoint(i, j, d, along);
    const dd = Math.hypot(x - nearX, z - nearZ);
    if (dd >= minD && dd <= maxD) return { i, j, d, along, x, z, heading: headingOfDir(d) };
  }
  return null;
}
