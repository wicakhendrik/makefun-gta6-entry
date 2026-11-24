// Solara PD: heat and wanted stars, witnesses, pursuit cars, officers on foot, the helicopter, arrests and evasion.

import { makeRng, dist, dist2, clamp, wrapAngle, modelEuler, modelYaw } from '../engine/math.js';
import { Vehicle } from '../entities/vehicles.js';
import { Human } from '../entities/humans.js';
import { randomLaneSpot, nearestNode, routeDir, DIRS, dirOfHeading, headingOfDir, nodeValid, chooseNextDir } from '../world/roads.js';
import { followRoad } from './traffic.js';
import { PITCH, DISTRICTS, districtAt } from '../world/city.js';

const CALL_NAMES = ['KILO', 'LIMA', 'ADAM', 'NORA', 'VICTOR', 'TANGO', 'OSCAR', 'MARY', 'ZULU', 'HENRY'];
const HEADINGS = ['eastbound', 'southbound', 'westbound', 'northbound'];
/** Labels the dispatch panel shows for each pursuit tactic. */
export const TACTICS = {
  RAM: { label: 'RAMMING', color: '#ff4a4a' },
  FLANK: { label: 'FLANKING', color: '#ffae3a' },
  CLOSE: { label: 'CLOSING IN', color: '#ffe04a' },
  SEARCH: { label: 'SEARCHING', color: '#a8b4d0' },
  ROADBLOCK: { label: 'ROADBLOCK', color: '#ff6ac1' },
  SPOTLIGHT: { label: 'SPOTLIGHT', color: '#ffffff' },
  GUNNER: { label: 'AIR GUNNER', color: '#ff4a4a' },
  FOOT: { label: 'ON FOOT', color: '#7ab8ff' },
  CUFF: { label: 'CUFFING', color: '#7ab8ff' },
};

export const STAR_HEAT = [1, 3, 7, 13, 22];
const CRIME_HEAT = { gunfire: 0.35, assault: 0.7, hitped: 0.9, kill: 1.6, copkill: 4.5, carjack: 0.5, copcar: 0.5, explode: 1.6, copcarjack: 3.2 };
const UNITS_BY_STARS = [0, 2, 3, 4, 6, 8];

export class PoliceSystem {
  constructor(game) {
    this.game = game;
    this.rng = makeRng(911);
    this.heat = 0;
    this.stars = 0;
    this.unseen = 0;
    this.lastSeen = { x: 0, z: 0 };
    this.spawnTimer = 0;
    this.heli = null;
    this.bustTimer = 0;
    this.flashT = 0;
    this.patrolTimer = 5;
    this.callSeq = 0;
    this.roadblocks = [];
    this.roadblockTimer = 9;
    this.tacticTimer = 0;
    this.call = null;
    game.events.on('wantedUp', (s) => {
      const p = game.player;
      this.radio(s >= 3 ? `All units: ${s}-star felony in ${this.placeName()}. Air support rolling.` : `Units respond: suspect ${p.vehicle ? 'in a ' + p.vehicle.spec.name : 'on foot'} in ${this.placeName()}.`);
    });
    game.events.on('gunfire', (shooter, x, z) => { if (shooter.isPlayer && this.witnesses(x, z, 45)) this.crime('gunfire'); });
    game.events.on('humanKilled', (h, attacker) => {
      if (!attacker || !attacker.isPlayer) return;
      if (h.role === 'cop') this.crime('copkill');
      else if (h.role === 'civ') this.crime('kill');
    });
    game.events.on('humanHurt', (h, attacker, kind) => {
      if (attacker && attacker.isPlayer && (h.role === 'civ' || h.role === 'cop') && kind !== 'vehicle') this.crime(h.role === 'cop' ? 'copkill' : 'assault', h.role === 'cop' ? 0.25 : 1);
    });
  }

  get wantedTimeout() { return 9 + this.stars * 3.5; }

  /** Is any civilian or officer close enough to see a crime at (x, z)? */
  witnesses(x, z, r) {
    for (const h of this.game.humans) if ((h.role === 'civ' || h.role === 'cop') && h.state !== 'dead' && dist2(h.x, h.z, x, z) < r * r) return true;
    return false;
  }

