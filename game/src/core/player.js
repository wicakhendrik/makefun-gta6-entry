// Player controls: running and aiming on foot, stealing and driving cars, drive-bys, weapon wheel, bailing out.

import { clamp, dist2 } from '../engine/math.js';
import { WEAPONS, WEAPON_ORDER } from '../combat/combat.js';

export class PlayerController {
  constructor(game) {
    this.game = game;
    this.shotTimer = 0;
  }

  get p() { return this.game.player; }

  update(dt) {
    const g = this.game, p = this.p, inp = g.input;
    if (!p.alive) { p.wantX = 0; p.wantZ = 0; return; }
    g.camera.look(inp.mouseDX + inp.axis('ArrowLeft', 'ArrowRight') * dt * 700, inp.mouseDY + inp.axis('ArrowUp', 'ArrowDown') * dt * 400, g.settings.sensitivity);

    this.handleWeaponSwitch(inp);
    if (inp.pressed('KeyF') || inp.pressed('Enter')) {
      if (p.vehicle) this.exitVehicle(); else this.tryEnterVehicle();
    }
    if (p.vehicle) this.drive(dt, inp); else this.walk(dt, inp);
    this.handleShooting(dt, inp);
  }

  handleWeaponSwitch(inp) {
    const p = this.p;
    const owned = WEAPON_ORDER.filter((w) => w === 'fist' || p.weapons.has(w));
    let idx = owned.indexOf(p.weapon);
    if (inp.wheel > 0 || inp.pressed('KeyE')) idx = (idx + 1) % owned.length;
    if (inp.wheel < 0 || inp.pressed('KeyQ')) idx = (idx - 1 + owned.length) % owned.length;
    for (let k = 1; k <= WEAPON_ORDER.length; k++) {
      if (inp.pressed('Digit' + k)) {
        const w = WEAPON_ORDER[k - 1];
        if (owned.includes(w)) idx = owned.indexOf(w);
        else { this.game.hud.toast(`${WEAPONS[w].name} is locked — find it at Bolt & Barrel`); this.game.audio.dryFire(); }
      }
    }
    if (inp.pressed('KeyR')) this.game.combat.startReload(p);
    const next = owned[Math.max(0, idx)];
    if (next !== p.weapon) { p.weapon = next; this.game.audio.weaponSwitch(); this.game.hud.flashWeapon(); }
  }

  walk(dt, inp) {
    const g = this.game, p = this.p;
    const fwd = inp.axis('KeyS', 'KeyW'), str = inp.axis('KeyA', 'KeyD');
    const [fx, fz] = g.camera.forward;
    const rx = -fz, rz = fx;
    let mx = fx * fwd + rx * str, mz = fz * fwd + rz * str;
    const l = Math.hypot(mx, mz);
    const aiming = inp.buttons[2] && p.weapon !== 'fist';
    g.camera.aiming = aiming;
    const speed = aiming ? 2.6 : inp.isDown('ShiftLeft') || inp.isDown('ShiftRight') ? 7.6 : 5.0;
    if (l > 0) { mx /= l; mz /= l; }
    p.wantX = mx * speed; p.wantZ = mz * speed;
    p.aimYaw = aiming || this.shotTimer > 0 ? g.camera.yaw : null;
  }

  drive(dt, inp) {
    const g = this.game, v = this.p.vehicle;
    g.camera.aiming = false;
    v.input.throttle = inp.axis('KeyS', 'KeyW');
    v.input.steer = inp.axis('KeyD', 'KeyA');
    v.input.handbrake = inp.isDown('Space');
    if (inp.pressed('KeyH')) { v.horn = 0.6; g.audio.horn(v.x, v.z, true); g.peds.scare(v.x, v.z, 8, null); }
    if (inp.pressed('KeyN')) g.radio.next();
    if (inp.pressed('KeyB')) g.radio.prev();
    if (v.spec.police && inp.pressed('KeyG')) v.sirenOn = !v.sirenOn;
    if (v.skid > 0.5 && v.speed > 8) {
      const c = Math.cos(v.heading), s = Math.sin(v.heading);
      for (const side of [-1, 1]) g.fx.skid(v.x - s * v.spec.len * 0.33 + c * side * 0.8, v.z - c * v.spec.len * 0.33 - s * side * 0.8, v.heading);
    }
  }

