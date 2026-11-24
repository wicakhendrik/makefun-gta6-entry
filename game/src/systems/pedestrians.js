// Pedestrians: sidewalk loops around blocks, zebra crossings, beach strollers, panic and flight from danger.

import { makeRng, dist2, clamp } from '../engine/math.js';
import { BLOCKS, PITCH, blockMin, blockMax, BEACH_X0, SHORE_X, CITY_MAX, districtOfBlock } from '../world/city.js';
import { Human } from '../entities/humans.js';
import { SHIRTS } from '../entities/humanmodels.js';
import { hexColor } from '../engine/math.js';

export class PedestrianSystem {
  constructor(game) {
    this.game = game;
    this.rng = makeRng(777);
    this.maxPeds = 64;
    game.events.on('gunfire', (shooter, x, z) => this.scare(x, z, 38, shooter));
    game.events.on('humanKilled', (h) => this.scare(h.x, h.z, 22, h.lastAttacker));
    game.events.on('explosion', (x, z) => this.scare(x, z, 50, null));
  }

  ringCorner(bx, bz, k) {
    const x0 = blockMin(bx) + 1.8, x1 = blockMax(bx) - 1.8, z0 = blockMin(bz) + 1.8, z1 = blockMax(bz) - 1.8;
    return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]][((k % 4) + 4) % 4];
  }

  /** Spawn one pedestrian on a sidewalk (or the beach) at a distance from the player. */
  spawnPed(minD, maxD) {
    const g = this.game, p = g.player, rng = this.rng;
    for (let tries = 0; tries < 12; tries++) {
      const beach = rng() < 0.18;
      let x, z, ai;
      if (beach) {
        x = rng.range(BEACH_X0 + 8, SHORE_X - 22); z = rng.range(20, CITY_MAX - 20);
        ai = { mode: 'beach', tx: x, tz: z, wait: 0 };
      } else {
        const bx = rng.int(0, BLOCKS - 1), bz = rng.int(0, BLOCKS - 1);
        if (districtOfBlock(bx, bz) === 'docks' && rng() < 0.6) continue;
        const k = rng.int(0, 3), dir = rng() < 0.5 ? 1 : -1;
        const a = this.ringCorner(bx, bz, k), b = this.ringCorner(bx, bz, k + dir);
        const t = rng();
        x = a[0] + (b[0] - a[0]) * t; z = a[1] + (b[1] - a[1]) * t;
        ai = { mode: 'walk', bx, bz, k: k + dir, dir, wait: 0 };
      }
      const d = Math.sqrt(dist2(x, z, p.x, p.z));
      if (d < minD || d > maxD) continue;
      const looks = g.looks.civilians;
      const h = new Human('civ', x, z, rng.int(0, looks.length - 1), hexColor(rng.pick(SHIRTS)));
      h.ai = ai;
      h.walkSpeed = rng.range(1.2, 1.7);
      h.cash = rng.int(5, 60);
      g.humans.push(h);
      return h;
    }
    return null;
  }

  update(dt) {
    const g = this.game, p = g.player;
    let alive = 0;
    for (const h of g.humans) {
      if (h.role !== 'civ' || h.persistent) continue;
      const d2 = dist2(h.x, h.z, p.x, p.z);
      if (d2 > 190 * 190 || (h.state === 'dead' && g.time - h.deadTime > 40)) { h.gone = true; continue; }
      if (h.state !== 'dead') alive++;
      this.think(h, dt);
    }
    g.humans = g.humans.filter((h) => !h.gone);
    const want = g.isNight ? this.maxPeds * 0.6 : this.maxPeds;
    for (let k = 0; alive < want && k < 3; k++) if (this.spawnPed(alive < 20 ? 22 : 45, 150)) alive++;
  }

  think(h, dt) {
    if (h.state === 'dead' || h.state === 'knocked' || h.vehicle) { h.wantX = 0; h.wantZ = 0; return; }
    const ai = h.ai;
    if (h.state === 'flee') {
      if (!Number.isFinite(ai.flee)) ai.flee = 5;
      if (!Number.isFinite(ai.fx) || !Number.isFinite(ai.fz)) { ai.fx = h.x + 1; ai.fz = h.z; }
      ai.flee -= dt;
      const dx = h.x - ai.fx, dz = h.z - ai.fz, l = Math.hypot(dx, dz) || 1;
      let mx = dx / l, mz = dz / l;
      if (h.blocked) { ai.side = ai.side || (Math.random() < 0.5 ? 1 : -1); const t = mx; mx = -mz * ai.side; mz = t * ai.side; }
      h.wantX = mx * 5.2; h.wantZ = mz * 5.2;
      if (ai.flee <= 0) { h.state = 'walk'; if (ai.mode === 'walk') this.reattach(h); }
      return;
    }
    if (ai.wait > 0) { ai.wait -= dt; h.wantX = 0; h.wantZ = 0; return; }
    let tx, tz;
    if (ai.mode === 'beach') {
      tx = ai.tx; tz = ai.tz;
      if (dist2(h.x, h.z, tx, tz) < 1) {
        ai.tx = clamp(h.x + this.rng.range(-25, 25), BEACH_X0 + 6, SHORE_X - 22);
        ai.tz = clamp(h.z + this.rng.range(-40, 40), 10, CITY_MAX - 10);
        ai.wait = this.rng() < 0.4 ? this.rng.range(3, 9) : 0;
      }
    } else if (ai.mode === 'cross') {
      tx = ai.tx; tz = ai.tz;
      if (dist2(h.x, h.z, tx, tz) < 0.8) { ai.mode = 'walk'; ai.bx = ai.nbx; ai.bz = ai.nbz; ai.k = ai.nk; }
    } else {
      [tx, tz] = this.ringCorner(ai.bx, ai.bz, ai.k);
      if (dist2(h.x, h.z, tx, tz) < 0.8) {
        // at a corner: maybe cross the street to the neighbouring block
        if (this.rng() < 0.3) this.startCrossing(h);
        else { ai.k += ai.dir; if (this.rng() < 0.15) ai.wait = this.rng.range(2, 6); }
        return;
      }
    }
    const dx = tx - h.x, dz = tz - h.z, l = Math.hypot(dx, dz) || 1;
    h.wantX = (dx / l) * h.walkSpeed; h.wantZ = (dz / l) * h.walkSpeed;
  }

  startCrossing(h) {
    const ai = h.ai, k = ((ai.k % 4) + 4) % 4;
    // corner k of block: 0=(x0,z0) 1=(x1,z0) 2=(x1,z1) 3=(x0,z1); cross along the side we were walking
    const options = [];
    const dxs = k === 1 || k === 2 ? 1 : -1, dzs = k >= 2 ? 1 : -1;
    if (ai.bx + dxs >= 0 && ai.bx + dxs < BLOCKS) options.push([ai.bx + dxs, ai.bz, k === 1 ? 0 : k === 2 ? 3 : k === 0 ? 1 : 2]);
    if (ai.bz + dzs >= 0 && ai.bz + dzs < BLOCKS) options.push([ai.bx, ai.bz + dzs, k === 3 ? 0 : k === 2 ? 1 : k === 0 ? 3 : 2]);
    if (!options.length) { ai.k += ai.dir; return; }
    const [nbx, nbz, nk] = this.rng.pick(options);
    const [tx, tz] = this.ringCorner(nbx, nbz, nk);
    Object.assign(ai, { mode: 'cross', tx, tz, nbx, nbz, nk });
  }

  reattach(h) {
    const bx = clamp(Math.floor(h.x / PITCH), 0, BLOCKS - 1), bz = clamp(Math.floor(h.z / PITCH), 0, BLOCKS - 1);
    h.ai = { mode: 'walk', bx, bz, k: this.rng.int(0, 3), dir: 1, wait: 0 };
  }

  /** Everyone near (x, z) runs away; some scream. */
  scare(x, z, radius, source) {
    const g = this.game;
    let screams = 0;
    for (const h of g.humans) {
      if (h.role !== 'civ' || h.state === 'dead' || h.vehicle) continue;
      if (dist2(h.x, h.z, x, z) > radius * radius) continue;
      h.state = 'flee';
      h.ai.flee = 6 + Math.random() * 4;
      h.ai.fx = source ? source.x : x; h.ai.fz = source ? source.z : z;
      if (screams < 1 && Math.random() < 0.35) { g.audio.scream(h.x, h.z); screams++; }
    }
    g.traffic.panicNear(x, z, radius);
  }
}
