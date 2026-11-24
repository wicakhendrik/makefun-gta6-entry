// Vehicles: the lineup of Port Solara's own makes, arcade driving physics, damage, fire and explosions.

import { clamp, wrapAngle, hexColor, modelYaw, modelEuler } from '../engine/math.js';

export const VEHICLE_TYPES = {
  vanta: { name: 'Kestrel Vanta', cls: 'Sports', shape: 'sports', len: 4.5, wid: 1.95, hgt: 1.18, accel: 16, top: 60, grip: 8, steer: 2.5, mass: 1300, hp: 850, value: 4000, colors: ['#e8322e', '#ffcc22', '#1fa0ff', '#f4f4f4', '#18181c', '#ff6a1a'] },
  riviera: { name: 'Solano Riviera', cls: 'Coupe', shape: 'sports', len: 4.6, wid: 1.9, hgt: 1.25, accel: 13, top: 52, grip: 7.2, steer: 2.3, mass: 1400, hp: 900, value: 2600, colors: ['#9fe3c8', '#f7a8b8', '#ffffff', '#6a4cd8', '#2aa8b8'] },
  bayside: { name: 'Marlin Bayside', cls: 'Sedan', shape: 'sedan', len: 4.8, wid: 1.9, hgt: 1.48, accel: 10, top: 44, grip: 6.4, steer: 2.1, mass: 1500, hp: 1000, value: 1400, colors: ['#3b5b8c', '#c8c8c8', '#6b1f2a', '#2f4f3f', '#d8d0bc', '#1f1f24'] },
  cub: { name: 'Tamarind Cub', cls: 'Compact', shape: 'hatch', len: 3.9, wid: 1.75, hgt: 1.52, accel: 9.5, top: 39, grip: 6.6, steer: 2.6, mass: 1050, hp: 800, value: 900, colors: ['#ffb02a', '#5ac8fa', '#ff5f6d', '#9bd34a', '#f4f4f4'] },
  hauler: { name: 'Orca Hauler', cls: 'Van', shape: 'van', len: 5.6, wid: 2.2, hgt: 2.5, accel: 7, top: 33, grip: 5.4, steer: 1.7, mass: 2600, hp: 1500, value: 1200, colors: ['#f2f2f2', '#2f6fc8', '#e0a82e', '#7d8b78'] },
  ranchero: { name: 'Gannet Ranchero', cls: 'Pickup', shape: 'pickup', len: 5.2, wid: 2.0, hgt: 1.85, accel: 10.5, top: 43, grip: 6.0, steer: 1.95, mass: 2000, hp: 1300, value: 2000, colors: ['#8c2f22', '#2f3f5c', '#d8c49a', '#3a3a3a', '#5c7a3a'] },
  cab: { name: 'Brisa Cab', cls: 'Taxi', shape: 'sedan', len: 4.8, wid: 1.9, hgt: 1.48, accel: 10, top: 43, grip: 6.4, steer: 2.1, mass: 1500, hp: 1000, value: 1100, taxi: true, colors: ['#f6c445'] },
  interceptor: { name: 'SPD Interceptor', cls: 'Police', shape: 'sedan', len: 4.9, wid: 1.95, hgt: 1.48, accel: 14, top: 56, grip: 7.4, steer: 2.25, mass: 1750, hp: 1300, value: 3000, police: true, colors: ['#f4f6f8'] },
  bike: { name: 'Kite S600', cls: 'Motorbike', shape: 'bike', bike: true, len: 2.2, wid: 0.8, hgt: 1.15, accel: 17, top: 62, grip: 8.2, steer: 2.9, mass: 260, hp: 480, value: 1800, colors: ['#ff3fa4', '#36f2ff', '#ffcc22', '#f4f4f4', '#18181c', '#3dff8e'] },
  regent: { name: 'Crane Regent', cls: 'Limousine', shape: 'limo', len: 6.8, wid: 2.0, hgt: 1.5, accel: 9, top: 46, grip: 5.8, steer: 1.6, mass: 2600, hp: 2200, value: 5000, colors: ['#101014'] },
};

export const TRAFFIC_MIX = ['bayside', 'bayside', 'cub', 'cub', 'hauler', 'ranchero', 'cab', 'riviera', 'vanta', 'bayside', 'cub', 'cab', 'bike', 'bike'];

let nextVehicleId = 1;

