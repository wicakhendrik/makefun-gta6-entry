// Side activities and the economy: street races, Lou's export list, Sun Tokens, pickups, Bolt & Barrel, respray, safehouse.

import { dist, dist2, wrapAngle, clamp } from '../engine/math.js';
import { POI, PITCH, CITY_MAX, BEACH_X0, PIER, blockCenter, blockMin } from '../world/city.js';
import { drawMarker } from './missions.js';
import { WEAPONS } from '../combat/combat.js';

const N = (i, j) => ({ x: i * PITCH, z: j * PITCH });

export const RACES = [
  { id: 'strand', name: 'Strand Sprint', reward: 900, start: { x: 960, z: 60 }, heading: 0, checkpoints: [N(12, 3), N(12, 6), N(12, 9), N(12, 11), N(9, 11), N(9, 8), N(9, 5), N(9, 2), N(12, 2)] },
  { id: 'meridian', name: 'Meridian Loop', reward: 1300, start: { x: 320, z: 220 }, heading: Math.PI / 2, checkpoints: [N(7, 3), N(7, 7), N(3, 7), N(3, 3), N(7, 3), N(7, 7), N(3, 7), N(3, 3)] },
];

export const EXPORT_LIST = ['vanta', 'riviera', 'ranchero', 'hauler', 'cab', 'interceptor'];

export const TOKEN_SPOTS = [
  { x: PIER.x1 - 6, z: (PIER.z0 + PIER.z1) / 2 }, { x: BEACH_X0 + 60, z: 120 }, { x: BEACH_X0 + 70, z: 860 },
  { x: blockCenter(5) - 18, z: blockCenter(7) + 18 }, { x: blockCenter(6) + 20, z: blockCenter(7) - 20 },
  { x: 120, z: 968 + 16 }, { x: 600, z: 968 + 18 }, { x: -30, z: 400 }, { x: 500, z: -32 },
  { x: blockMin(1) - 3, z: blockCenter(2) + 20 }, { x: blockCenter(10), z: blockMin(9) - 3 }, { x: blockMin(8) - 3, z: blockCenter(4) },
];

export const SHOP_ITEMS = [
  { id: 'armor', label: 'Body armor (full)', price: 300 },
  { id: 'health', label: 'First-aid kit (full health)', price: 150 },
  { id: 'pistol', label: 'Hornet 9 pistol / +36 ammo', price: 400, ammo: 200 },
  { id: 'smg', label: 'Wasp MP submachine gun / +90 ammo', price: 1500, ammo: 300 },
  { id: 'shotgun', label: 'Mako 12 shotgun / +16 shells', price: 2200, ammo: 300 },
  { id: 'rifle', label: 'Sable AR rifle / +60 ammo', price: 4500, ammo: 400 },
];

export class ActivitySystem {
  constructor(game) {
    this.game = game;
    this.race = null;
    this.bestTimes = {};
    this.exported = new Set();
    this.tokens = new Set();
    this.pickups = [];
    this.hint = null;
    this.t = 0;
    this.respawnStatic();
    game.events.on('humanKilled', (h) => {
      if (h.role === 'civ' || h.role === 'goon' || h.role === 'cop') this.pickups.push({ x: h.x + 0.6, z: h.z, kind: 'cash', amount: h.cash || (h.role === 'goon' ? 120 : h.role === 'cop' ? 60 : 20), life: 30 });
      if ((h.role === 'goon' || h.role === 'cop') && Math.random() < 0.5) this.pickups.push({ x: h.x - 0.6, z: h.z, kind: 'ammo', amount: 20, life: 30 });
    });
  }

  get busy() { return !!this.race; }

