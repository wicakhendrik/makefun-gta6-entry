// Weapons and hitscan combat: bullets against people, cars and buildings; melee; explosions and blast damage.

import { rayBox } from '../world/collision.js';

export const WEAPONS = {
  fist: { name: 'Fists', melee: true, dmg: 16, rate: 0.42, range: 1.8, slot: 1 },
  bat: { name: 'Gaff Bat', melee: true, dmg: 42, rate: 0.6, range: 2.4, slot: 2, knock: 6, price: 250 },
  pistol: { name: 'Hornet 9', dmg: 30, rate: 0.24, spread: 0.012, range: 120, pellets: 1, sound: 'pistol', price: 400, ammoPack: 36, clip: 12, reload: 1.1, slot: 3 },
  smg: { name: 'Wasp MP', dmg: 17, rate: 0.075, spread: 0.04, range: 90, pellets: 1, auto: true, sound: 'smg', price: 1500, ammoPack: 90, clip: 30, reload: 1.5, slot: 4 },
  shotgun: { name: 'Mako 12', dmg: 16, rate: 0.85, spread: 0.085, range: 45, pellets: 8, sound: 'shotgun', price: 2200, ammoPack: 16, clip: 6, reload: 2.2, slot: 5 },
  rifle: { name: 'Sable AR', dmg: 32, rate: 0.11, spread: 0.016, range: 170, pellets: 1, auto: true, sound: 'rifle', price: 4500, ammoPack: 60, clip: 30, reload: 1.8, slot: 6 },
  launcher: { name: 'Pelican RL', dmg: 0, rate: 1.1, spread: 0.004, range: 220, pellets: 0, rocket: true, sound: 'rocket', price: 9000, ammoPack: 4, clip: 1, reload: 1.6, slot: 7 },
};
export const WEAPON_ORDER = ['fist', 'bat', 'pistol', 'smg', 'shotgun', 'rifle', 'launcher'];

/** Rounds loaded in the current clip (the rest of p.ammo is the reserve). */
export function clipOf(h, w) {
  const spec = WEAPONS[w];
  if (!spec || !spec.clip || !h.ammo) return 0;
  if (!h.clip) h.clip = {};
  if (h.clip[w] === undefined) h.clip[w] = Math.min(spec.clip, h.ammo[w] || 0);
  return Math.min(h.clip[w], h.ammo[w] || 0);
}

export class CombatSystem {
  constructor(game) {
    this.game = game;
  }

  /**
   * Fire the shooter's weapon along a ray. ox..oz is where the bullet starts (camera-corrected for the player),
   * mx..mz is the muzzle used for the tracer. Returns true if a shot was fired.
   */
  fire(shooter, ox, oy, oz, dx, dy, dz, mx, my, mz) {
    const w = WEAPONS[shooter.weapon];
    if (!w || shooter.fireCooldown > 0) return false;
    if (w.melee) return this.melee(shooter);
    if (shooter.ammo) {
      if (shooter.reloading > 0) return false;
      if ((shooter.ammo[shooter.weapon] || 0) <= 0) { this.game.audio.dryFire(); shooter.fireCooldown = 0.3; return false; }
      if (clipOf(shooter, shooter.weapon) <= 0) { this.startReload(shooter); return false; }
      shooter.ammo[shooter.weapon]--;
      shooter.clip[shooter.weapon]--;
      if (shooter.clip[shooter.weapon] <= 0 && shooter.ammo[shooter.weapon] > 0) this.startReload(shooter);
    }
    shooter.fireCooldown = w.rate;
    const g = this.game;
    g.fx.muzzle(mx, my, mz);
    g.audio.gunshot(w.sound, mx, mz, shooter.isPlayer);
    if (w.rocket) {
      g.rockets.launch(shooter, mx, my, mz, dx, dy, dz);
      g.events.emit('gunfire', shooter, ox, oz);
      return true;
    }
    for (let k = 0; k < w.pellets; k++) {
      const s = w.spread * (shooter.isPlayer ? (g.camera.aiming ? 0.5 : 1) : 1);
      let ex = dx + (Math.random() - 0.5) * 2 * s, ey = dy + (Math.random() - 0.5) * 2 * s, ez = dz + (Math.random() - 0.5) * 2 * s;
      const l = Math.hypot(ex, ey, ez); ex /= l; ey /= l; ez /= l;
      const hit = this.trace(shooter, ox, oy, oz, ex, ey, ez, w.range);
      const hx = ox + ex * hit.t, hy = oy + ey * hit.t, hz = oz + ez * hit.t;
      g.fx.tracer(mx, my, mz, hx, hy, hz);
      if (hit.human) {
        const head = hy - hit.human.y > 1.55;
        hit.human.takeDamage(w.dmg * (head ? 2.2 : 1), g, shooter, 'bullet');
        g.fx.blood(hx, hy, hz);
        if (shooter.isPlayer) g.events.emit('playerHit', hit.human, head);
      } else if (hit.vehicle) {
        hit.vehicle.damage(w.dmg * 0.7, g, shooter);
        g.fx.sparks(hx, hy, hz, 3);
        if (hit.vehicle.driver && !hit.vehicle.driver.isPlayer && Math.random() < 0.25) hit.vehicle.driver.takeDamage(w.dmg * 0.5, g, shooter);
        if (shooter.isPlayer) g.events.emit('playerHit', null, false);
      } else if (hit.heli) {
        g.police.heli.hp -= w.dmg;
        g.fx.sparks(hx, hy, hz, 4);
        g.events.emit('playerHit', null, false);
      } else if (hit.t < w.range) {
        g.fx.impact(hx, hy, hz);
      }
    }
    g.events.emit('gunfire', shooter, ox, oz);
    return true;
  }