  copsNear(x, z, r) {
    for (const h of this.game.humans) if (h.role === 'cop' && h.state !== 'dead' && dist2(h.x, h.z, x, z) < r * r) return true;
    for (const v of this.game.vehicles) if (v.spec.police && v.driver && dist2(v.x, v.z, x, z) < r * r) return true;
    return false;
  }

  crime(kind, scale = 1) {
    if (this.game.cheatsNoPolice) return;
    let add = (CRIME_HEAT[kind] || 0.5) * scale;
    const p = this.game.player;
    if (this.copsNear(p.x, p.z, 50)) add *= 1.6;
    if (kind === 'carjack' && this.copsNear(p.x, p.z, 40)) add += 1;
    this.setHeat(Math.max(this.heat + add, kind === 'gunfire' && this.heat < 1 ? 1 : 0, add >= 0.35 ? 1 : this.heat));
    this.unseen = 0;
    this.lastSeen = { x: p.x, z: p.z };
  }

  setHeat(h) {
    const before = this.stars;
    this.heat = clamp(h, 0, 30);
    let s = 0;
    while (s < 5 && this.heat >= STAR_HEAT[s]) s++;
    this.stars = s;
    if (s > before) { this.game.audio.wantedUp(); this.game.events.emit('wantedUp', s); }
  }

  setMinStars(n) { if (this.stars < n) this.setHeat(STAR_HEAT[n - 1] + 0.2); }

  clear() {
    this.heat = 0; this.stars = 0; this.unseen = 0; this.bustTimer = 0;
    for (const v of this.game.vehicles) if (v.ai && v.ai.kind === 'police') { v.ai.kind = 'traffic'; v.ai.cruise = 12; v.sirenOn = false; v.ai.panic = 0; v.ai.stuck = 0; v.ai.ignore = 0; }
    for (const h of this.game.humans) if (h.role === 'cop') h.ai.mode = 'leave';
    for (const b of this.roadblocks) for (const v of b.cars) { v.ai = { kind: 'parked' }; v.sirenOn = false; }
    this.roadblocks = [];
    this.roadblockTimer = 9;
  }

  nextCallSign() {
    const n = this.callSeq++;
    return `${CALL_NAMES[n % CALL_NAMES.length]}-${11 + ((n * 17) % 79)}`;
  }

  placeName() {
    const p = this.game.player;
    const d = DISTRICTS[districtAt(p.x, p.z)];
    return d ? d.name : 'Port Solara';
  }

  /** A line of police radio chatter for the dispatch panel. */
  radio(text) { this.call = { text, t: 7 }; }

  update(dt) {
    const g = this.game, p = g.player;
    this.flashT += dt;
    if (this.stars > 0) {
      const seen = this.isPlayerSeen();
      if (seen) { this.unseen = 0; this.lastSeen = { x: p.x, z: p.z }; }
      else this.unseen += dt;
      if (this.unseen > this.wantedTimeout) {
        this.clear();
        g.events.emit('wantedLost');
        g.audio.wantedLost();
      }
      this.spawnTimer -= dt;
      const units = g.vehicles.filter((v) => v.ai && v.ai.kind === 'police').length;
      if (units < UNITS_BY_STARS[this.stars] && this.spawnTimer <= 0) { this.spawnUnit(); this.spawnTimer = 2.5; }
      if (this.stars >= 3 && !this.heli) this.spawnHeli();
      this.tacticTimer -= dt;
      if (this.tacticTimer <= 0) { this.tacticTimer = 0.5; this.assignTactics(); }
      this.roadblockTimer -= dt;
      if (this.stars >= 2 && p.vehicle && p.vehicle.speed > 6 && this.roadblockTimer <= 0) {
        this.roadblockTimer = 18 - this.stars * 1.5;
        this.placeRoadblock();
      }
    }
    this.updateRoadblocks(dt);
    if (this.call) { this.call.t -= dt; if (this.call.t <= 0) this.call = null; }
    // occasional patrol car in normal traffic
    this.patrolTimer -= dt;
    if (this.patrolTimer <= 0) {
      this.patrolTimer = 20;
      const patrols = g.vehicles.filter((v) => v.spec.police && v.driver).length;
      if (patrols < 2) { const v = g.traffic.spawnCar(110, 220, 'interceptor'); if (v) v.driver.role = 'cop'; }
    }
    for (const v of g.vehicles) if (v.ai && v.ai.kind === 'police') this.driveUnit(v, dt);
    for (const h of g.humans) if (h.role === 'cop') this.officerThink(h, dt);
    if (this.heli) this.updateHeli(dt);
    // a slow officer walking up to an unarmed suspect on foot means handcuffs
    if (this.stars === 1 && p.onFoot) {
      let close = false;
      for (const h of g.humans) if (h.role === 'cop' && h.state !== 'dead' && h.state !== 'knocked' && dist2(h.x, h.z, p.x, p.z) < 2.4 * 2.4) close = true;
      this.bustTimer = close ? this.bustTimer + dt : Math.max(0, this.bustTimer - dt);
      if (this.bustTimer > 1.6) { this.bustTimer = 0; g.onBusted(); }
    } else this.bustTimer = 0;
  }