  respawnStatic() {
    const P = (x, z, kind, amount) => ({ x, z, kind, amount, fixed: true, cooldown: 0 });
    this.pickups = [
      P(POI.hospital.x + 3, POI.hospital.z + 3, 'health', 100), P(POI.precinct.x + 6, POI.precinct.z + 3, 'armor', 100),
      P(POI.gunshop.x - 6, POI.gunshop.z - 2, 'ammo', 40), P(POI.safehouse.x - 3, POI.safehouse.z + 4, 'health', 100),
      P(blockCenter(5) + 10, blockCenter(7) + 3, 'armor', 50), P(blockCenter(2), blockMin(10) - 3, 'health', 50),
    ];
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.t += dt;
    this.hint = null;
    if (!p.alive) return;
    this.updatePickups(dt);
    if (this.race) { this.updateRace(dt); return; }
    const inCar = !!p.vehicle;
    const near = (poi, r) => dist2(p.x, p.z, poi.x, poi.z) < r * r;

    // race starts
    for (const race of RACES) {
      if (g.missions.active) break;
      if (near(race.start, 6)) {
        this.hint = inCar ? `${race.name} — press E to race ($${race.reward})` : `${race.name}: bring a car to race.`;
        if (inCar && g.input.pressed('KeyE')) this.startRace(race);
      }
    }
    // Lou's garage: respray and exports
    if (inCar && near(POI.garage, 8)) {
      const v = p.vehicle;
      if (g.police.stars > 0) {
        this.hint = g.money >= 250 ? 'Press E: respray and lose the heat ($250)' : 'Respray costs $250.';
        if (g.input.pressed('KeyE') && g.money >= 250) this.respray(v);
      } else if (EXPORT_LIST.includes(v.type) && !this.exported.has(v.type) && !g.missions.active) {
        this.hint = `Lou wants this ${v.spec.name}! Press E to export (+$${v.spec.value})`;
        if (g.input.pressed('KeyE')) this.exportCar(v);
      } else if (v.health < v.spec.hp) {
        this.hint = 'Press E: repair ($100)';
        if (g.input.pressed('KeyE') && g.money >= 100) { g.money -= 100; v.health = v.spec.hp; v.state = 'ok'; g.audio.ui('cash'); g.hud.toast('Repaired. Good as new.'); }
      }
    }
    if (!inCar && near(POI.gunshop, 3.5)) {
      this.hint = 'Press E to shop at Bolt & Barrel';
      if (g.input.pressed('KeyE')) g.menus.open('shop');
    }
    if (!inCar && near(POI.safehouse, 3.5)) {
      this.hint = 'Press E to save and rest at the Seabreeze Apartments';
      if (g.input.pressed('KeyE')) this.sleep();
    }
  }

  updatePickups(dt) {
    const g = this.game, p = g.player;
    for (const k of this.pickups) {
      if (k.cooldown > 0) { k.cooldown -= dt; continue; }
      if (k.life !== undefined) { k.life -= dt; if (k.life <= 0) { k.gone = true; continue; } }
      if (dist2(p.x, p.z, k.x, k.z) > 1.8 * 1.8) continue;
      if (k.kind === 'health' && p.hp >= p.maxHp) continue;
      if (k.kind === 'armor' && p.armor >= 100) continue;
      this.collect(k);
    }
    this.pickups = this.pickups.filter((k) => !k.gone);
    for (let i = 0; i < TOKEN_SPOTS.length; i++) {
      if (this.tokens.has(i)) continue;
      const s = TOKEN_SPOTS[i];
      if (dist2(p.x, p.z, s.x, s.z) < 2.2 * 2.2) {
        this.tokens.add(i);
        g.money += 250;
        g.audio.ui('cash');
        g.hud.toast(`Sun Token ${this.tokens.size}/${TOKEN_SPOTS.length} found  +$250`);
        if (this.tokens.size === TOKEN_SPOTS.length) { g.money += 5000; g.hud.bigMessage('ALL SUN TOKENS', '+$5,000 bonus', '#ffd24a'); }
      }
    }
  }

  collect(k) {
    const g = this.game, p = g.player;
    if (k.kind === 'health') p.hp = Math.min(p.maxHp, p.hp + k.amount);
    else if (k.kind === 'armor') p.armor = Math.min(100, p.armor + k.amount);
    else if (k.kind === 'cash' || k.kind === 'bag') g.money += k.amount;
    else if (k.kind === 'ammo') {
      const w = p.weapon !== 'fist' ? p.weapon : [...p.weapons][0];
      if (w) p.ammo[w] = (p.ammo[w] || 0) + (WEAPONS[w].ammoPack || 30);
    }
    g.audio.ui(k.kind === 'cash' ? 'cash' : 'checkpoint');
    if (k.kind !== 'cash') g.hud.toast({ health: 'Health', armor: 'Armor', ammo: 'Ammo', bag: 'Cash bag' }[k.kind] + ' picked up');
    if (k.fixed) k.cooldown = 60; else k.gone = true;
  }

  dropBag(x, z) { this.bag = { x, z, kind: 'bag', amount: 0, life: 999 }; this.pickups.push(this.bag); }
  takeBag() { if (this.bag) this.bag.gone = true; this.game.hud.toast('Got the cash bag'); this.game.audio.ui('cash'); }