export class Vehicle {
  constructor(typeKey, x, z, heading, colorHex) {
    this.id = nextVehicleId++;
    this.type = typeKey;
    this.spec = VEHICLE_TYPES[typeKey];
    this.x = x; this.z = z; this.y = 0;
    this.heading = heading;
    this.vx = 0; this.vz = 0; this.yawRate = 0;
    this.color = hexColor(colorHex || this.spec.colors[0]);
    this.tint = new Float32Array(this.color);
    this.health = this.spec.hp;
    this.driver = null;
    this.input = { throttle: 0, steer: 0, handbrake: false };
    this.steer = 0;
    this.state = 'ok'; // ok | burning | wreck
    this.burnTime = 0;
    this.sirenOn = false;
    this.skid = 0;
    this.horn = 0;
    this.persistent = false;
    this.parked = false;
    this.ai = null;
    this.model = new Float32Array(16);
    this.lastImpact = 0;
    this.bump = 0;
    this.radius = Math.max(this.spec.len, this.spec.wid) / 2;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get forwardSpeed() { return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading); }
  get fx() { return Math.sin(this.heading); }
  get fz() { return Math.cos(this.heading); }

  /** Arcade bicycle model: throttle along the heading, lateral grip, speed-scaled steering. */
  update(dt, game) {
    const s = this.spec;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz;
    let vr = this.vx * rx + this.vz * rz;
    const inp = this.state === 'ok' ? this.input : { throttle: 0, steer: 0, handbrake: true };
    const healthK = this.health < s.hp * 0.25 ? 0.6 : 1;

    // engine and brakes
    if (inp.throttle > 0) {
      if (vf < -0.5) vf += 22 * dt * inp.throttle;
      else vf += s.accel * healthK * inp.throttle * dt * clamp(1 - vf / s.top, 0.05, 1);
    } else if (inp.throttle < 0) {
      if (vf > 0.5) vf += 24 * dt * inp.throttle;
      else vf = Math.max(vf + s.accel * 0.6 * inp.throttle * dt, -s.top * 0.3);
    } else {
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.2 * dt);
    }
    vf -= vf * Math.abs(vf) * 0.0009 * dt * 10;

    // lateral grip; handbrake lets the rear slide
    const grip = inp.handbrake ? 1.4 : s.grip;
    const prevVr = vr;
    vr *= Math.exp(-grip * dt);
    if (inp.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 6 * dt);
    this.skid = Math.min(1, Math.abs(prevVr) / 6 + (inp.handbrake && Math.abs(vf) > 8 ? 0.6 : 0));

    // steering
    this.steer += (inp.steer - this.steer) * Math.min(1, dt * 8);
    const speedK = clamp(Math.abs(vf) / 6, 0, 1) * clamp(1.25 - Math.abs(vf) / (s.top * 1.6), 0.45, 1);
    const targetYaw = this.steer * s.steer * speedK * Math.sign(vf || 1) * (inp.handbrake ? 1.35 : 1);
    this.yawRate += (targetYaw - this.yawRate) * Math.min(1, dt * 10);
    this.heading = wrapAngle(this.heading + this.yawRate * dt);

    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    const nrx = -nfz, nrz = nfx;
    this.vx = nfx * vf + nrx * vr;
    this.vz = nfz * vf + nrz * vr;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.collideStatic(game);
    this.bump = Math.max(0, this.bump - dt * 3);
    if (this.horn > 0) this.horn -= dt;