  isPlayerSeen() {
    const g = this.game, p = g.player;
    const py = p.vehicle ? 1.2 : 1.5;
    if (this.heli && this.heli.hp > 0 && (this.heli.spotOn || dist2(this.heli.x, this.heli.z, p.x, p.z) < 30 * 30)) return true;
    for (const b of this.roadblocks) if (dist2(b.x, b.z, p.x, p.z) < 40 * 40) return true;
    for (const v of g.vehicles) {
      if (!v.spec.police || !v.driver || v.state !== 'ok') continue;
      const d2 = dist2(v.x, v.z, p.x, p.z);
      if (d2 < 22 * 22) return true;
      if (d2 < 75 * 75 && g.collision.lineOfSight(v.x, 1.3, v.z, p.x, py, p.z)) return true;
    }
    for (const h of g.humans) {
      if (h.role !== 'cop' || h.state === 'dead') continue;
      const d2 = dist2(h.x, h.z, p.x, p.z);
      if (d2 < 15 * 15) return true;
      if (d2 < 60 * 60 && g.collision.lineOfSight(h.x, 1.6, h.z, p.x, py, p.z)) return true;
    }
    return false;
  }

  spawnUnit() {
    const g = this.game, p = g.player;
    const spot = randomLaneSpot(this.rng, p.x, p.z, 90, 200);
    if (!spot) return null;
    return this.spawnUnitAt(spot.x, spot.z, spot.heading, spot);
  }

  /** A crewed pursuit car at a given spot (spawning and staged scenes). */
  spawnUnitAt(x, z, heading, spot) {
    const g = this.game;
    if (!spot) { const [i, j] = nearestNode(x, z); spot = { i, j, d: dirOfHeading(heading) }; }
    const v = new Vehicle('interceptor', x, z, heading);
    v.ai = { kind: 'police', i: spot.i, j: spot.j, d: spot.d, next: spot.d, stuck: 0, ignore: 0, deployed: false, reverse: 0, callSign: this.nextCallSign(), tactic: 'CLOSE', side: this.callSeq % 2 ? 1 : -1 };
    v.sirenOn = true;
    const cop = new Human('cop', v.x, v.z, 0, [0.12, 0.17, 0.32]);
    cop.vehicle = v; cop.state = 'driving'; v.driver = cop;
    v.crew = 1;
    g.vehicles.push(v);
    return v;
  }