  /** Begin reloading the shooter's current weapon; the clip refills when the timer runs out. */
  startReload(h) {
    const w = WEAPONS[h.weapon];
    if (!w || !w.clip || h.reloading > 0) return;
    const loaded = clipOf(h, h.weapon), have = h.ammo[h.weapon] || 0;
    if (loaded >= Math.min(w.clip, have)) return;
    h.reloading = w.reload;
    h.reloadWeapon = h.weapon;
    if (h.isPlayer) this.game.audio.reload();
  }

  /** Tick the reload timer and refill the clip from the reserve. */
  updateReload(h, dt) {
    if (!(h.reloading > 0)) return;
    if (h.reloadWeapon !== h.weapon) { h.reloading = 0; return; }
    h.reloading -= dt;
    if (h.reloading <= 0) {
      h.reloading = 0;
      h.clip[h.weapon] = Math.min(WEAPONS[h.weapon].clip, h.ammo[h.weapon] || 0);
    }
  }

  /** Nearest thing a ray meets: a person (vertical capsule), a car (oriented box) or the static world. */
  trace(shooter, ox, oy, oz, dx, dy, dz, range) {
    const g = this.game;
    let best = { t: g.collision.raycast(ox, oy, oz, dx, dy, dz, range) };
    const dxz2 = dx * dx + dz * dz;
    for (const h of g.humans) {
      if (h === shooter || h.state === 'dead' || h.vehicle) continue;
      const rx = h.x - ox, rz = h.z - oz;
      if (rx * rx + rz * rz > (best.t + 2) * (best.t + 2)) continue;
      const t = dxz2 > 1e-6 ? (rx * dx + rz * dz) / dxz2 : 0;
      if (t < 0 || t > best.t) continue;
      const px = ox + dx * t - h.x, pz = oz + dz * t - h.z;
      const y = oy + dy * t - h.y;
      const radius = h.state === 'knocked' ? 0.7 : 0.42;
      if (px * px + pz * pz < radius * radius && y > -0.1 && y < 1.95) best = { t, human: h };
    }
    for (const v of g.vehicles) {
      if (shooter.vehicle === v || v.state === 'wreck' && Math.random() < 0.5) continue;
      const rx = v.x - ox, rz = v.z - oz;
      if (rx * rx + rz * rz > (best.t + 6) * (best.t + 6)) continue;
      const c = Math.cos(v.heading), s = Math.sin(v.heading);
      // world -> local (inverse yaw)
      const lox = (ox - v.x) * c - (oz - v.z) * s, loz = (ox - v.x) * s + (oz - v.z) * c;
      const ldx = dx * c - dz * s, ldz = dx * s + dz * c;
      const hw = v.spec.wid / 2, hl = v.spec.len / 2;
      const t = rayBox(lox, oy, loz, ldx, dy, ldz, -hw, 0.2, -hl, hw, v.spec.hgt, hl);
      if (t >= 0 && t < best.t) best = { t, vehicle: v };
    }
    if (shooter.isPlayer) {
      const th = g.police.hitHeli(ox, oy, oz, dx, dy, dz, best.t);
      if (th >= 0) { best = { t: th, heli: true }; }
    }
    return best;
  }

