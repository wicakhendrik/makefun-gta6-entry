// Crane's crew: hostile gunmen on foot, getaway drivers who flee across the grid and escort cars that ram.

import { dist, clamp, wrapAngle } from '../engine/math.js';
import { nearestNode, nodeValid, DIRS } from '../world/roads.js';
import { followRoad } from './traffic.js';
import { BLOCKS } from '../world/city.js';

export class GangSystem {
  constructor(game) { this.game = game; }

  update(dt) {
    const g = this.game;
    for (const h of g.humans) if (h.role === 'goon' || h.role === 'boss') this.thinkGunman(h, dt);
    for (const v of g.vehicles) {
      if (!v.ai) continue;
      if (v.ai.kind === 'flee') this.driveFlee(v, dt);
      else if (v.ai.kind === 'attack') this.driveAttack(v, dt);
    }
  }

  /** Take cover-ish positions at mid range and shoot when the player is in sight. */
  thinkGunman(h, dt) {
    const g = this.game, p = g.player;
    if (h.state === 'dead' || h.state === 'knocked' || h.vehicle) { h.wantX = 0; h.wantZ = 0; return; }
    const ai = h.ai;
    const d = dist(h.x, h.z, p.x, p.z);
    if (ai.mode === 'idle') {
      h.wantX = 0; h.wantZ = 0; h.aimYaw = null;
      if (d < (ai.alertRange || 30) || h.hp < h.maxHp) ai.mode = 'fight';
      return;
    }
    if (ai.mode === 'runaway') {
      const dx = h.x - p.x, dz = h.z - p.z, l = Math.hypot(dx, dz) || 1;
      let mx = dx / l, mz = dz / l;
      if (h.blocked) { const t = mx; mx = -mz; mz = t; }
      h.wantX = mx * 4.2; h.wantZ = mz * 4.2; h.aimYaw = null;
      if (d < 14 && Math.random() < dt * 0.8) ai.mode = 'fight';
      return;
    }
    const los = d < 80 && g.collision.lineOfSight(h.x, 1.6, h.z, p.x, 1.4, p.z);
    const dx = (p.x - h.x) / (d || 1), dz = (p.z - h.z) / (d || 1);
    h.aimYaw = Math.atan2(dx, dz);
    let mx, mz;
    const ideal = ai.range || 14;
    if (!los || d > ideal + 10) { mx = dx * 4.6; mz = dz * 4.6; }
    else if (d < ideal - 6) { mx = -dx * 2.2; mz = -dz * 2.2; }
    else { ai.strafe = ai.strafe || 1; mx = -dz * ai.strafe * 1.8; mz = dx * ai.strafe * 1.8; if (Math.random() < dt * 0.5) ai.strafe *= -1; }
    if (h.blocked) { const t = mx; mx = -mz; mz = t; }
    h.wantX = mx; h.wantZ = mz;
    if (los && d < 55 && p.alive) g.combat.npcShoot(h, p, d);
  }

  /** Getaway driving: at each junction take the exit that leads away from the player. */
  driveFlee(v, dt) {
    const g = this.game, p = g.player;
    if (!v.driver || v.driver.state === 'dead' || v.state !== 'ok') { v.input.throttle = 0; v.input.handbrake = true; return; }
    const ai = v.ai;
    const chooseNext = (i, j, d) => {
      let best = d, bestScore = -1e9;
      for (const nd of [d, (d + 1) % 4, (d + 3) % 4]) {
        const ni = i + DIRS[nd][0], nj = j + DIRS[nd][1];
        if (!nodeValid(ni, nj)) continue;
        const score = Math.hypot(ni * 80 - p.x, nj * 80 - p.z) + (nd === d ? 25 : 0) + Math.random() * 30 - (ni === 0 || nj === 0 || ni === BLOCKS || nj === BLOCKS ? 60 : 0);
        if (score > bestScore) { bestScore = score; best = nd; }
      }
      return best;
    };
    followRoad(v, ai, dt, g, { cruise: ai.cruise || 26, chooseNext, careful: false });
    if (v.speed < 1 && v.input.throttle > 0.5) ai.stuck = (ai.stuck || 0) + dt; else ai.stuck = 0;
    if (ai.stuck > 1.5) { ai.reverse = 1.2; ai.stuck = 0; }
    if (ai.reverse > 0) { ai.reverse -= dt; v.input.throttle = -1; v.input.steer = 0.6; }
  }

  /** Escort cars ram the player when close and follow the road toward them when far. */
  driveAttack(v, dt) {
    const g = this.game, p = g.player, ai = v.ai;
    if (!v.driver || v.driver.state === 'dead' || v.state !== 'ok') { v.input.throttle = 0; v.input.handbrake = true; return; }
    const tx = p.x, tz = p.z;
    const d = dist(v.x, v.z, tx, tz);
    if (ai.reverse > 0) { ai.reverse -= dt; v.input.throttle = -1; v.input.steer = 0.7; return; }
    if (d < 45 && g.collision.lineOfSight(v.x, 1.2, v.z, tx, 1.2, tz)) {
      const ang = wrapAngle(Math.atan2(tx - v.x, tz - v.z) - v.heading);
      v.input.steer = clamp(ang * 2.2, -1, 1); v.input.throttle = 1; v.input.handbrake = false;
      // the passenger leans out and shoots
      if (ai.gunner && d < 35) { ai.gunner.fireCooldown -= dt; ai.gunner.x = v.x; ai.gunner.z = v.z; ai.gunner.heading = Math.atan2(tx - v.x, tz - v.z); g.combat.npcShoot(ai.gunner, p, d); }
    } else {
      const [ti, tj] = nearestNode(tx, tz);
      followRoad(v, ai, dt, g, { cruise: 24, chooseNext: (i, j, dd) => {
        const di = ti - i, dj = tj - j;
        const want = Math.abs(di) >= Math.abs(dj) ? (di > 0 ? 0 : 2) : (dj > 0 ? 1 : 3);
        return nodeValid(i + DIRS[want][0], j + DIRS[want][1]) && want !== (dd + 2) % 4 ? want : dd;
      }, careful: false });
    }
    if (v.speed < 1 && v.input.throttle > 0.5) ai.stuck = (ai.stuck || 0) + dt; else ai.stuck = 0;
    if (ai.stuck > 1.5) { ai.reverse = 1.1; ai.stuck = 0; }
  }
}