  respray(v) {
    const g = this.game;
    g.money -= 250;
    g.police.clear();
    g.events.emit('wantedLost');
    v.health = v.spec.hp;
    const cols = v.spec.colors;
    v.tint.set(hexToRgb(cols[Math.floor(Math.random() * cols.length)]));
    g.audio.ui('cash');
    g.hud.toast("Fresh paint, new plates. The cops lost you.");
  }

  exportCar(v) {
    const g = this.game, p = g.player;
    this.exported.add(v.type);
    g.money += v.spec.value;
    g.player.controller.exitVehicle();
    v.dead = true; v.persistent = false;
    g.vehicles = g.vehicles.filter((o) => o !== v);
    g.audio.ui('cash');
    g.hud.bigMessage('EXPORT DELIVERED', `${v.spec.name}  +$${v.spec.value.toLocaleString()}  (${this.exported.size}/${EXPORT_LIST.length})`, '#7dffb0');
    p.x = POI.garage.x; p.z = POI.garage.z + 4;
    g.saveGame(true);
  }

  sleep() {
    const g = this.game;
    g.hour = 8;
    g.player.hp = g.player.maxHp;
    g.police.clear();
    g.saveGame(false);
    g.hud.bigMessage('GAME SAVED', 'Rested until 08:00', '#9fe3c8');
  }

  /* ---------- races ---------- */

  startRace(def) {
    const g = this.game, p = g.player;
    const v = p.vehicle;
    v.x = def.start.x; v.z = def.start.z; v.heading = def.heading; v.vx = 0; v.vz = 0;
    const racers = [];
    const fx = Math.sin(def.heading), fz = Math.cos(def.heading), rx = -fz, rz = fx;
    const slots = [[3.2, 0], [-3.2, -7], [3.2, -7]];
    const types = ['vanta', 'riviera', 'vanta'];
    slots.forEach(([lat, back], k) => {
      const car = g.spawnVehicle(types[k], def.start.x + rx * lat + fx * back, def.start.z + rz * lat + fz * back, def.heading, ['#ff6a1a', '#9fe3c8', '#1fa0ff'][k]);
      const driver = g.spawnHuman('civ', car.x, car.z, { detached: true });
      driver.vehicle = car; car.driver = driver; car.persistent = true;
      car.ai = { kind: 'racer', cp: 0, skill: 0.86 + k * 0.05 };
      racers.push(car);
    });
    v.x += rx * -3.2; v.z += rz * -3.2;
    this.race = { def, cp: 0, time: -3, racers, countdown: 3 };
    g.audio.ui('select');
  }

  updateRace(dt) {
    const g = this.game, p = g.player, r = this.race;
    r.time += dt;
    if (r.time < 0) {
      const c = Math.ceil(-r.time);
      if (c !== r.countdown) { r.countdown = c; g.audio.ui('move'); }
      if (p.vehicle) { p.vehicle.vx = 0; p.vehicle.vz = 0; }
      for (const car of r.racers) { car.input.throttle = 0; car.vx = 0; car.vz = 0; }
      return;
    }
    if (r.countdown > 0) { r.countdown = 0; g.audio.ui('checkpoint'); }
    if (!p.vehicle || !p.alive) { this.endRace(false, 'You left your car.'); return; }
    const cps = r.def.checkpoints;
    const target = cps[r.cp];
    if (dist(p.vehicle.x, p.vehicle.z, target.x, target.z) < 12) {
      r.cp++;
      g.audio.ui('checkpoint');
      if (r.cp >= cps.length) { this.finishRace(); return; }
    }
    for (const car of r.racers) this.driveRacer(car, dt);
  }

  driveRacer(car, dt) {
    const cps = this.race.def.checkpoints;
    const ai = car.ai;
    if (!car.driver || car.state !== 'ok' || ai.cp >= cps.length) { car.input.throttle = 0; car.input.handbrake = true; return; }
    const t = cps[ai.cp];
    const d = dist(car.x, car.z, t.x, t.z);
    if (d < 12) { ai.cp++; if (ai.cp >= cps.length) { ai.finished = this.race.time; return; } }
    const ang = wrapAngle(Math.atan2(t.x - car.x, t.z - car.z) - car.heading);
    car.input.steer = clamp(ang * 2.5, -1, 1);
    const next = cps[Math.min(ai.cp + 1, cps.length - 1)];
    const turn = Math.abs(wrapAngle(Math.atan2(next.x - t.x, next.z - t.z) - Math.atan2(t.x - car.x, t.z - car.z)));
    let want = car.spec.top * ai.skill;
    if (d < 45 && turn > 0.8) want = 15;
    if (Math.abs(ang) > 0.6) want = Math.min(want, 12);
    car.input.throttle = clamp((want - car.forwardSpeed) * 0.3, -1, 1);
    car.input.handbrake = false;
    if (car.speed < 1 && this.race.time > 2) { ai.stuck = (ai.stuck || 0) + dt; if (ai.stuck > 2) { car.heading += Math.PI / 2; ai.stuck = 0; } }
  }