  /** Pursuit driving: road routing when far, direct ramming when close, stop and deploy officers on foot. */
  driveUnit(v, dt) {
    const g = this.game, p = g.player, ai = v.ai;
    if (!v.driver || v.driver.state === 'dead' || v.state !== 'ok') { v.input.throttle = 0; v.input.handbrake = true; v.sirenOn = v.state === 'ok'; return; }
    v.sirenOn = true;
    const tx = p.vehicle ? p.vehicle.x : p.x, tz = p.vehicle ? p.vehicle.z : p.z;
    const d = dist(v.x, v.z, tx, tz);
    const los = d < 55 && g.collision.lineOfSight(v.x, 1.2, v.z, tx, 1.2, tz);
    if (ai.reverse > 0) {
      ai.reverse -= dt;
      v.input.throttle = -1; v.input.steer = ai.revSteer; v.input.handbrake = false;
      return;
    }
    if (!p.vehicle && d < 16 && los) {
      // pull over and get out
      v.input.throttle = v.forwardSpeed > 1 ? -1 : 0; v.input.handbrake = true; v.input.steer = 0;
      if (v.speed < 2 && !ai.deployed) { ai.deployed = true; this.deployOfficers(v); }
      return;
    }
    const tactic = ai.tactic || 'CLOSE';
    const pv = p.vehicle;
    const vx = pv ? pv.vx : p.vx, vz = pv ? pv.vz : p.vz;
    if (tactic === 'SEARCH') {
      // they do not know where the suspect is: drive to the last sighting, then sweep the nearby streets
      const near = dist(v.x, v.z, this.lastSeen.x, this.lastSeen.z) < 30;
      const [si, sj] = nearestNode(this.lastSeen.x, this.lastSeen.z);
      followRoad(v, ai, dt, g, { cruise: 17, turnSpeed: 9, chooseNext: (i, j, dd) => (near ? chooseNextDir(i, j, dd, this.rng) : routeDir(i, j, si, sj, dd)), careful: false });
    } else if (tactic === 'FLANK' && los) {
      // come alongside: aim beside and ahead of the suspect to box them in
      const sp = Math.hypot(vx, vz) || 1;
      const ox = (-vz / sp) * ai.side * 6, oz = (vx / sp) * ai.side * 6;
      const px = tx + vx * 0.9 + ox, pz = tz + vz * 0.9 + oz;
      const ang = wrapAngle(Math.atan2(px - v.x, pz - v.z) - v.heading);
      v.input.steer = clamp(ang * 2.4, -1, 1);
      v.input.throttle = 1; v.input.handbrake = false;
    } else if (los || d < 25) {
      // RAM and CLOSE: drive at where the suspect will be; rammers lead harder and never brake
      const lead = tactic === 'RAM' ? 0.75 : pv ? 0.45 : 0.2;
      const px = tx + vx * lead, pz = tz + vz * lead;
      const ang = wrapAngle(Math.atan2(px - v.x, pz - v.z) - v.heading);
      v.input.steer = clamp(ang * 2.2, -1, 1);
      v.input.throttle = Math.abs(ang) > 1.6 && d < 12 ? -0.6 : 1;
      v.input.handbrake = tactic !== 'RAM' && Math.abs(ang) > 1.1 && v.speed > 14;
    } else {
      // intercept: route to where the suspect will be in a few seconds, flat out with sirens when far behind
      const ahead = Math.min(4, d / 30);
      const [ti, tj] = nearestNode(tx + vx * ahead, tz + vz * ahead);
      followRoad(v, ai, dt, g, { cruise: (d > 90 ? 34 : 27) + this.stars * 2, turnSpeed: 12, chooseNext: (i, j, dd) => routeDir(i, j, ti, tj, dd), careful: false });
    }
    // unstick by reversing when pinned against something
    if (v.speed < 1 && Math.abs(v.input.throttle) > 0.5) ai.stuck += dt; else ai.stuck = 0;
    if (ai.stuck > 1.6) { ai.stuck = 0; ai.reverse = 1.2; ai.revSteer = Math.random() < 0.5 ? 1 : -1; }
  }

  deployOfficers(v) {
    const g = this.game;
    const driver = v.driver;
    const [dx, dz] = v.doorPoint();
    driver.vehicle = null; driver.state = 'walk'; driver.x = dx; driver.z = dz;
    v.driver = null;
    v.ai = { kind: 'parked' };
    v.input.throttle = 0; v.input.handbrake = true;
    const partner = new Human('cop', dx - Math.cos(v.heading) * 0, dz, 0, [0.12, 0.17, 0.32]);
    partner.x = v.x - (dx - v.x); partner.z = v.z - (dz - v.z);
    for (const c of [driver, partner]) {
      c.weapon = this.stars >= 5 ? 'rifle' : this.stars >= 4 ? 'smg' : 'pistol';
      c.ai = { mode: 'chase', burst: 0, strafe: Math.random() < 0.5 ? 1 : -1 };
      c.tint.set([0.12, 0.17, 0.32]);
      if (!g.humans.includes(c)) g.humans.push(c);
    }
    v.sirenOn = true;
  }

