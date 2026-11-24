// Third-person camera rig: over-the-shoulder on foot, speed-aware chase cam in cars, wall avoidance, shake, title orbit.

import { clamp, lerp, wrapAngle, approachAngle } from '../engine/math.js';

export class CameraRig {
  constructor() {
    this.yaw = 0; this.pitch = 0.18;
    this.eye = [0, 10, -10];
    this.target = [0, 0, 0];
    this.fov = 1.0;
    this.shakeAmt = 0;
    this.lookTimer = 0;
    this.aiming = false;
    this.mode = 'foot';
    this.dist = 4.5;
  }

  shake(amount) { this.shakeAmt = Math.min(1.5, this.shakeAmt + amount); }

  /** Apply mouse look. */
  look(dx, dy, sens) {
    if (dx || dy) this.lookTimer = 1.6;
    this.yaw = wrapAngle(this.yaw - dx * 0.0026 * sens);
    this.pitch = clamp(this.pitch + dy * 0.0022 * sens, -0.55, 1.2);
  }

  get forward() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }

  update(dt, game) {
    const p = game.player;
    const v = p.vehicle;
    this.lookTimer -= dt;
    let tx, ty, tz, dist, fov;
    if (v) {
      const sp = v.speed;
      if (this.lookTimer <= 0) {
        // swing behind the car, following the travel direction when sliding
        let want = v.heading;
        if (sp > 6 && v.forwardSpeed > 0) want = v.heading + wrapAngle(Math.atan2(v.vx, v.vz) - v.heading) * 0.35;
        if (v.forwardSpeed < -2) want = v.heading;
        this.yaw = approachAngle(this.yaw, want, dt * (1.5 + sp * 0.08));
        this.pitch = lerp(this.pitch, 0.2, dt * 2);
      }
      tx = v.x; ty = 1.4 + v.spec.hgt * 0.4; tz = v.z;
      dist = v.spec.len * 1.15 + 3.2 + Math.min(sp, 50) * 0.05;
      fov = 1.05 + Math.min(sp, 55) * 0.0045;
      this.mode = 'car';
    } else {
      const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
      const sh = this.aiming ? 0.75 : 0.5;
      tx = p.x + rx * sh; ty = p.y + 1.62; tz = p.z + rz * sh;
      dist = this.aiming ? 2.3 : 4.3;
      fov = this.aiming ? 0.72 : 1.0;
      this.mode = 'foot';
    }
    this.dist = lerp(this.dist, dist, Math.min(1, dt * 5));
    this.fov = lerp(this.fov, fov, Math.min(1, dt * 6));
    const cp = Math.cos(this.pitch), spch = Math.sin(this.pitch);
    const dx = -Math.sin(this.yaw) * cp, dy = spch, dz = -Math.cos(this.yaw) * cp;
    // keep the camera out of walls
    const hitT = game.collision.raycast(tx, ty, tz, dx, dy, dz, this.dist + 0.4);
    const d = Math.max(0.8, Math.min(this.dist, hitT - 0.4));
    let ex = tx + dx * d, ey = Math.max(0.4, ty + dy * d), ez = tz + dz * d;
    if (this.shakeAmt > 0) {
      const s = this.shakeAmt * 0.35;
      ex += (Math.random() - 0.5) * s; ey += (Math.random() - 0.5) * s; ez += (Math.random() - 0.5) * s;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);
    }
    this.eye = [ex, ey, ez];
    // aim a little above the target so the horizon sits in the upper third
    this.target = [tx - dx * 6, ty - dy * 6 + 0.3, tz - dz * 6];
  }

  /** Slow aerial orbit for the title screen and loading. */
  orbit(t, cx, cz) {
    const a = t * 0.05;
    this.eye = [cx + Math.sin(a) * 260, 95, cz + Math.cos(a) * 260];
    this.target = [cx, 25, cz];
    this.fov = 0.95;
  }

  /** Unit aim ray from the camera through the screen centre. */
  aimRay() {
    const dx = this.target[0] - this.eye[0], dy = this.target[1] - this.eye[1], dz = this.target[2] - this.eye[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    return [dx / l, dy / l, dz / l];
  }
}