  racePosition() {
    const r = this.race;
    if (!r) return 0;
    const p = this.game.player;
    const cps = r.def.checkpoints;
    const progress = (cp, x, z) => cp * 10000 - (cp < cps.length ? dist(x, z, cps[cp].x, cps[cp].z) : 0);
    const mine = progress(r.cp, p.x, p.z);
    let pos = 1;
    for (const c of r.racers) if (progress(c.ai.cp, c.x, c.z) > mine) pos++;
    return pos;
  }

  finishRace() {
    const g = this.game, r = this.race;
    const pos = this.racePosition();
    const t = r.time;
    const best = this.bestTimes[r.def.id];
    if (!best || t < best) this.bestTimes[r.def.id] = t;
    if (pos === 1) {
      g.money += r.def.reward;
      g.hud.bigMessage('RACE WON', `${r.def.name}  ${t.toFixed(1)}s  +$${r.def.reward}`, '#ffd24a');
      g.audio.missionPassed();
    } else {
      g.hud.bigMessage(`FINISHED ${pos}${['st', 'nd', 'rd', 'th'][Math.min(pos - 1, 3)]}`, `${r.def.name}  ${t.toFixed(1)}s`, '#9fe3c8');
    }
    this.endRace(true);
    g.saveGame(true);
  }

  endRace(finished, reason) {
    const g = this.game;
    if (!finished) { g.hud.bigMessage('RACE ABANDONED', reason || '', '#ff5a5a'); g.audio.missionFailed(); }
    for (const c of this.race.racers) { c.persistent = false; c.ai = null; }
    this.race = null;
  }

  raceTarget() {
    const r = this.race;
    return r && r.cp < r.def.checkpoints.length ? r.def.checkpoints[r.cp] : null;
  }

  render(r, right, up) {
    const g = this.game;
    const pulse = 0.75 + Math.sin(this.t * 4) * 0.25;
    for (const k of this.pickups) {
      if (k.cooldown > 0) continue;
      const col = { health: [0.3, 1, 0.4], armor: [0.35, 0.6, 1], ammo: [1, 0.6, 0.2], cash: [0.4, 1, 0.5], bag: [1, 0.85, 0.2] }[k.kind];
      const y = 0.7 + Math.sin(this.t * 3 + k.x) * 0.15;
      r.billboard(k.x, y, k.z, 0.45, col[0] * 1.6, col[1] * 1.6, col[2] * 1.6, 0, right, up);
      r.billboard(k.x, y, k.z, 0.18, 1.5, 1.5, 1.5, 0, right, up);
    }
    for (let i = 0; i < TOKEN_SPOTS.length; i++) {
      if (this.tokens.has(i)) continue;
      const s = TOKEN_SPOTS[i];
      if (dist2(s.x, s.z, g.player.x, g.player.z) > 120 * 120) continue;
      const y = 1.2 + Math.sin(this.t * 2 + i) * 0.25;
      r.billboard(s.x, y, s.z, 0.6 * pulse, 2, 1.5, 0.3, 0, right, up);
      r.billboard(s.x, y, s.z, 1.4, 0.5, 0.35, 0.05, 0, right, up);
    }
    if (this.race) {
      const t = this.raceTarget();
      if (t) {
        r.groundQuad(t.x, t.z, 0.09, 7, 7, 0, 0.1, 0.5, 0.9, 0);
        for (let y = 1; y < 9; y += 1.2) r.billboard(t.x, y, t.z, 1.1, 0.2, 0.7, 1.4, 0, right, up);
      }
    } else if (!g.missions.active) {
      for (const race of RACES) drawMarker(r, race.start.x, race.start.z, [0.3, 0.7, 1], pulse, right, up);
    }
    drawMarker(r, POI.gunshop.x, POI.gunshop.z, [1, 0.55, 0.2], pulse * 0.7, right, up);
    drawMarker(r, POI.safehouse.x, POI.safehouse.z, [0.5, 1, 0.8], pulse * 0.7, right, up);
  }
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
