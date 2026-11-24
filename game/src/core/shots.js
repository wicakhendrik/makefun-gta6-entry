// Screenshot scenes (?shot=name): stage a moment of real gameplay, simulate it for a few seconds, then freeze.

import { STORY } from '../story/script.js';
import { POI, blockCenter, blockMin } from '../world/city.js';
import { lanePoint, headingOfDir } from '../world/roads.js';

function startMissionAt(g, id, index, runSteps = []) {
  const def = STORY.find((m) => m.id === id);
  g.missions.start(def);
  const a = g.missions.active;
  for (const k of runSteps) a.steps[k].start(g, a);
  a.index = index;
  a.stepStarted = false;
  g.hud.dialogue = [];
  g.hud.title = null;
  g.hud.objective = null;
  const step = a.steps[index];
  if (step && step.text) g.hud.setObjective(step.text);
  g.hud.objectiveFlash = 0;
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

/** Shared staging for the HUD systems: arsenal with clips, crew cooldowns, respect and the radio song. */
function kit(g, weapons, current, mag) {
  const p = g.player;
  p.weapons = new Set(Object.keys(weapons));
  p.ammo = { ...weapons };
  p.mag = {};
  p.weapon = current;
  if (mag !== undefined) p.mag[current] = mag;
}

function respect(g, kills, stolen, hp = 100, armor = 0) {
  Object.assign(g.stats, { kills, stolen, wrecked: Math.round(kills / 3), driven: 42000 });
  g.player.hp = hp; g.player.armor = armor;
}

function radioOn(g, station, song, progress) {
  g.radio.index = station;
  g.radio.song[station] = song;
  g.radio.songStep = Math.round(progress * 384);
  g.hud.radioFlash = 2.5;
}

function say(g, who, text, typed = 1) {
  g.hud.dialogue = [{ who, text }];
  g.hud.dialogueTime = (text.length * typed) / 55;
}

export const SHOTS = {
  /** Cover: a sunset police chase up Ocean Drive: dispatch tactics, spotlight helicopter, roadblock ahead. */
  chase(g) {
    g.hour = 18.2;
    g.money = 14370;
    kit(g, { bat: 0, pistol: 84, smg: 168 }, 'smg', 19);
    g.missions.done = new Set(['homecoming', 'debt_collector']);
    respect(g, 41, 23, 86, 45);
    startMissionAt(g, 'special_order', 4);
    const [x, z] = lanePoint(12, 8, 3, 30);
    const car = putPlayerInCar(g, 'vanta', x, z, headingOfDir(3), '#e8322e', 24);
    car.health = 590;
    g.police.setMinStars(3);
    for (const [dz, dx] of [[13, -3], [27, 3.2], [44, -2]]) {
      const v = g.police.spawnUnitAt(x + dx, z + dz, headingOfDir(3));
      v.vz = -20; v.ai.i = 12; v.ai.j = 8; v.ai.d = 3;
    }
    g.police.spawnHeli();
    g.police.heli.x = x - 30; g.police.heli.z = z - 10; g.police.heli.y = 30;
    g.police.heli.spot = { x, z };
    for (let k = 0; k < 14; k++) g.traffic.spawnCar(25, 180);
    for (let k = 0; k < 30; k++) g.peds.spawnPed(8, 90);
    g.autopilot = () => { const v = g.player.vehicle; if (v) { v.input.throttle = 1; v.input.steer = (x + 0.5 - v.x) * 0.05; } };
    simulate(g, 1.4);
    g.police.placeRoadblock(1);
    simulate(g, 0.3);
    g.crew.cool.teo = 38;
    radioOn(g, 0, 1, 0.42);
    say(g, 'LOU', 'Lose them before the docks, mijo! Teo has a garage door open on Saltmarsh.', 1);
    g.police.radio('KILO-28: making contact, going to ram.');
    g.hud.toasts = [];
    // look back over the shoulder at the pursuit (mouse look)
    g.camera.yaw = -0.62; g.camera.pitch = 0.2; g.camera.lookTimer = 99;
    g.camera.update(1, g);
    // hang the helicopter in the upper middle of the view, its spotlight on the car
    const h = g.police.heli, pv = g.player.vehicle, eye = g.camera.eye, tg = g.camera.target;
    const fx = tg[0] - eye[0], fz = tg[2] - eye[2], fl = Math.hypot(fx, fz) || 1;
    h.x = eye[0] + (fx / fl) * 34 + (fz / fl) * 6; h.z = eye[2] + (fz / fl) * 34 - (fx / fl) * 6; h.y = eye[1] + 9;
    h.heading = Math.atan2(pv.x - h.x, pv.z - h.z); h.vx = 4; h.vz = -6;
    h.spot = { x: pv.x + 0.5, z: pv.z + 1 }; h.spotOn = true;
    g.police.assignTactics();
  },

  /** On foot at the Pier 9 warehouse: a rocket into the goons' car, Nyla's supply drop, shotgun and launcher. */
  gunfight(g) {
    g.hour = 16.9;
    g.money = 22920;
    kit(g, { bat: 0, pistol: 60, smg: 142, shotgun: 18, launcher: 3 }, 'launcher', 0);
    g.player.armor = 88; g.player.hp = 74;
    g.missions.done = new Set(['homecoming', 'special_order', 'debt_collector']);
    respect(g, 96, 38, 74, 40);
    startMissionAt(g, 'pier9', 3, [1]);
    const p = g.player;
    p.x = POI.warehouse.x - 26; p.z = POI.warehouse.z - 8; p.heading = 1.1;
    g.camera.yaw = 1.1; g.camera.pitch = 0.1;
    const target = g.spawnVehicle('bayside', POI.warehouse.x + 2, POI.warehouse.z - 4, 1.2, '#18181c');
    for (let k = 0; k < 10; k++) g.peds.spawnPed(30, 90);
    const goons = g.humans.filter((h) => h.role === 'goon');
    for (const h of goons) h.ai.mode = 'fight';
    if (goons[2]) { goons[2].hp = 0; goons[2].state = 'dead'; }
    g.autopilot = () => { p.hp = 74; p.wantX = 0; p.wantZ = 0; };
    simulate(g, 0.8);
    p.x = POI.warehouse.x - 26; p.z = POI.warehouse.z - 8; p.hitFlash = 0;
    g.fx.p = g.fx.p.filter((q) => q.kind !== 'blood');
    g.camera.aiming = true;
    g.camera.yaw = 1.12; g.camera.pitch = 0.12; g.camera.lookTimer = 99;
    g.camera.update(1, g);
    p.heading = g.camera.yaw;
    g.police.clear();
    // fire a real rocket at the car and let it fly and burst
    const eye = g.camera.eye;
    const dx = target.x - eye[0], dy = 0.9 - eye[1], dz = target.z - eye[2], l = Math.hypot(dx, dy, dz);
    p.mag = { launcher: 1 }; p.ammo.launcher = 3; p.fireCooldown = 0; p.reloading = 0;
    g.combat.fire(p, p.x, 1.4, p.z, dx / l, dy / l, dz / l, p.x + 0.5, 1.4, p.z + 0.4);
    simulate(g, 0.62);
    g.autopilot = null;
    g.police.clear();
    g.police.call = null;
    g.crew.use('nyla');
    g.crew.cool.lou = 12;
    say(g, 'NYLA', 'Bag is under the bench. Vest, rounds, gum. Go.', 1);
    g.camera.update(1, g);
    g.hud.hitMarker = 0.3;
  },

  /** Night on the Strand: a timed run to the fountain with a roadblock lit up ahead. */
  neon(g) {
    g.hour = 21.5;
    g.money = 31400;
    kit(g, { bat: 0, pistol: 60, smg: 90, shotgun: 24, rifle: 120 }, 'pistol', 7);
    g.missions.done = new Set(['homecoming', 'special_order', 'debt_collector', 'pier9']);
    respect(g, 150, 61, 92, 70);
    startMissionAt(g, 'clean_hands', 2, [1]);
    g.missions.active.timer = 58;
    const [x, z] = lanePoint(10, 7, 3, 62);
    g.vehicles = g.vehicles.filter((v) => Math.hypot(v.x - x, v.z - z) > 45);
    putPlayerInCar(g, 'vanta', x, z, headingOfDir(3), '#ffcc22', 19);
    g.police.setMinStars(2);
    for (const [dz, dx] of [[15, -2.5], [31, 2.5]]) { const v = g.police.spawnUnitAt(x + dx, z + dz, headingOfDir(3)); v.vz = -18; v.ai.i = 10; v.ai.j = 7; v.ai.d = 3; }
    for (let k = 0; k < 14; k++) g.traffic.spawnCar(25, 150);
    for (let k = 0; k < 30; k++) g.peds.spawnPed(6, 70);
    g.autopilot = () => { const v = g.player.vehicle; if (v) { v.input.throttle = v.speed < 19 ? 0.8 : 0; v.input.steer = (x - v.x) * -0.05; } };
    simulate(g, 0.8);
    g.police.placeRoadblock(1);
    simulate(g, 0.4);
    radioOn(g, 1, 1, 0.7);
    g.hud.radioFlash = 0;
    g.crew.cool.lou = 31; g.crew.cool.nyla = 52;
    g.hud.dialogue = [];
    g.camera.yaw = headingOfDir(3) + 0.12; g.camera.pitch = 0.1; g.camera.lookTimer = 99;
    g.camera.update(1, g);
    g.police.assignTactics();
  },

  /** Midday on Coral Strand by the beach: Teo on the phone and a radio song change. */
  strand(g) {
    g.hour = 12.6;
    g.money = 9850;
    kit(g, { pistol: 48 }, 'pistol', 12);
    g.missions.done = new Set(['homecoming', 'special_order']);
    respect(g, 18, 15, 100, 25);
    startMissionAt(g, 'debt_collector', 2, [1]);
    const [x, z] = lanePoint(9, 6, 0, 8);
    putPlayerInCar(g, 'riviera', x, z, headingOfDir(0), '#9fe3c8', 16);
    for (let k = 0; k < 16; k++) g.traffic.spawnCar(20, 160);
    for (let k = 0; k < 40; k++) g.peds.spawnPed(6, 80);
    g.autopilot = () => { const v = g.player.vehicle; if (v) { v.input.throttle = v.speed < 15 ? 0.6 : 0; v.input.steer = (z - v.z) * -0.05; } };
    simulate(g, 1.2);
    radioOn(g, 2, 0, 0.08);
    say(g, 'TEO', 'Rocco owes me nine grand. Bring the money, leave his knees. Mostly.', 1);
    g.hud.districtShow = 3; g.hud.district = 'strand';
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
  const keys = ['vanta', 'riviera', 'bayside', 'cub', 'hauler', 'ranchero', 'cab', 'interceptor', 'regent'];
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
  g.hud.displayMoney = g.money;
  g.state = 'playing';
  g.frozen = true;
  return true;
}

export { blockCenter, blockMin };