  officerThink(h, dt) {
    const g = this.game, p = g.player;
    if (h.state === 'dead' || h.state === 'knocked' || h.vehicle) { h.wantX = 0; h.wantZ = 0; return; }
    if (!h.ai || !h.ai.mode) h.ai = { mode: 'chase', burst: 0, strafe: 1 };
    const d = dist(h.x, h.z, p.x, p.z);
    if (this.stars === 0 || h.ai.mode === 'leave') {
      h.aimYaw = null;
      h.wantX = 0; h.wantZ = 0;
      if (d > 120) h.gone = true;
      return;
    }
    const los = d < 70 && g.collision.lineOfSight(h.x, 1.6, h.z, p.x, 1.4, p.z);
    const dx = (p.x - h.x) / (d || 1), dz = (p.z - h.z) / (d || 1);
    if (this.stars === 1) {
      // try to cuff the suspect
      h.aimYaw = null;
      const sp = d > 2 ? 4.6 : 0;
      h.wantX = dx * sp; h.wantZ = dz * sp;
      return;
    }
    h.aimYaw = Math.atan2(dx, dz);
    let mx = 0, mz = 0;
    if (h.ai.hold && d > 22) { mx = 0; mz = 0; }
    else if (!los || d > 26) { mx = dx * 4.8; mz = dz * 4.8; }
    else if (d < 7) { mx = -dx * 2.5; mz = -dz * 2.5; }
    else { mx = -dz * h.ai.strafe * 1.6; mz = dx * h.ai.strafe * 1.6; if (Math.random() < dt * 0.4) h.ai.strafe *= -1; }
    if (h.blocked) { const t = mx; mx = -mz; mz = t; }
    h.wantX = mx; h.wantZ = mz;
    if (los && d < 45 && p.alive) g.combat.npcShoot(h, p, d);
  }

  spawnHeli() {
    const p = this.game.player;
    const a = Math.random() * Math.PI * 2;
    this.heli = { x: p.x + Math.cos(a) * 180, z: p.z + Math.sin(a) * 180, y: 60, heading: 0, vx: 0, vz: 0, hp: 650, rotor: 0, orbit: a, fire: 2, crash: 0, model: new Float32Array(16), rotorModel: new Float32Array(16),
      spot: { x: p.x + Math.cos(a) * 40, z: p.z + Math.sin(a) * 40 }, spotOn: false, sweep: 0, callSign: 'HALO-1' };
    this.radio('HALO-1 airborne, spotlight up.');
  }

