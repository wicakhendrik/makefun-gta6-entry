// Weapons and hitscan combat: bullets against people, cars and buildings; melee; explosions and blast damage.

import { rayBox } from '../world/collision.js';

export const WEAPONS = {
  fist: { name: 'Fists', melee: true, dmg: 16, rate: 0.42, range: 1.8 },
  bat: { name: 'Palmwood Bat', melee: true, dmg: 38, rate: 0.62, range: 2.4, price: 250 },
  pistol: { name: 'Hornet 9', dmg: 30, rate: 0.24, spread: 0.012, range: 120, pellets: 1, sound: 'pistol', price: 400, ammoPack: 36, clip: 12, reload: 1.1 },
  smg: { name: 'Wasp MP', dmg: 17, rate: 0.075, spread: 0.04, range: 90, pellets: 1, auto: true, sound: 'smg', price: 1500, ammoPack: 90, clip: 30, reload: 1.5 },
  shotgun: { name: 'Mako 12', dmg: 16, rate: 0.85, spread: 0.085, range: 45, pellets: 8, sound: 'shotgun', price: 2200, ammoPack: 16, clip: 6, reload: 2.1 },
  rifle: { name: 'Sable AR', dmg: 32, rate: 0.11, spread: 0.016, range: 170, pellets: 1, auto: true, sound: 'rifle', price: 4500, ammoPack: 60, clip: 30, reload: 1.8 },
  launcher: { name: 'Comet RL', dmg: 160, rate: 1.1, spread: 0.004, range: 240, pellets: 1, rocket: true, sound: 'shotgun', price: 9000, ammoPack: 4, clip: 1, reload: 2.4 },
};
export const WEAPON_ORDER = ['fist', 'bat', 'pistol', 'smg', 'shotgun', 'rifle', 'launcher'];

/** Rounds loaded in the clip of a player's weapon (ammo counts every round carried, the clip included). */
export function magOf(p, w) {
  const spec = WEAPONS[w];
  if (!spec || spec.melee || !p.mag) return 0;
  const ammo = p.ammo[w] || 0;
  if (p.mag[w] === undefined || p.mag[w] > ammo) p.mag[w] = Math.min(spec.clip || ammo, ammo);
  return p.mag[w];
}

/** Start a reload if the clip is not full and there are rounds left to load. */
export function startReload(p, game) {
  const spec = WEAPONS[p.weapon];
  if (!spec || spec.melee || p.reloading > 0) return false;
  const ammo = p.ammo[p.weapon] || 0, mag = magOf(p, p.weapon);
  if (mag >= Math.min(spec.clip, ammo)) return false;
  p.reloading = spec.reload; p.reloadMax = spec.reload; p.reloadWeapon = p.weapon;
  if (game) game.audio.weaponSwitch();
  return true;
}

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.rockets = [];
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
      if (shooter.mag) {
        if (magOf(shooter, shooter.weapon) <= 0) { startReload(shooter, this.game); return false; }
        shooter.mag[shooter.weapon]--;
      }
      shooter.ammo[shooter.weapon]--;
    }
    shooter.fireCooldown = w.rate;
    const g = this.game;
    g.fx.muzzle(mx, my, mz);
    g.audio.gunshot(w.sound, mx, mz, shooter.isPlayer);
    if (shooter.mag && magOf(shooter, shooter.weapon) <= 0) startReload(shooter, g);
    if (w.rocket) {
      this.rockets.push({ x: mx, y: my, z: mz, dx, dy, dz, speed: 55, life: 4.5, owner: shooter, trail: 0 });
      for (let k = 0; k < 6; k++) g.fx.smoke(mx - dx * 1.5, my, mz - dz * 1.5);
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
      const push = w === WEAPONS.fist ? 1 : 1.8;
      if (target.state !== 'dead') { target.vx += fx * 3 * push; target.vz += fz * 3 * push; }
      else target.knock(fx * 4 * push, fz * 4 * push, 2 * push, g);
      g.audio.punch(target.x, target.z);
      if (shooter.isPlayer) g.events.emit('playerHit', target, false);
      g.events.emit('assault', shooter, target);
    }
    return true;
  }

  /** Rockets fly straight, trail smoke and burst on the first person, car, wall or the ground they meet. */
  update(dt) {
    const g = this.game;
    for (const r of this.rockets) {
      r.life -= dt;
      const step = r.speed * dt;
      const hit = this.trace(r.owner, r.x, r.y, r.z, r.dx, r.dy, r.dz, step);
      const groundT = r.dy < 0 ? (r.y - 0.15) / -r.dy : Infinity;
      const t = Math.min(hit.t, groundT);
      if (t < step || r.life <= 0) {
        const tt = Math.min(t, step);
        this.detonate(r.x + r.dx * tt, Math.max(0.3, r.y + r.dy * tt), r.z + r.dz * tt, r.owner, hit.vehicle);
        if (hit.heli && g.police.heli) g.police.heli.hp -= 400;
        r.life = -1;
        continue;
      }
      r.x += r.dx * step; r.y += r.dy * step; r.z += r.dz * step;
      r.trail -= dt;
      if (r.trail <= 0) { r.trail = 0.02; g.fx.smoke(r.x - r.dx, r.y, r.z - r.dz); }
    }
    this.rockets = this.rockets.filter((r) => r.life > 0);
  }

  detonate(x, y, z, owner, vehicle) {
    const g = this.game;
    g.fx.explosion(x, y, z);
    g.audio.explosion(x, z);
    this.blast(x, z, 9, WEAPONS.launcher.dmg, owner, null);
    if (vehicle) vehicle.damage(9999, g, owner);
    const p = g.player;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < 60) g.camera.shake(Math.max(0.15, 0.9 - d / 60));
    g.events.emit('explosion', x, z);
    if (owner && owner.isPlayer && g.police.witnesses(x, z, 60)) g.police.crime('explode');
  }

  render(r, right, up) {
    for (const k of this.rockets) {
      r.billboard(k.x, k.y, k.z, 0.7, 2.2, 1.3, 0.5, 0, right, up);
      r.streak(k.x, k.y, k.z, k.x - k.dx * 3, k.y - k.dy * 3, k.z - k.dz * 3, 0.18, 1.6, 0.8, 0.3, 0);
    }
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