    if (this.state === 'burning') {
      this.burnTime -= dt;
      if (Math.random() < dt * 30) game.fx.fire(this.x, 1.2, this.z);
      if (this.burnTime <= 0) this.explode(game);
    } else if (this.state === 'ok' && this.health < s.hp * 0.3 && Math.random() < dt * (this.health < s.hp * 0.15 ? 20 : 6)) {
      game.fx.smoke(this.x + nfx * s.len * 0.4, 1.1, this.z + nfz * s.len * 0.4, this.health < s.hp * 0.15);
    }
  }

  /** Three circles along the body against buildings and walls. */
  collideStatic(game) {
    const s = this.spec, fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const r = s.wid / 2;
    const offs = [s.len / 2 - r, 0, -(s.len / 2 - r)];
    for (const o of offs) {
      const cx = this.x + fx * o, cz = this.z + fz * o;
      const hit = game.collision.resolveCircle(cx, cz, r);
      if (!hit) continue;
      this.x += hit.px; this.z += hit.pz;
      const len = Math.hypot(hit.px, hit.pz) || 1;
      const nx = hit.px / len, nz = hit.pz / len;
      const vn = this.vx * nx + this.vz * nz;
      if (vn < 0) {
        this.vx -= nx * vn * 1.3; this.vz -= nz * vn * 1.3;
        this.vx *= 0.92; this.vz *= 0.92;
        this.yawRate += (o > 0 ? 1 : o < 0 ? -1 : 0) * (fx * nz - fz * nx) * Math.min(2, -vn * 0.08);
        this.impact(-vn, game, null);
      }
    }
  }

  impact(speed, game, other) {
    if (speed < 3) return;
    const dmg = (speed - 3) * 16;
    this.damage(dmg, game, other && other.driver);
    this.bump = Math.min(1, speed / 15);
    if (game.time - this.lastImpact > 0.25) {
      this.lastImpact = game.time;
      game.audio.crash(Math.min(1, speed / 20), this.x, this.z);
      if (speed > 8) game.fx.sparks(this.x, 0.8, this.z, Math.floor(speed / 2));
    }
  }

  damage(amount, game, attacker) {
    if (this.state !== 'ok') return;
    this.health -= amount;
    if (attacker && attacker.isPlayer && this.spec.police) game.police.crime('copcar', 0.4);
    if (this.health <= 0) {
      this.state = 'burning';
      this.burnTime = 3.5 + Math.random() * 2;
      this.killedBy = attacker;
    }
  }

  explode(game) {
    this.state = 'wreck';
    this.color = [0.12, 0.11, 0.1];
    this.tint.set(this.color);
    this.vx *= 0.2; this.vz *= 0.2;
    game.fx.explosion(this.x, 1, this.z);
    game.audio.explosion(this.x, this.z);
    game.camera.shake(Math.max(0, 1.2 - Math.hypot(game.player.x - this.x, game.player.z - this.z) / 60));
    game.combat.blast(this.x, this.z, 8, 140, this.killedBy, this);
    if (this.driver) this.driver.ejectDead?.(game, this);
    if (this.killedBy && this.killedBy.isPlayer) game.police.crime(this.spec.police ? 'copcar' : 'explode', this.spec.police ? 3 : 1);
    game.events.emit('vehicleDestroyed', this);
    this.wreckTime = game.time;
  }

  modelMatrix() {
    const bounce = Math.sin(performance.now() * 0.04) * 0.03 * this.bump;
    if (this.spec.bike) {
      // motorbikes lean into the turn, more at speed; a parked bike rests on its stand
      const want = this.driver ? clamp(-this.steer * Math.abs(this.forwardSpeed) / 22, -0.5, 0.5) : 0.18;
      this.lean = (this.lean || 0) + (want - (this.lean || 0)) * 0.15;
      return modelEuler(this.model, this.x, this.y + bounce, this.z, this.heading, 0, this.lean);
    }
    return modelYaw(this.model, this.x, this.y + bounce, this.z, this.heading);
  }

  /** Door position on the driver's (left) side where a person gets in or out. */
  doorPoint() {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const lx = fz, lz = -fx; // left = -right
    const off = this.spec.wid / 2 + 0.9;
    return [this.x + lx * off + fx * 0.3, this.z + lz * off + fz * 0.3];
  }
}

/** Pairwise car collisions with mass-weighted impulses (oriented boxes approximated by circle pairs). */
export function collideVehicles(list, game) {
  for (let a = 0; a < list.length; a++) {
    const A = list[a];
    for (let b = a + 1; b < list.length; b++) {
      const B = list[b];
      const dx0 = B.x - A.x, dz0 = B.z - A.z;
      const reach = A.radius + B.radius;
      if (dx0 * dx0 + dz0 * dz0 > reach * reach) continue;
      const ca = circles(A), cb = circles(B);
      let best = null;
      for (const p of ca) for (const q of cb) {
        const dx = q[0] - p[0], dz = q[1] - p[1], rr = p[2] + q[2];
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && (!best || rr - Math.sqrt(d2) > best.pen)) {
          const d = Math.sqrt(d2) || 0.01;
          best = { nx: dx / d, nz: dz / d, pen: rr - d };
        }
      }
      if (!best) continue;
      const ma = A.parked && !A.driver ? A.spec.mass * 1.5 : A.spec.mass, mb = B.parked && !B.driver ? B.spec.mass * 1.5 : B.spec.mass;
      const ta = mb / (ma + mb), tb = ma / (ma + mb);
      A.x -= best.nx * best.pen * ta; A.z -= best.nz * best.pen * ta;
      B.x += best.nx * best.pen * tb; B.z += best.nz * best.pen * tb;
      const rvx = B.vx - A.vx, rvz = B.vz - A.vz;
      const vn = rvx * best.nx + rvz * best.nz;
      if (vn < 0) {
        const j = -(1 + 0.35) * vn / (1 / ma + 1 / mb);
        A.vx -= (j / ma) * best.nx; A.vz -= (j / ma) * best.nz;
        B.vx += (j / mb) * best.nx; B.vz += (j / mb) * best.nz;
        A.parked = false; B.parked = false;
        A.impact(-vn * ta * 1.4, game, B);
        B.impact(-vn * tb * 1.4, game, A);
        game.events.emit('vehicleHit', A, B, -vn);
      }
    }
  }
}

function circles(v) {
  const s = v.spec, r = s.wid / 2, fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const o = s.len / 2 - r;
  return [[v.x + fx * o, v.z + fz * o, r], [v.x, v.z, r], [v.x - fx * o, v.z - fz * o, r]];
}