  updateHeli(dt) {
    const g = this.game, h = this.heli, p = g.player;
    h.rotor += dt * 28;
    if (h.hp <= 0) {
      h.crash += dt; h.y -= dt * (8 + h.crash * 10); h.heading += dt * 4;
      if (Math.random() < dt * 30) g.fx.fire(h.x, h.y, h.z);
      if (h.y <= 1) {
        g.fx.explosion(h.x, 1, h.z); g.audio.explosion(h.x, h.z); g.combat.blast(h.x, h.z, 10, 120, null, null);
        this.heli = null;
      }
      return;
    }
    if (this.stars < 3) {
      h.y += dt * 8; h.x += Math.cos(h.orbit) * dt * 30; h.z += Math.sin(h.orbit) * dt * 30;
      if (h.y > 140) this.heli = null;
      return;
    }
    // the spotlight chases the suspect at a limited slew rate; without a sighting it sweeps around the last one
    h.sweep += dt;
    let gx, gz;
    const nearBeam = dist2(h.spot.x, h.spot.z, p.x, p.z) < 24 * 24 && g.state === 'playing';
    if (this.unseen < 1.2 || nearBeam) { gx = p.x + (p.vehicle ? p.vehicle.vx : p.vx) * 0.25; gz = p.z + (p.vehicle ? p.vehicle.vz : p.vz) * 0.25; }
    else { const rr = Math.min(45, 8 + this.unseen * 2.5); gx = this.lastSeen.x + Math.cos(h.sweep * 0.9) * rr; gz = this.lastSeen.z + Math.sin(h.sweep * 1.3) * rr; }
    const sdx = gx - h.spot.x, sdz = gz - h.spot.z, sl = Math.hypot(sdx, sdz);
    const slew = Math.min(sl, dt * 26);
    if (sl > 1e-4) { h.spot.x += (sdx / sl) * slew; h.spot.z += (sdz / sl) * slew; }
    const wasOn = h.spotOn;
    h.spotOn = dist2(h.spot.x, h.spot.z, p.x, p.z) < 9 * 9;
    if (h.spotOn && !wasOn && this.unseen > 2) this.radio('HALO-1: eyes on the suspect again.');
    h.orbit += dt * 0.25;
    const tx = h.spot.x + Math.cos(h.orbit) * 28, tz = h.spot.z + Math.sin(h.orbit) * 28;
    const dx = tx - h.x, dz = tz - h.z, l = Math.hypot(dx, dz) || 1;
    const sp = Math.min(34, l * 0.8);
    h.vx += ((dx / l) * sp - h.vx) * Math.min(1, dt * 1.2);
    h.vz += ((dz / l) * sp - h.vz) * Math.min(1, dt * 1.2);
    h.x += h.vx * dt; h.z += h.vz * dt;
    h.y += (34 - h.y) * Math.min(1, dt * 0.8);
    h.heading = Math.atan2(p.x - h.x, p.z - h.z);
    h.fire -= dt;
    if (this.stars >= 4 && h.fire <= 0 && p.alive && h.spotOn) {
      h.fire = 0.14;
      if (Math.random() < 0.08) h.fire = 2.5;
      const ox = h.x, oy = h.y - 1, oz = h.z;
      const ty = p.vehicle ? 1 : 1.2;
      let ddx = p.x - ox + (Math.random() - 0.5) * 5, ddy = ty - oy, ddz = p.z - oz + (Math.random() - 0.5) * 5;
      const n = Math.hypot(ddx, ddy, ddz);
      const gunner = this.heliGunner || (this.heliGunner = Object.assign(new Human('cop', 0, 0, 0), { weapon: 'smg' }));
      gunner.x = ox; gunner.z = oz; gunner.fireCooldown = 0;
      g.combat.fire(gunner, ox, oy, oz, ddx / n, ddy / n, ddz / n, ox, oy, oz);
    }
  }

  /** Hit test for player bullets against the helicopter. */
  hitHeli(ox, oy, oz, dx, dy, dz, maxT) {
    const h = this.heli;
    if (!h || h.hp <= 0) return -1;
    const rx = h.x - ox, ry = h.y + 1.5 - oy, rz = h.z - oz;
    const t = rx * dx + ry * dy + rz * dz;
    if (t < 0 || t > maxT) return -1;
    const cx = ox + dx * t - h.x, cy = oy + dy * t - h.y - 1.5, cz = oz + dz * t - h.z;
    return cx * cx + cy * cy + cz * cz < 3.2 * 3.2 ? t : -1;
  }

