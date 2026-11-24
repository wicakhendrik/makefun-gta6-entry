// Screenshot scenes (?shot=name): stage a moment of real gameplay, simulate it for a few seconds, then freeze.

import { STORY } from '../story/script.js';
import { POI, blockCenter, blockMin } from '../world/city.js';
import { lanePoint, headingOfDir } from '../world/roads.js';
import { STATIONS } from '../audio/music.js';

function startMissionAt(g, id, index, runSteps = []) {
  const def = STORY.find((m) => m.id === id);
  g.missions.start(def);
  const a = g.missions.active;
  for (const k of runSteps) a.steps[k].start(g, a);
  a.index = index;
  a.stepStarted = false;
  g.hud.dialogue = [];
  g.hud.title = null;
}

function putPlayerInCar(g, type, x, z, heading, color, speed = 0) {
  const v = g.spawnVehicle(type, x, z, heading, color);
  g.playerCtl.enterVehicle(v);
  v.vx = Math.sin(heading) * speed; v.vz = Math.cos(heading) * speed;
  g.camera.yaw = heading;
  g.hud.vehicleName = null;
  return v;
}

function simulate(g, seconds) {
  const n = Math.round(seconds * 60);
  for (let k = 0; k < n; k++) g.step(1 / 60);
}

/** Put a staged line in the dialogue box, already fully typed out. */
function sayNow(g, who, text) {
  g.hud.dialogue = [{ who, text, hold: true }];
  g.hud.dialogueTime = 99;
}

/** Hover the police helicopter in view (ahead along the camera ray, `up` and `side` in screen units). */
function heliInView(g, ahead, side, up) {
  const cam = g.camera, p = g.player, e = cam.eye;
  const fx = cam.target[0] - e[0], fy = cam.target[1] - e[1], fz = cam.target[2] - e[2], l = Math.hypot(fx, fy, fz);
  const f = [fx / l, fy / l, fz / l], rl = Math.hypot(f[0], f[2]) || 1;
  const right = [-f[2] / rl, 0, f[0] / rl];
  const u = [-right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1]];
  const h = g.police.heli;
  h.x = e[0] + f[0] * ahead + right[0] * side * ahead + u[0] * up * ahead;
  h.y = e[1] + f[1] * ahead + u[1] * up * ahead;
  h.z = e[2] + f[2] * ahead + right[2] * side * ahead + u[2] * up * ahead;
  h.vx = 4; h.vz = -6;
  h.heading = Math.atan2(p.x - h.x, p.z - h.z);
  h.spot = { x: p.x, z: p.z }; h.spotOn = true;
}

/** Pursuit cars strung out behind the player along a lane, each picking its tactic on the first steps. */
function pursuers(g, x, z, heading, offsets) {
  const fx = Math.sin(heading), fz = Math.cos(heading), rx = fz, rz = -fx;
  const out = [];
  for (const [back, lat] of offsets) {
    const v = g.police.spawnUnit();
    if (!v) continue;
    v.x = x - fx * back + rx * lat; v.z = z - fz * back + rz * lat; v.heading = heading;
    v.vx = fx * 20; v.vz = fz * 20;
    out.push(v);
  }
  return out;
}

