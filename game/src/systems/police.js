// Solara PD: heat and wanted stars, witnesses, pursuit cars, officers on foot, the helicopter, arrests and evasion.

import { makeRng, dist, dist2, clamp, wrapAngle, modelEuler, modelYaw } from '../engine/math.js';
import { Vehicle } from '../entities/vehicles.js';
import { Human } from '../entities/humans.js';
import { randomLaneSpot, nearestNode, routeDir, DIRS, dirOfHeading } from '../world/roads.js';
import { followRoad } from './traffic.js';
import { RoadblockPlanner } from './roadblocks.js';
import { DISTRICTS, districtAt } from '../world/city.js';

export const STAR_HEAT = [1, 3, 7, 13, 22];
const CRIME_HEAT = { gunfire: 0.35, assault: 0.7, hitped: 0.9, kill: 1.6, copkill: 4.5, carjack: 0.5, copcar: 0.5, explode: 1.6, copcarjack: 3.2 };
const UNITS_BY_STARS = [0, 2, 3, 4, 6, 8];
const BEATS = ['CORAL', 'HARBOR', 'MIDTOWN', 'CINDER', 'MERIDIAN', 'BRISA', 'SALT', 'PALM'];
const ROLES = ['ram', 'flank', 'close', 'flank', 'ram', 'close'];
const COMPASS = ['east', 'south', 'west', 'north'];