  render(r, meshes, env) {
    const h = this.heli;
    if (!h) return;
    const tilt = clamp(Math.hypot(h.vx, h.vz) * 0.01, 0, 0.25);
    r.draw(meshes.heli, modelEuler(h.model, h.x, h.y, h.z, h.heading, tilt, 0));
    r.draw(meshes.rotor, modelYaw(h.rotorModel, h.x, h.y + 3.0, h.z, h.rotor));
    if (h.hp <= 0 || !h.spot) return;
    // spotlight: a cone of faint beams from the nose down to a bright pool on the ground
    const k = 0.35 + env.night * 0.65;
    const sx = h.spot.x, sz = h.spot.z, oy = h.y - 1.2;
    for (let a = 0; a < 10; a++) {
      const ang = (a / 10) * Math.PI * 2;
      r.streak(h.x, oy, h.z, sx + Math.cos(ang) * 5.5, 0.3, sz + Math.sin(ang) * 5.5, 0.35, 0.16 * k, 0.16 * k, 0.13 * k, 0);
    }
    r.streak(h.x, oy, h.z, sx, 0.3, sz, 1.6, 0.22 * k, 0.22 * k, 0.18 * k, 0);
    r.groundQuad(sx, sz, 0.12, 7, 7, 0, 1.1 * k, 1.05 * k, 0.9 * k, 0);
    r.groundQuad(sx, sz, 0.13, 3.5, 3.5, 0, 0.9 * k, 0.9 * k, 0.8 * k, 0);
    if (env.night > 0.3) r.addLight(sx, 7, sz, 18, 2.4, 2.4, 2.1);
  }

  /** Tactics for every pursuit car, re-planned twice a second from distance, sight lines and the search state. */
  assignTactics() {
    const g = this.game, p = g.player;
    const tx = p.vehicle ? p.vehicle.x : p.x, tz = p.vehicle ? p.vehicle.z : p.z;
    const units = g.vehicles.filter((v) => v.ai && v.ai.kind === 'police' && v.driver && v.state === 'ok');
    for (const v of units) v.ai.dist = dist(v.x, v.z, tx, tz);
    units.sort((a, b) => a.ai.dist - b.ai.dist);
    let flankers = 0;
    units.forEach((v, k) => {
      const d = v.ai.dist;
      const los = d < 80 && g.collision.lineOfSight(v.x, 1.2, v.z, tx, 1.2, tz);
      let t;
      if (this.unseen > 1.5) t = 'SEARCH';
      else if (!p.vehicle) t = d < 30 ? 'FOOT' : 'CLOSE';
      else if (d < 32 && (los || d < 14)) t = 'RAM';
      else if (los && k > 0 && flankers < 2) { t = 'FLANK'; flankers++; }
      else t = 'CLOSE';
      if (t === 'RAM' && v.ai.tactic !== 'RAM' && this.rng() < 0.3) this.radio(`${v.ai.callSign}: making contact, going to ram.`);
      v.ai.tactic = t;
    });
  }

  /** Two cruisers parked across the road a junction or two ahead of the suspect, with armed officers behind them. */
  placeRoadblock(force) {
    const g = this.game, p = g.player, pv = p.vehicle;
    if (!pv) return null;
    const d = dirOfHeading(pv.heading);
    let [i, j] = nearestNode(pv.x, pv.z);
    const ahead = (i * PITCH - pv.x) * DIRS[d][0] + (j * PITCH - pv.z) * DIRS[d][1];
    const n = force || (ahead > 35 ? 1 : 2);
    i += DIRS[d][0] * n; j += DIRS[d][1] * n;
    if (!nodeValid(i, j)) return null;
    const bx = i * PITCH - DIRS[d][0] * 16, bz = j * PITCH - DIRS[d][1] * 16;
    if (g.collision.pointBlocked(bx, bz) || dist(bx, bz, pv.x, pv.z) < 40) return null;
    const perp = [-DIRS[d][1], DIRS[d][0]];
    const sign = this.nextCallSign();
    const block = { x: bx, z: bz, cars: [], cops: [], callSign: sign, t: 0, dir: d };
    for (const side of [-1, 1]) {
      const car = new Vehicle('interceptor', bx + perp[0] * side * 3.1, bz + perp[1] * side * 3.1, headingOfDir(d) + Math.PI / 2 + side * 0.3);
      car.ai = { kind: 'roadblock', callSign: sign, tactic: 'ROADBLOCK' };
      car.sirenOn = true; car.input.handbrake = true;
      g.vehicles.push(car); block.cars.push(car);
      const cop = new Human('cop', bx - DIRS[d][0] * 4 + perp[0] * side * 5.5, bz - DIRS[d][1] * 4 + perp[1] * side * 5.5, 0, [0.12, 0.17, 0.32]);
      cop.weapon = this.stars >= 4 ? 'smg' : 'pistol';
      cop.ai = { mode: 'chase', burst: 0, strafe: side, hold: true };
      cop.heading = headingOfDir((d + 2) % 4);
      g.humans.push(cop); block.cops.push(cop);
    }
    this.roadblocks.push(block);
    this.radio(`${sign}: roadblock set ${HEADINGS[d]} in ${this.placeName()}.`);
    return block;
  }

