// Rockets from the Pelican RL launcher: flying projectiles with a smoke trail that explode on whatever they meet.

const SPEED = 58;
const LIFE = 4;

export class RocketSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
  }

  launch(owner, x, y, z, dx, dy, dz) {
    this.list.push({ owner, x, y, z, dx, dy, dz, life: LIFE, trail: 0 });
    this.game.camera.shake(0.3);
  }

  update(dt) {
    const g = this.game;
    for (const r of this.list) {
      const seg = SPEED * dt;
      const hit = g.combat.trace(r.owner, r.x, r.y, r.z, r.dx, r.dy, r.dz, seg);
      const groundT = r.dy < 0 ? -r.y / r.dy : Infinity;
      r.life -= dt;
      if (hit.t < seg || groundT < seg || r.life <= 0) {
        const t = Math.min(hit.t, groundT, seg);
        this.detonate(r, r.x + r.dx * t, Math.max(0.3, r.y + r.dy * t), r.z + r.dz * t, hit);
        continue;
      }
      r.x += r.dx * seg; r.y += r.dy * seg; r.z += r.dz * seg;
      r.trail += dt;
      while (r.trail > 0.012) {
        r.trail -= 0.012;
        g.fx.spawn(r.x - r.dx * 0.6, r.y - r.dy * 0.6, r.z - r.dz * 0.6, (Math.random() - 0.5) * 0.5, 0.4, (Math.random() - 0.5) * 0.5, 1.4 + Math.random(), 0.35, 1.3, 0.7, 0.7, 0.72, 0.5, -0.1, 'smoke');
      }
    }
    this.list = this.list.filter((r) => !r.done);
  }

  detonate(r, x, y, z, hit) {
    const g = this.game;
    r.done = true;
    if (hit.heli && g.police.heli) g.police.heli.hp -= 500;
    if (hit.vehicle) hit.vehicle.damage(2000, g, r.owner);
    g.fx.explosion(x, y, z);
    g.audio.explosion(x, z);
    g.combat.blast(x, z, 9, 150, r.owner, null);
    g.events.emit('explosion', x, z);
    if (r.owner && r.owner.isPlayer) g.police.crime('explode');
    const p = g.player, d = Math.hypot(p.x - x, p.z - z);
    if (d < 60) g.camera.shake(Math.max(0.15, 0.9 - d / 60));
  }

  render(r, right, up) {
    for (const k of this.list) {
      r.billboard(k.x, k.y, k.z, 0.7, 2.4, 1.5, 0.5, 0, right, up);
      r.streak(k.x, k.y, k.z, k.x - k.dx * 1.4, k.y - k.dy * 1.4, k.z - k.dz * 1.4, 0.12, 0.8, 0.8, 0.8, 0.9);
    }
  }
}
