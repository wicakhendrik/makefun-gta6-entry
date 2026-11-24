// People on foot: movement, collision, walk cycle, health/armor, knockdown and death. AI lives in the systems.

import { clamp, wrapAngle, approachAngle, modelYaw, modelEuler } from '../engine/math.js';

let nextHumanId = 1;

export class Human {
  constructor(role, x, z, look, shirt) {
    this.id = nextHumanId++;
    this.role = role; // civ | cop | goon | player | boss
    this.x = x; this.z = z; this.y = 0;
    this.heading = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.wantX = 0; this.wantZ = 0; // desired velocity this frame
    this.maxHp = role === 'player' ? 100 : role === 'cop' ? 70 : role === 'goon' ? 80 : role === 'boss' ? 260 : 45;
    this.hp = this.maxHp;
    this.armor = 0;
    this.look = look;
    this.tint = new Float32Array(shirt || [1, 1, 1]);
    this.phase = Math.random() * 6;
    this.swing = 0;
    this.state = 'walk'; // walk | idle | flee | dead | knocked | driving | attack
    this.vehicle = null;
    this.weapon = 'fist';
    this.fireCooldown = 0;
    this.ai = {};
    this.deadTime = 0;
    this.knockTime = 0;
    this.spin = 0;
    this.model = new Float32Array(16);
    this.persistent = false;
    this.isPlayer = role === 'player';
    this.aimYaw = null;
    this.hitFlash = 0;
  }

  get alive() { return this.state !== 'dead'; }
  get onFoot() { return !this.vehicle && this.state !== 'dead'; }

  update(dt, game) {
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.vehicle) { this.x = this.vehicle.x; this.z = this.vehicle.z; return; }
    if (this.state === 'dead') {
      if (this.y > 0 || this.vy !== 0) this.fly(dt, game);
      return;
    }
    if (this.state === 'knocked') {
      this.fly(dt, game);
      this.knockTime -= dt;
      if (this.knockTime <= 0 && this.y <= 0) this.state = this.isPlayer ? 'walk' : 'flee';
      return;
    }
    // accelerate toward the wanted velocity
    const k = Math.min(1, dt * 10);
    this.vx += (this.wantX - this.vx) * k;
    this.vz += (this.wantZ - this.vz) * k;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    const hit = game.collision.resolveCircle(this.x, this.z, 0.35);
    if (hit) { this.x += hit.px; this.z += hit.pz; this.blocked = true; } else this.blocked = false;
    const sp = Math.hypot(this.vx, this.vz);
    if (this.aimYaw !== null) this.heading = approachAngle(this.heading, this.aimYaw, dt * 14);
    else if (sp > 0.3) this.heading = approachAngle(this.heading, Math.atan2(this.vx, this.vz), dt * 10);
    this.phase += dt * sp * 2.2;
    this.swing = Math.sin(this.phase) * clamp(sp / 3, 0, 1) * 0.75;
  }

  fly(dt, game) {
    this.vy -= 22 * dt;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    this.spin += dt * 6;
    const hit = game.collision.resolveCircle(this.x, this.z, 0.35);
    if (hit) { this.x += hit.px; this.z += hit.pz; this.vx *= -0.3; this.vz *= -0.3; }
    if (this.y <= 0) { this.y = 0; this.vy = 0; this.vx *= 0.5; this.vz *= 0.5; if (Math.hypot(this.vx, this.vz) < 0.5) { this.vx = 0; this.vz = 0; } }
  }

  takeDamage(amount, game, attacker, kind = 'bullet') {
    if (this.state === 'dead') return;
    if (this.armor > 0 && kind !== 'fall') {
      const a = Math.min(this.armor, amount * 0.7);
      this.armor -= a; amount -= a;
    }
    this.hp -= amount;
    this.hitFlash = 0.15;
    this.lastAttacker = attacker;
    if (this.hp <= 0) this.die(game, attacker, kind);
    else game.events.emit('humanHurt', this, attacker, kind);
  }

  /** Thrown by a vehicle or blast. */
  knock(vx, vz, up, game) {
    if (this.vehicle) return;
    this.vx = vx; this.vz = vz; this.vy = up; this.y = Math.max(this.y, 0.05);
    if (this.state !== 'dead') { this.state = 'knocked'; this.knockTime = 1.2; }
  }

  die(game, attacker, kind) {
    this.hp = 0;
    this.state = 'dead';
    this.deadTime = game.time;
    this.swing = 0;
    game.events.emit('humanKilled', this, attacker, kind);
  }

  /** Killed while inside an exploding car: drop the body beside it. */
  ejectDead(game, vehicle) {
    this.vehicle = null;
    vehicle.driver = null;
    const [dx, dz] = vehicle.doorPoint();
    this.x = dx; this.z = dz;
    if (this.state !== 'dead') this.die(game, vehicle.killedBy, 'blast');
  }

  modelMatrix() {
    if (this.state === 'dead') return modelEuler(this.model, this.x, 0.15, this.z, this.heading, -Math.PI / 2, 0);
    if (this.state === 'knocked') return modelEuler(this.model, this.x, this.y + 0.2, this.z, this.heading, -Math.min(Math.PI / 2, this.spin), 0);
    return modelYaw(this.model, this.x, this.y, this.z, this.heading);
  }

  faceToward(x, z) { this.heading = Math.atan2(x - this.x, z - this.z); }
  angleTo(x, z) { return wrapAngle(Math.atan2(x - this.x, z - this.z) - this.heading); }
}