/** Labels and colours for each pursuit tactic, shown on the dispatch panel. */
export const TACTIC_INFO = {
  ram: { label: 'RAMMING', color: '#ff5a5a' },
  flank: { label: 'FLANKING', color: '#ffb03a' },
  close: { label: 'CLOSING IN', color: '#ffe04a' },
  roadblock: { label: 'ROADBLOCK', color: '#ff6ac1' },
  spotlight: { label: 'SPOTLIGHT', color: '#ffffff' },
  search: { label: 'SEARCHING', color: '#8fb4ff' },
  foot: { label: 'ON FOOT', color: '#9fe3c8' },
  down: { label: 'DISABLED', color: '#8a8a96' },
};

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
    this.jam = 0;
    this.unitCount = 0;
    this.roadblocks = new RoadblockPlanner(this);
    game.events.on('wantedUp', (n) => { if (n >= 2) this.radio(`All units, ${this.suspectLine()}. Code ${n === 2 ? 'two' : 'three'}.`); });
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

  /** A dispatcher line in the dialogue box, only when nobody else is talking. */
  radio(text) {
    const hud = this.game.hud;
    if (hud && !hud.dialogueBusy && !this.game.shotMode) hud.queueDialogue([{ who: 'DISPATCH', text }]);
  }

  suspectLine() {
    const p = this.game.player, v = p.vehicle;
    const d = districtAt(p.x, p.z);
    const where = d && DISTRICTS[d] ? DISTRICTS[d].name : 'the city';
    const dir = COMPASS[dirOfHeading(v ? v.heading : p.heading)];
    return v ? `suspect heading ${dir} through ${where} in a ${v.spec.name}` : `suspect on foot in ${where}`;
  }

  nextCallsign() {
    const n = this.unitCount++;
    return `${BEATS[n % BEATS.length]}-${12 + ((n * 7) % 37)}`;
  }

  /** Units the dispatch panel lists: cars with call sign, distance and current tactic, plus the helicopter. */
  dispatchUnits() {
    const g = this.game, p = g.player, out = [];
    for (const v of g.vehicles) {
      if (!v.ai || (v.ai.kind !== 'police' && v.ai.kind !== 'roadblock') || !v.callsign) continue;
      const tactic = v.state !== 'ok' ? 'down' : v.ai.kind === 'roadblock' ? 'roadblock' : v.ai.deployed ? 'foot' : v.ai.tactic || 'close';
      out.push({ call: v.callsign, dist: dist(v.x, v.z, p.x, p.z), tactic, kind: 'car' });
    }
    const h = this.heli;
    if (h && h.hp > 0 && this.stars >= 3) out.push({ call: 'AIR ONE', dist: Math.hypot(h.x - p.x, h.z - p.z, h.y), tactic: h.spotOn ? 'spotlight' : 'search', kind: 'air' });
    out.sort((a, b) => a.dist - b.dist);
    return out;
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
    this.jam = 0;
    this.roadblocks.clear();
    for (const v of this.game.vehicles) if (v.ai && v.ai.kind === 'police') { v.ai.kind = 'traffic'; v.ai.cruise = 12; v.sirenOn = false; v.ai.panic = 0; v.ai.stuck = 0; v.ai.ignore = 0; }
    for (const h of this.game.humans) if (h.role === 'cop') h.ai.mode = 'leave';
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.flashT += dt;
    if (this.jam > 0) this.jam -= dt;
    this.roadblocks.update(dt);
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
      if (this.stars >= 3 && !this.heli) { this.spawnHeli(); this.radio('AIR ONE is up. Lighting the suspect for ground units.'); }
    }
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
    if (this.jam > 0) {
      // the crew's scanner jam: only officers right next to the suspect still know where he is
      for (const h of g.humans) if (h.role === 'cop' && h.state !== 'dead' && dist2(h.x, h.z, p.x, p.z) < 8 * 8) return true;
      return false;
    }
    if (this.heli && this.heli.hp > 0 && this.heli.spotOn) return true;
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
    const v = new Vehicle('interceptor', spot.x, spot.z, spot.heading);
    v.ai = { kind: 'police', i: spot.i, j: spot.j, d: spot.d, next: spot.d, stuck: 0, ignore: 0, deployed: false, reverse: 0 };
    v.sirenOn = true;
    v.callsign = this.nextCallsign();
    v.ai.role = ROLES[(this.unitCount - 1) % ROLES.length];
    v.ai.tactic = 'close';
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
    const searching = this.jam > 0 || this.unseen > 2.5;
    ai.tactic = searching ? 'search' : (los && d < 32) || (ai.role === 'ram' && d < 60 && los) ? 'ram' : ai.role === 'flank' && p.vehicle && d < 160 ? 'flank' : 'close';
    if (ai.tactic === 'flank') {
      // cut in from the side: aim at a point beside and ahead of the suspect's car
      const pv = p.vehicle, side = ai.side || (ai.side = Math.random() < 0.5 ? 1 : -1);
      const fx = Math.sin(pv.heading), fz = Math.cos(pv.heading);
      const ax = tx + pv.vx * 1.4 + fz * side * 10, az = tz + pv.vz * 1.4 - fx * side * 10;
      const da = dist(v.x, v.z, ax, az);
      if (da < 70 && g.collision.lineOfSight(v.x, 1.2, v.z, ax, 1.2, az)) {
        const ang = wrapAngle(Math.atan2(ax - v.x, az - v.z) - v.heading);
        v.input.steer = clamp(ang * 2, -1, 1);
        v.input.throttle = 1; v.input.handbrake = Math.abs(ang) > 1.2 && v.speed > 16;
      } else {
        const [ti, tj] = nearestNode(ax, az);
        followRoad(v, ai, dt, g, { cruise: 30 + this.stars * 2, chooseNext: (i, j, dd) => routeDir(i, j, ti, tj, dd), careful: false });
      }
    } else if (!searching && (los || d < 25)) {
      const lead = p.vehicle ? 0.5 : 0.2;
      const px = tx + (p.vehicle ? p.vehicle.vx : p.vx) * lead, pz = tz + (p.vehicle ? p.vehicle.vz : p.vz) * lead;
      const ang = wrapAngle(Math.atan2(px - v.x, pz - v.z) - v.heading);
      v.input.steer = clamp(ang * 2.2, -1, 1);
      v.input.throttle = Math.abs(ang) > 1.6 && d < 12 ? -0.6 : 1;
      v.input.handbrake = Math.abs(ang) > 1.1 && v.speed > 14;
    } else {
      const sx = searching ? this.lastSeen.x : tx, sz = searching ? this.lastSeen.z : tz;
      const [ti, tj] = nearestNode(sx, sz);
      followRoad(v, ai, dt, g, { cruise: (searching ? 16 : 26) + this.stars * 2, chooseNext: (i, j, dd) => routeDir(i, j, ti, tj, dd), careful: false });
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
    if (h.ai.hold && d > 30) { mx = 0; mz = 0; }
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
    this.heli = { spot: null, spotOn: false, x: p.x + Math.cos(a) * 180, z: p.z + Math.sin(a) * 180, y: 60, heading: 0, vx: 0, vz: 0, hp: 650, rotor: 0, orbit: a, fire: 2, crash: 0, model: new Float32Array(16), rotorModel: new Float32Array(16) };
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
    h.orbit += dt * 0.25;
    const tx = p.x + Math.cos(h.orbit) * 28, tz = p.z + Math.sin(h.orbit) * 28;
    const dx = tx - h.x, dz = tz - h.z, l = Math.hypot(dx, dz) || 1;
    const sp = Math.min(32, l * 0.8);
    h.vx += ((dx / l) * sp - h.vx) * Math.min(1, dt * 1.2);
    h.vz += ((dz / l) * sp - h.vz) * Math.min(1, dt * 1.2);
    h.x += h.vx * dt; h.z += h.vz * dt;
    h.y += (34 - h.y) * Math.min(1, dt * 0.8);
    h.heading = Math.atan2(p.x - h.x, p.z - h.z);
    this.trackSpotlight(h, dt);
    h.fire -= dt;
    if (this.stars >= 4 && h.fire <= 0 && p.alive) {
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

  /** The helicopter's spotlight chases the suspect while the crew can see him and drifts off when they cannot. */
  trackSpotlight(h, dt) {
    const g = this.game, p = g.player;
    if (!h.spot) h.spot = { x: h.x, z: h.z };
    const py = p.vehicle ? 1.2 : 1.5;
    const sees = this.jam <= 0 && g.collision.lineOfSight(h.x, h.y - 1.5, h.z, p.x, py, p.z);
    const tx = sees ? p.x : this.lastSeen.x + Math.sin(this.flashT * 0.7) * 18;
    const tz = sees ? p.z : this.lastSeen.z + Math.cos(this.flashT * 0.5) * 18;
    const dx = tx - h.spot.x, dz = tz - h.spot.z, l = Math.hypot(dx, dz);
    const sp = Math.min(l, (sees ? 26 : 9) * dt + l * Math.min(1, dt * 2.5));
    if (l > 0.01) { h.spot.x += (dx / l) * sp; h.spot.z += (dz / l) * sp; }
    h.spotOn = sees && dist(h.spot.x, h.spot.z, p.x, p.z) < 7;
  }

  /** Light cone from the helicopter to the ground: a chain of glowing billboards and a pool of light. */
  renderSpotlight(r, env, right, up) {
    const h = this.heli;
    if (!h || h.hp <= 0 || !h.spot || this.stars < 3) return;
    const k = 0.9 - env.night * 0.4;
    const sx = h.spot.x, sz = h.spot.z;
    const ox = h.x + Math.sin(h.heading) * 2, oy = h.y - 1.2, oz = h.z + Math.cos(h.heading) * 2;
    const n = 18;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = ox + (sx - ox) * t, y = oy + (0.6 - oy) * t, z = oz + (sz - oz) * t;
      const a = 0.025 + 0.12 * (1 - t) * (1 - t);
      r.billboard(x, y, z, 0.5 + t * 4.2, a * 2.2 * k, a * 2.15 * k, a * 1.9 * k, 0, right, up);
    }
    r.groundQuad(sx, sz, 0.09, 6.5, 6.5, 0, 0.55 * k, 0.55 * k, 0.48 * k, 0);
    r.groundQuad(sx, sz, 0.1, 3.6, 3.6, 0, 0.45 * k, 0.45 * k, 0.4 * k, 0);
    r.billboard(ox, oy, oz, 1.2, 2.5 * k, 2.4 * k, 2.1 * k, 0, right, up);
    if (env.night > 0.3) r.addLight(sx, 7, sz, 14, 2.6, 2.6, 2.3);
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
