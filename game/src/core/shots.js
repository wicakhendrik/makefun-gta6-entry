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

export const SHOTS = {
  /** Cover: a sunset police chase up Ocean Drive with the helicopter overhead and the mission objective. */
  chase(g) {
    g.hour = 18.25;
    g.money = 4370;
    g.player.weapons = new Set(['pistol', 'smg']); g.player.ammo = { pistol: 84, smg: 210 }; g.player.weapon = 'smg';
    g.missions.done = new Set(['homecoming']);
    startMissionAt(g, 'special_order', 4);
    const [x, z] = lanePoint(12, 8, 3, 30);
    const car = putPlayerInCar(g, 'vanta', x, z, headingOfDir(3), '#e8322e', 20);
    car.health = 610;
    g.police.setMinStars(3);
    for (const [dz, dx] of [[16, -3], [30, 3.2], [48, -2]]) {
      const v = g.police.spawnUnit();
      v.x = x + dx; v.z = z + dz; v.heading = headingOfDir(3); v.vx = 0; v.vz = -18;
      v.ai.i = 12; v.ai.j = 8; v.ai.d = 3;
    }
    g.police.spawnHeli();
    g.police.heli.x = x - 30; g.police.heli.z = z - 10; g.police.heli.y = 30;
    for (let k = 0; k < 14; k++) g.traffic.spawnCar(25, 180);
    for (let k = 0; k < 30; k++) g.peds.spawnPed(8, 90);
    g.autopilot = () => { const v = g.player.vehicle; if (v) { v.input.throttle = 1; v.input.steer = (x + 0.5 - v.x) * 0.05; } };
    simulate(g, 1.6);
    // look back over the shoulder at the pursuit (mouse look)
    g.camera.yaw = -0.55; g.camera.pitch = 0.16; g.camera.lookTimer = 99;
    g.camera.update(1, g);
  },

  /** Afternoon cruise on Coral Strand toward the beach and Sunfall Pier, radio on. */
  strand(g) {
    g.hour = 16.6;
    g.money = 12850;
    g.player.weapons = new Set(['pistol']); g.player.ammo = { pistol: 48 }; g.player.weapon = 'pistol';
    g.missions.done = new Set(['homecoming', 'special_order']);
    startMissionAt(g, 'debt_collector', 2, [1]);
    const [x, z] = lanePoint(9, 6, 0, 8);
    putPlayerInCar(g, 'riviera', x, z, headingOfDir(0), '#9fe3c8', 16);
    for (let k = 0; k < 16; k++) g.traffic.spawnCar(20, 160);
    for (let k = 0; k < 40; k++) g.peds.spawnPed(6, 80);
    g.autopilot = () => { const v = g.player.vehicle; if (v) { v.input.throttle = v.speed < 15 ? 0.6 : 0; v.input.steer = (z - v.z) * -0.05; } };
    simulate(g, 1.2);
    g.radio.index = 0;
    g.hud.showStation(STATIONS[0]);
    g.hud.districtShow = 3; g.hud.district = 'strand';
  },

  /** Gunfight at the Pier 9 warehouse during the docks mission. */
  docks(g) {
    g.hour = 17.7;
    g.money = 8920;
    g.player.weapons = new Set(['pistol', 'smg']); g.player.ammo = { pistol: 60, smg: 142 }; g.player.weapon = 'smg';
    g.player.armor = 64; g.player.hp = 82;
    g.missions.done = new Set(['homecoming', 'special_order', 'debt_collector']);
    startMissionAt(g, 'pier9', 3, [1]);
    const p = g.player;
    p.x = POI.warehouse.x - 26; p.z = POI.warehouse.z - 8; p.heading = 1.1;
    g.camera.yaw = 1.1; g.camera.pitch = 0.1;
    const wreck = g.spawnVehicle('bayside', POI.warehouse.x + 4, POI.warehouse.z - 5, 1.2, '#18181c');
    wreck.health = 0; wreck.state = 'burning'; wreck.burnTime = 0.85; wreck.killedBy = p;
    for (let k = 0; k < 10; k++) g.peds.spawnPed(30, 90);
    const goons = g.humans.filter((h) => h.role === 'goon');
    for (const h of goons) h.ai.mode = 'fight';
    goons[2].hp = 0; goons[2].state = 'dead'; goons[5].state = 'dead';
    g.autopilot = () => { p.hp = 82; p.wantX = 0; p.wantZ = 0; };
    simulate(g, 1.0);
    g.autopilot = null;
    p.x = POI.warehouse.x - 26; p.z = POI.warehouse.z - 8; p.hitFlash = 0;
    g.fx.p = g.fx.p.filter((q) => q.kind !== 'blood');
    g.camera.aiming = false;
    g.camera.yaw = 1.1; g.camera.pitch = 0.16; g.camera.lookTimer = 99;
    g.camera.update(1, g);
    p.heading = 1.1;
    g.police.clear();
    const target = goons.find((h) => h.state !== 'dead');
    const eye = g.camera.eye;
    if (target) {
      const dx = target.x - eye[0], dy = 1.3 - eye[1], dz = target.z - eye[2], l = Math.hypot(dx, dy, dz);
      p.fireCooldown = 0;
      g.combat.fire(p, p.x, 1.4, p.z, dx / l, dy / l, dz / l, p.x + 0.4, 1.35, p.z + 0.5);
    }
    g.hud.hitMarker = 0.3;
  },

  /** Night on the Strand: neon, lamps, and a pursuit with the light bars lighting up the street. */
  night(g) {
    g.hour = 21.4;
    g.money = 23400;
    g.player.weapons = new Set(['pistol', 'smg', 'shotgun']); g.player.ammo = { pistol: 60, smg: 90, shotgun: 24 }; g.player.weapon = 'shotgun';
    g.missions.done = new Set(['homecoming', 'special_order', 'debt_collector', 'pier9']);
    startMissionAt(g, 'clean_hands', 8);
    const [x, z] = lanePoint(10, 7, 3, 60);
    g.vehicles = g.vehicles.filter((v) => Math.hypot(v.x - x, v.z - z) > 45);
    putPlayerInCar(g, 'vanta', x, z, headingOfDir(3), '#ffcc22', 18);
    g.police.setMinStars(2);
    for (const [dz, dx] of [[14, -2.5], [30, 2.5]]) { const v = g.police.spawnUnit(); v.x = x + dx; v.z = z + dz; v.heading = headingOfDir(3); v.vz = -18; v.ai.i = 10; v.ai.j = 7; v.ai.d = 3; }
    for (let k = 0; k < 14; k++) g.traffic.spawnCar(25, 150);
    for (let k = 0; k < 30; k++) g.peds.spawnPed(6, 70);
    g.autopilot = () => { const v = g.player.vehicle; if (v) { v.input.throttle = v.speed < 18 ? 0.8 : 0; v.input.steer = (x - v.x) * -0.05; } };
    simulate(g, 1.2);
    g.camera.yaw = 0.45; g.camera.pitch = 0.14; g.camera.lookTimer = 99;
    g.camera.update(1, g);
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
  return true;
}

export { blockCenter, blockMin };