  updateRoadblocks(dt) {
    const g = this.game, p = g.player;
    for (const b of this.roadblocks) {
      b.t += dt;
      if (b.t > 8 && dist(b.x, b.z, p.x, p.z) > 170) {
        b.gone = true;
        g.vehicles = g.vehicles.filter((v) => !b.cars.includes(v) || v.driver === p);
        for (const c of b.cops) if (c.state !== 'dead') c.gone = true;
      }
    }
    this.roadblocks = this.roadblocks.filter((b) => !b.gone);
    while (this.roadblocks.length > 2) {
      const old = this.roadblocks.shift();
      for (const v of old.cars) if (v.ai && v.ai.kind === 'roadblock') { v.ai = { kind: 'parked' }; v.sirenOn = false; }
    }
  }

  /** Everything the dispatch panel lists: call sign, kind, distance and tactic, nearest first. */
  dispatchList() {
    const g = this.game, p = g.player;
    const rows = [];
    for (const v of g.vehicles) {
      if (v.ai && v.ai.kind === 'police' && v.driver && v.state === 'ok') rows.push({ sign: v.ai.callSign || 'UNIT', kind: 'car', d: dist(v.x, v.z, p.x, p.z), tactic: v.ai.tactic || 'CLOSE' });
    }
    for (const b of this.roadblocks) rows.push({ sign: b.callSign, kind: 'block', d: dist(b.x, b.z, p.x, p.z), tactic: 'ROADBLOCK' });
    const h = this.heli;
    if (h && h.hp > 0 && this.stars >= 3) rows.push({ sign: h.callSign || 'HALO-1', kind: 'heli', d: dist(h.x, h.z, p.x, p.z), tactic: this.stars >= 4 && h.spotOn ? 'GUNNER' : h.spotOn || this.unseen < 1.2 ? 'SPOTLIGHT' : 'SEARCH' });
    let foot = 0, footD = Infinity;
    for (const c of g.humans) if (c.role === 'cop' && c.state !== 'dead' && !c.vehicle && c.ai && c.ai.mode === 'chase') { foot++; footD = Math.min(footD, dist(c.x, c.z, p.x, p.z)); }
    if (foot) rows.push({ sign: `FOOT x${foot}`, kind: 'foot', d: footD, tactic: this.stars === 1 ? 'CUFF' : 'FOOT' });
    rows.sort((a, b) => a.d - b.d);
    return rows;
  }

  /** Siren light bars as glowing billboards plus coloured point lights. */
  renderSirens(r, right, up) {
    const blink = Math.floor(this.flashT * 6) % 2;
    let lights = 0;
    const p = this.game.player;
    const list = this.game.vehicles.filter((v) => v.spec.police && v.sirenOn).sort((a, b) => dist2(a.x, a.z, p.x, p.z) - dist2(b.x, b.z, p.x, p.z));
    for (const v of list) {
      const y = v.spec.hgt + 0.15;
      const c = Math.cos(v.heading), s = Math.sin(v.heading);
      const lx = c * 0.4, lz = -s * 0.4;
      const redOn = blink === 0, blueOn = blink === 1;
      r.billboard(v.x + lx, y, v.z + lz, redOn ? 1.1 : 0.35, redOn ? 2 : 0.4, 0.05, 0.05, 0, right, up);
      r.billboard(v.x - lx, y, v.z - lz, blueOn ? 1.1 : 0.35, 0.05, 0.15, blueOn ? 2.4 : 0.5, 0, right, up);
      if (lights < 3) { r.addLight(v.x, 2.2, v.z, 13, redOn ? 2.2 : 0.2, 0.1, blueOn ? 2.6 : 0.2); lights++; }
    }
  }
}
