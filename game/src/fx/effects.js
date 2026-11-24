// Particle effects: sparks, smoke, fire, explosions, blood, muzzle flashes, tracers, skid marks and flash lights.

const MAX = 1400;

export class Effects {
  constructor() {
    this.p = [];
    this.decals = [];
    this.tracers = [];
    this.flashes = [];
  }

  spawn(x, y, z, vx, vy, vz, life, size, grow, r, g, b, a, gravity, kind) {
    if (this.p.length >= MAX) this.p.shift();
    this.p.push({ x, y, z, vx, vy, vz, life, max: life, size, grow, r, g, b, a, gravity, kind });
  }

  sparks(x, y, z, n = 8) {
    for (let k = 0; k < n; k++) {
      this.spawn(x, y, z, (Math.random() - 0.5) * 10, Math.random() * 6 + 1, (Math.random() - 0.5) * 10, 0.3 + Math.random() * 0.3, 0.08, 0, 1, 0.8, 0.35, 0, 14, 'spark');
    }
  }

  smoke(x, y, z, dark = false) {
    const c = dark ? 0.12 : 0.55;
    this.spawn(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, 1.6 + Math.random(), (Math.random() - 0.5) * 0.6,
      2 + Math.random() * 1.5, 0.5, 1.1, c, c, c, 0.55, -0.2, 'smoke');
  }

  fire(x, y, z) {
    this.spawn(x + (Math.random() - 0.5) * 1.2, y, z + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5), 2.5 + Math.random() * 2, (Math.random() - 0.5),
      0.5 + Math.random() * 0.3, 0.7, 0.6, 1, 0.45 + Math.random() * 0.2, 0.1, 0, -1, 'fire');
    if (Math.random() < 0.3) this.smoke(x, y + 1.5, z, true);
  }

  explosion(x, y, z) {
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 9;
      this.spawn(x, y, z, Math.cos(a) * s, Math.random() * 8 + 2, Math.sin(a) * s, 0.5 + Math.random() * 0.5, 1.4, 2.2, 1, 0.55 + Math.random() * 0.3, 0.15, 0, 3, 'fire');
    }
    for (let k = 0; k < 22; k++) this.smoke(x + (Math.random() - 0.5) * 4, y + Math.random() * 3, z + (Math.random() - 0.5) * 4, true);
    this.sparks(x, y + 0.5, z, 30);
    this.flash(x, y + 2, z, 32, 1.0, 0.6, 0.25, 0.6);
    this.decals.push({ x, z, size: 3.5, yaw: Math.random() * 3, r: 0.05, g: 0.05, b: 0.05, a: 0.75, life: 60, max: 60 });
  }

  blood(x, y, z) {
    for (let k = 0; k < 6; k++) {
      this.spawn(x, y, z, (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, 0.4, 0.09, 0, 0.5, 0.02, 0.02, 0.9, 12, 'blood');
    }
  }

  bloodPool(x, z) {
    this.decals.push({ x, z, size: 0.9, yaw: Math.random() * 3, r: 0.32, g: 0.02, b: 0.02, a: 0.85, life: 40, max: 40, grow: 0.6 });
  }

  impact(x, y, z) {
    this.sparks(x, y, z, 4);
    this.spawn(x, y, z, 0, 0.5, 0, 0.5, 0.15, 0.8, 0.6, 0.58, 0.55, 0.5, 0, 'smoke');
  }

  muzzle(x, y, z) {
    this.spawn(x, y, z, 0, 0, 0, 0.05, 0.35, 0, 1, 0.85, 0.45, 0, 0, 'flash');
    this.flash(x, y, z, 7, 1, 0.75, 0.4, 0.06);
  }

  tracer(ax, ay, az, bx, by, bz) {
    this.tracers.push({ ax, ay, az, bx, by, bz, life: 0.07 });
  }

  skid(x, z, yaw) {
    if (this.decals.length > 500) this.decals.shift();
    this.decals.push({ x, z, size: 0.22, len: 0.45, yaw, r: 0.02, g: 0.02, b: 0.02, a: 0.5, life: 10, max: 10 });
  }

  flash(x, y, z, radius, r, g, b, life) {
    this.flashes.push({ x, y, z, radius, r, g, b, life, max: life });
  }

  update(dt) {
    for (const p of this.p) {
      p.life -= dt;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05 && p.kind !== 'smoke') { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      p.size += p.grow * dt;
      if (p.kind === 'smoke') { p.vx *= 0.98; p.vz *= 0.98; }
    }
    this.p = this.p.filter((p) => p.life > 0);
    for (const d of this.decals) { d.life -= dt; if (d.grow && d.size < 1.6) d.size += d.grow * dt; }
    this.decals = this.decals.filter((d) => d.life > 0);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const f of this.flashes) f.life -= dt;
    this.flashes = this.flashes.filter((f) => f.life > 0);
  }

  /** Push transient lights into the renderer (strongest first). */
  emitLights(renderer) {
    for (const f of this.flashes) {
      const k = f.life / f.max;
      renderer.addLight(f.x, f.y, f.z, f.radius, f.r * 3 * k, f.g * 3 * k, f.b * 3 * k);
    }
  }

  render(renderer, right, up) {
    for (const d of this.decals) {
      const fade = Math.min(1, d.life / (d.max * 0.3));
      renderer.groundQuad(d.x, d.z, 0.06, d.size, d.len || d.size, d.yaw, d.r * d.a * fade, d.g * d.a * fade, d.b * d.a * fade, d.a * fade);
    }
    for (const p of this.p) {
      const k = Math.max(0, p.life / p.max);
      if (p.kind === 'smoke') {
        const a = p.a * k;
        renderer.billboard(p.x, p.y, p.z, p.size, p.r * a, p.g * a, p.b * a, a, right, up);
      } else if (p.kind === 'blood') {
        renderer.billboard(p.x, p.y, p.z, p.size, p.r, p.g, p.b, p.a, right, up);
      } else {
        const i = p.kind === 'fire' ? 1.6 * k : 2 * k;
        renderer.billboard(p.x, p.y, p.z, p.size * (p.kind === 'fire' ? (0.6 + k * 0.6) : 1), p.r * i, p.g * i, p.b * i, 0, right, up);
      }
    }
    for (const t of this.tracers) {
      renderer.streak(t.ax, t.ay, t.az, t.bx, t.by, t.bz, 0.05, 1.6, 1.3, 0.7, 0);
    }
  }
}