  /** NPC gunfire with accuracy that drops with distance and target speed. */
  npcShoot(h, target, d) {
    const g = this.game;
    if (h.fireCooldown > 0) return;
    const tv = target.vehicle;
    const tx = tv ? tv.x : target.x, tz = tv ? tv.z : target.z, ty = tv ? 1.0 : target.y + 1.2;
    const moving = tv ? tv.speed : Math.hypot(target.vx, target.vz);
    const miss = 0.04 + d * 0.004 + moving * 0.006;
    const ox = h.x + Math.sin(h.heading) * 0.5, oz = h.z + Math.cos(h.heading) * 0.5, oy = 1.45;
    let dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const l = Math.hypot(dx, dy, dz);
    dx = dx / l + (Math.random() - 0.5) * miss * 2; dy = dy / l + (Math.random() - 0.5) * miss; dz = dz / l + (Math.random() - 0.5) * miss * 2;
    const n = Math.hypot(dx, dy, dz);
    g.combat.fire(h, ox, oy, oz, dx / n, dy / n, dz / n, ox, oy, oz);
    h.fireCooldown += 0.35 + Math.random() * 0.6;
    if (tv && Math.random() < 0.15) target.takeDamage(3, g, h, 'bullet');
  }

  melee(shooter) {
    const g = this.game;
    const w = WEAPONS[shooter.weapon] && WEAPONS[shooter.weapon].melee ? WEAPONS[shooter.weapon] : WEAPONS.fist;
    shooter.fireCooldown = w.rate;
    shooter.punch = 0.25;
    let target = null, bestD = w.range;
    for (const h of g.humans) {
      if (h === shooter || !h.onFoot) continue;
      const d = Math.hypot(h.x - shooter.x, h.z - shooter.z);
      if (d < bestD && Math.abs(shooter.angleTo(h.x, h.z)) < 0.9) { bestD = d; target = h; }
    }
    g.audio.swing();
    if (target) {
      target.takeDamage(w.dmg, g, shooter, 'melee');
      const fx = Math.sin(shooter.heading), fz = Math.cos(shooter.heading);
      if (w.knock && target.state !== 'dead') target.knock(fx * w.knock, fz * w.knock, 2.5, g);
      else if (target.state !== 'dead') { target.vx += fx * 3; target.vz += fz * 3; }
      else target.knock(fx * 4, fz * 4, 2, g);
      g.audio.punch(target.x, target.z);
      if (shooter.isPlayer) g.events.emit('playerHit', target, false);
      g.events.emit('assault', shooter, target);
    }
    return true;
  }

  /** Area damage and knockback around an explosion. */
  blast(x, z, radius, damage, attacker, source) {
    const g = this.game;
    for (const h of g.humans) {
      if (h.state === 'dead' && h.y <= 0) continue;
      const d = Math.hypot(h.x - x, h.z - z);
      if (d > radius) continue;
      const k = 1 - d / radius;
      if (h.vehicle) { if (h.vehicle !== source) continue; }
      h.takeDamage(damage * k, g, attacker, 'blast');
      const nx = (h.x - x) / (d || 1), nz = (h.z - z) / (d || 1);
      h.knock(nx * 12 * k, nz * 12 * k, 6 * k + 2, g);
    }
    for (const v of g.vehicles) {
      if (v === source) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d > radius * 1.4) continue;
      const k = 1 - d / (radius * 1.4);
      v.damage(damage * 2.2 * k, g, attacker);
      v.vx += ((v.x - x) / (d || 1)) * 10 * k; v.vz += ((v.z - z) / (d || 1)) * 10 * k;
      v.bump = 1;
    }
  }
}