  handleShooting(dt, inp) {
    const g = this.game, p = this.p;
    if (this.shotTimer > 0) this.shotTimer -= dt;
    const w = WEAPONS[p.weapon];
    g.combat.updateReload(p, dt);
    if (p.vehicle && (w.melee || w.pellets !== 1 || p.weapon === 'rifle')) return; // drive-by: pistol and SMG only
    const trigger = w.auto ? inp.buttons[0] : inp.clicks[0];
    if (!trigger || p.fireCooldown > 0) return;
    if (!inp.locked && !g.shotMode && g.input.wantLock) return;
    const eye = g.camera.eye;
    const [dx, dy, dz] = g.camera.aimRay();
    const t0 = Math.max(0, (p.x - eye[0]) * dx + (p.y + 1.4 - eye[1]) * dy + (p.z - eye[2]) * dz) + (p.vehicle ? 2.5 : 0.6);
    const ox = eye[0] + dx * t0, oy = eye[1] + dy * t0, oz = eye[2] + dz * t0;
    const hf = Math.sin(g.camera.yaw), hz = Math.cos(g.camera.yaw);
    const mx = p.x + hf * 0.55 - hz * 0.25, my = p.vehicle ? 1.4 : p.y + 1.35, mz = p.z + hz * 0.55 + hf * 0.25;
    if (!p.vehicle) p.heading = g.camera.yaw;
    if (g.combat.fire(p, ox, oy, oz, dx, dy, dz, mx, my, mz)) {
      this.shotTimer = 0.8;
      if (!w.melee) g.camera.shake(w.pellets > 1 || w.rocket ? 0.25 : 0.06);
    }
  }

  /** Context hint for the HUD: which car F would take. */
  nearbyHint() {
    const g = this.game, p = this.p;
    if (p.vehicle || !p.alive) return null;
    let best = null, bd = 4.2 * 4.2;
    for (const v of g.vehicles) {
      if (v.state === 'wreck') continue;
      const d = dist2(v.x, v.z, p.x, p.z);
      if (d < bd + v.spec.len) { bd = d; best = v; }
    }
    if (!best) return null;
    return (best.driver ? 'F — carjack the ' : 'F — steal the ') + best.spec.name;
  }

  tryEnterVehicle() {
    const g = this.game, p = this.p;
    let best = null, bd = 4.2 * 4.2;
    for (const v of g.vehicles) {
      if (v.state === 'wreck') continue;
      const d = dist2(v.x, v.z, p.x, p.z);
      if (d < bd + v.spec.len) { bd = d; best = v; }
    }
    if (!best) return false;
    this.enterVehicle(best);
    return true;
  }

  enterVehicle(v) {
    const g = this.game, p = this.p;
    const victim = v.driver;
    if (victim && !victim.isPlayer) {
      // carjack: drag the driver out
      const [dx, dz] = v.doorPoint();
      victim.vehicle = null; victim.x = dx; victim.z = dz; victim.state = 'walk';
      if (!g.humans.includes(victim)) g.humans.push(victim);
      if (victim.role === 'cop') { victim.ai = { mode: 'chase', burst: 0, strafe: 1 }; victim.weapon = 'pistol'; }
      else { g.peds.reattach(victim); Object.assign(victim.ai, { flee: 8, fx: p.x, fz: p.z }); victim.state = 'flee'; }
      victim.knock(Math.sin(v.heading + 1.57) * 3, Math.cos(v.heading + 1.57) * 3, 2, g);
      g.audio.punch(v.x, v.z);
      g.police.crime(v.spec.police ? 'copcarjack' : 'carjack');
      g.events.emit('carjack', v, victim);
    } else if (v.parked && !v.wasStolen && Math.random() < 0.3 && !v.persistentMission) {
      g.audio.carAlarm(v.x, v.z);
      if (g.police.witnesses(v.x, v.z, 30)) g.police.crime('carjack', 0.6);
    }
    if (v.spec.police && !victim && !v.wasStolen) g.police.crime('copcarjack', 0.6);
    v.driver = p;
    v.ai = null;
    v.parked = false;
    v.wasStolen = true;
    p.vehicle = v;
    p.state = 'driving';
    p.aimYaw = null;
    g.camera.yaw = v.heading;
    g.radio.enterVehicle(v);
    g.hud.showVehicleName(v.spec.name);
    g.events.emit('enterVehicle', v);
  }

  exitVehicle() {
    const g = this.game, p = this.p, v = p.vehicle;
    if (!v) return;
    const sp = v.speed;
    let [dx, dz] = v.doorPoint();
    if (g.collision.pointBlocked(dx, dz)) { dx = v.x - (dx - v.x); dz = v.z - (dz - v.z); }
    v.driver = null;
    v.input.throttle = 0; v.input.steer = 0; v.input.handbrake = sp < 8;
    p.vehicle = null;
    p.x = dx; p.z = dz; p.state = 'walk';
    p.heading = v.heading;
    g.radio.exitVehicle();
    if (sp > 9) {
      // bail out at speed: tumble and take a knock
      p.knock(v.vx * 0.6, v.vz * 0.6, 2.5, g);
      p.takeDamage(clamp(sp * 0.7, 5, 30), g, null, 'fall');
      g.audio.thud(p.x, p.z);
    }
    g.events.emit('exitVehicle', v);
  }
}