export const SHOTS = {
  /** Cover: a sunset pursuit up Ocean Drive — five units, a roadblock ahead and AIR ONE's spotlight on the car. */
  chase(g) {
    g.hour = 18.05;
    g.money = 14370;
    g.respect.points = 2620;
    const p = g.player;
    p.weapons = new Set(['pistol', 'smg', 'bat']); p.ammo = { pistol: 84, smg: 186 }; p.weapon = 'smg';
    p.clip = { smg: 24 }; p.armor = 58; p.hp = 86;
    g.missions.done = new Set(['homecoming', 'debt_collector']);
    startMissionAt(g, 'special_order', 4);
    g.crew.cool.nina = 27;
    const [x, z] = lanePoint(12, 8, 3, 30);
    const car = putPlayerInCar(g, 'vanta', x, z, headingOfDir(3), '#e8322e', 22);
    car.health = 560;
    g.police.setMinStars(4);
    g.police.unitCount = 0;
    const units = pursuers(g, x, z, headingOfDir(3), [[15, -3], [27, 3.2], [42, -2], [60, 2.5], [84, -1]]);
    for (let k = 0; k < 14; k++) g.traffic.spawnCar(25, 180);
    for (let k = 0; k < 30; k++) g.peds.spawnPed(8, 90);
    g.police.roadblocks.place(12 * 80, 5 * 80 + 17, 3, [1, 0]);
    g.police.spawnHeli();
    g.radio.index = 0; g.radio.songOf[0] = 1;
    g.autopilot = () => { const v = g.player.vehicle; if (v) { v.input.throttle = 1; v.input.steer = (x + 0.5 - v.x) * 0.05; } };
    simulate(g, 1.4);
    // the last unit took a hit and is burning out behind the pack
    const last = units[units.length - 1];
    if (last) { last.health = 0; last.state = 'burning'; last.burnTime = 3; last.driver = null; for (let k = 0; k < 40; k++) g.fx.fire(last.x, 0.8, last.z); }
    // the second unit just went up after a crash: catch the fireball a few frames in
    const hit = units[1];
    if (hit) {
      hit.health = 0; hit.state = 'burning'; hit.burnTime = 3; hit.vx *= 0.3; hit.vz *= 0.3;
      g.fx.explosion(hit.x, 1, hit.z);
      for (let k = 0; k < 6; k++) g.fx.update(1 / 60);
    }
    g.camera.yaw = -0.3; g.camera.pitch = 0.17; g.camera.lookTimer = 99;
    g.camera.update(1, g);
    heliInView(g, 52, 0, 0.27);
    { const h = g.police.heli; h.x = 957.5; h.z = g.player.z + 46; h.y = 14; h.heading = Math.atan2(g.player.x - h.x, g.player.z - h.z); }
    g.hud.showStation({ name: 'SUNWAVE 88.1' });
    g.hud.songCard.station = 'NOW PLAYING · SUNWAVE 88.1';
    sayNow(g, 'DISPATCH', 'AIR ONE has him lit up on Ocean Drive. CORAL-12, put that Vanta into the wall!');
  },

  /** Golden hour at Pier 9: the Pelican RL in action against Crane's crew, a car going up, police rolling in. */
  docks(g) {
    g.hour = 17.1;
    g.money = 9920;
    g.respect.points = 1720;
    const p = g.player;
    p.weapons = new Set(['pistol', 'smg', 'bat', 'launcher']); p.ammo = { pistol: 60, smg: 142, launcher: 4 }; p.weapon = 'launcher';
    p.clip = { launcher: 1 };
    p.armor = 64; p.hp = 78;
    g.missions.done = new Set(['homecoming', 'special_order', 'debt_collector']);
    startMissionAt(g, 'pier9', 3, [1]);
    g.crew.cool.dex = 41;
    p.x = POI.warehouse.x - 30; p.z = POI.warehouse.z - 9; p.heading = 1.15;
    g.camera.yaw = 1.15; g.camera.pitch = 0.12;
    const wreck = g.spawnVehicle('bayside', POI.warehouse.x + 2, POI.warehouse.z - 6, 1.2, '#18181c');
    const target = g.spawnVehicle('ranchero', POI.warehouse.x - 6, POI.warehouse.z - 1, 2.6, '#2f3f5c');
    for (let k = 0; k < 10; k++) g.peds.spawnPed(30, 90);
    const goons = g.humans.filter((h) => h.role === 'goon');
    for (const h of goons) h.ai.mode = 'fight';
    goons[2].hp = 0; goons[2].state = 'dead'; goons[5].hp = 0; goons[5].state = 'dead';
    g.police.setMinStars(2);
    g.police.spawnUnit(); g.police.spawnUnit();
    g.autopilot = () => { p.hp = 78; p.wantX = 0; p.wantZ = 0; };
    simulate(g, 1.0);
    wreck.health = 0; wreck.state = 'burning'; wreck.burnTime = 0.05;
    simulate(g, 0.25);
    g.autopilot = null;
    p.x = POI.warehouse.x - 30; p.z = POI.warehouse.z - 9; p.hitFlash = 0;
    g.fx.p = g.fx.p.filter((q) => q.kind !== 'blood');
    g.camera.aiming = false;
    g.camera.yaw = 1.5; g.camera.pitch = 0.12; g.camera.lookTimer = 99;
    g.camera.update(1, g);
    p.heading = 1.15;
    // fire a rocket at the pickup and catch it halfway
    const eye = g.camera.eye;
    const dx = target.x - eye[0], dy = 0.9 - eye[1], dz = target.z - eye[2], l = Math.hypot(dx, dy, dz);
    p.fireCooldown = 0; p.reloading = 0;
    g.combat.fire(p, p.x, 1.45, p.z, dx / l, dy / l, dz / l, p.x + 0.45, 1.45, p.z + 0.5);
    for (let k = 0; k < 17; k++) { g.rockets.update(1 / 60); g.fx.update(1 / 60); }
    g.fx.p = g.fx.p.filter((q) => q.kind !== 'flash');
    g.fx.flashes = [];
    g.police.unseen = 0;
    g.hud.hitMarker = 0;
    sayNow(g, 'TEO', 'It sits in a warehouse at Pier 9, guarded by his crew. Go loud or go home.');
  },

  /** Night on the Strand: a motorbike under AIR ONE's spotlight, neon, light bars and a ticking mission clock. */
  night(g) {
    g.hour = 22.3;
    g.money = 23400;
    g.respect.points = 3420;
    const p = g.player;
    p.weapons = new Set(['pistol', 'smg', 'shotgun', 'bat']); p.ammo = { pistol: 60, smg: 120, shotgun: 24 }; p.weapon = 'smg';
    p.clip = { smg: 30 }; p.armor = 40;
    g.missions.done = new Set(['homecoming', 'special_order', 'debt_collector', 'pier9']);
    startMissionAt(g, 'clean_hands', 2);
    g.missions.active.timer = 47;
    g.crew.cool.dex = 52; g.crew.cool.bea = 18;
    const [x, z] = lanePoint(10, 7, 3, 60);
    g.vehicles = g.vehicles.filter((v) => Math.hypot(v.x - x, v.z - z) > 45);
    const bike = putPlayerInCar(g, 'bike', x, z, headingOfDir(3), '#ff3fa4', 20);
    bike.health = 390;
    g.police.setMinStars(3);
    g.police.unitCount = 3;
    pursuers(g, x, z, headingOfDir(3), [[13, -2.5], [26, 2.5], [44, 0]]);
    for (let k = 0; k < 14; k++) g.traffic.spawnCar(25, 150);
    for (let k = 0; k < 30; k++) g.peds.spawnPed(6, 70);
    g.police.spawnHeli();
    g.radio.index = 2; g.radio.songOf[2] = 3;
    g.autopilot = () => { const v = g.player.vehicle; if (v) { v.input.throttle = v.speed < 20 ? 0.8 : 0; v.input.steer = (x - v.x) * -0.05 + 0.25; } };
    simulate(g, 1.2);
    g.camera.yaw = 0.5; g.camera.pitch = 0.16; g.camera.lookTimer = 99;
    g.camera.update(1, g);
    heliInView(g, 46, -0.1, 0.09);
    { const h = g.police.heli; h.x = g.player.x - 3; h.z = g.player.z + 36; h.y = 15; h.heading = Math.atan2(g.player.x - h.x, g.player.z - h.z); }
    g.hud.showSong(g.radio.nowPlaying);
    sayNow(g, 'DET. MARR', 'Take it to my partner at the Halcyon Park fountain. Ninety seconds — Crane has eyes on this building.');
  },

  /** Midday in El Mercado: Rocco's Riviera is smoking in the street and Marco walks up with the Gaff Bat. */
  mercado(g) {
    g.hour = 13.4;
    g.money = 6120;
    g.respect.points = 960;
    const p = g.player;
    p.weapons = new Set(['pistol', 'bat']); p.ammo = { pistol: 54 }; p.weapon = 'bat';
    p.armor = 20; p.hp = 92;
    g.missions.done = new Set(['homecoming', 'special_order']);
    startMissionAt(g, 'debt_collector', 6, [1, 5]);
    g.crew.cool.nina = 12;
    const rocco = g.humans.find((h) => h.role === 'goon' && h.missionOwned);
    const car = g.vehicles.find((v) => v.type === 'riviera' && v.missionOwned);
    car.health = 260; car.heading += 0.35; car.bump = 1; car.vx = 0; car.vz = 0; car.ai = { kind: 'parked' }; car.driver = null;
    for (let k = 0; k < 14; k++) g.traffic.spawnCar(30, 150);
    for (let k = 0; k < 45; k++) g.peds.spawnPed(5, 70);
    const cfx = Math.sin(car.heading), cfz = Math.cos(car.heading), crx = cfz, crz = -cfx;
    const place = () => {
      rocco.x = car.x + cfx * 7 + crx * 1.5; rocco.z = car.z + cfz * 7 + crz * 1.5;
      p.x = car.x - cfx * 6.5 - crx * 2.4; p.z = car.z - cfz * 6.5 - crz * 2.4;
    };
    place();
    rocco.ai = { mode: 'idle' }; rocco.wantX = 0; rocco.wantZ = 0;
    p.heading = Math.atan2(rocco.x - p.x, rocco.z - p.z);
    g.police.setMinStars(1);
    g.autopilot = () => { p.wantX = 0; p.wantZ = 0; rocco.wantX = 0; rocco.wantZ = 0; rocco.heading = Math.atan2(p.x - rocco.x, p.z - rocco.z); };
    simulate(g, 0.8);
    for (let k = 0; k < 30; k++) g.fx.smoke(car.x + Math.sin(car.heading) * 1.8, 1.1, car.z + Math.cos(car.heading) * 1.8, k % 2 === 0);
    place();
    p.heading = Math.atan2(rocco.x - p.x, rocco.z - p.z);
    g.camera.yaw = p.heading + 0.42; g.camera.pitch = 0.12; g.camera.lookTimer = 99;
    g.camera.update(1, g);
    p.punch = 0.12;
    g.hint = null;
    sayNow(g, 'ROCCO', 'Okay, okay! Not the face! Tell Teo he gets every peso, I swear on my mother!');
  },
};

/** Debug view: traffic and pedestrians around a junction seen from above after half a minute of simulation. */
SHOTS.overhead = (g) => {
  g.hour = 13;
  const p = g.player;
  p.x = 560; p.z = 560;
  for (let k = 0; k < 30; k++) g.traffic.spawnCar(10, 150);
  for (let k = 0; k < 40; k++) g.peds.spawnPed(5, 80);
  simulate(g, 25);
  g.camera.update = function () { this.eye = [p.x + 1, 75, p.z + 40]; this.target = [p.x, 0, p.z]; this.fov = 1.1; };
  g.camera.update();
  const stuck = g.vehicles.filter((v) => v.ai && v.ai.kind === 'traffic' && v.speed < 0.5).length;
  const moving = g.vehicles.filter((v) => v.ai && v.ai.kind === 'traffic').length;
  const damaged = g.vehicles.filter((v) => v.ai && v.health < v.spec.hp * 0.7).length;
  console.log('[test]', 'traffic', moving, 'stopped', stuck, 'damaged', damaged);
};

/** Debug view: the car lineup parked in a row. */
SHOTS.cars = (g) => {
  g.hour = 15;
  const keys = ['vanta', 'riviera', 'bayside', 'cub', 'hauler', 'ranchero', 'cab', 'interceptor', 'regent', 'bike'];
  const p = g.player; p.x = 1010; p.z = 300;
  g.vehicles = []; g.humans = [p];
  keys.forEach((k, i) => g.spawnVehicle(k, 1000 + (i % 5) * 6, 312 + Math.floor(i / 5) * 9, 2.4));
  g.camera.update = function () { this.eye = [1000, 6, 290]; this.target = [1014, 0.5, 318]; this.fov = 0.9; };
  g.camera.update();
};

export function runShot(g, name) {
  if (name === 'title') { g.toTitle(); g.time = 40; return true; }
  const scene = SHOTS[name];
  if (!scene) return false;
  g.shotMode = true;
  g.newGame();
  g.hud.big = null;
  g.hud.dialogue = [];
  g.hud.toasts = [];
  g.input.wantLock = false;
  scene(g);
  g.autopilot = null;
  g.state = 'playing';
  g.frozen = true;
  g.hud.displayMoney = g.money;
  return true;
}

export { blockCenter, blockMin };
