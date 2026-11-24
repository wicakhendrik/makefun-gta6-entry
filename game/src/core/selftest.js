// Automated play-through (?selftest=1): drives the real systems through stealing, a chase, combat, a mission,
// a race, shopping and save/load, and logs what happened so regressions show up in headless runs.

import { POI } from '../world/city.js';
import { RACES } from '../story/activities.js';
import { readSave } from './save.js';
import { STORY } from '../story/script.js';

const log = (...a) => console.log('[test]', ...a);

function run(g, seconds, each) {
  const n = Math.round(seconds * 60);
  for (let k = 0; k < n; k++) { if (each) each(k / 60); g.step(1 / 60); g.input.endFrame(); }
}

function press(g, code) { g.input.hits.add(code); }

export function runSelfTest(g) {
  const t0 = performance.now();
  g.shotMode = true;
  g.newGame();
  g.hud.dialogue = [];
  const p = g.player;
  log('start', p.x.toFixed(1), p.z.toFixed(1), 'vehicles', g.vehicles.length, 'humans', g.humans.length);

  // 1. walk, then steal the nearest car
  run(g, 1, () => { p.wantX = 0; p.wantZ = 0; });
  const car = g.vehicles.filter((v) => v.state === 'ok').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  p.x = car.x + 2.5; p.z = car.z;
  press(g, 'KeyF');
  run(g, 0.1);
  log('in vehicle', !!p.vehicle, p.vehicle && p.vehicle.spec.name, 'stars', g.police.stars);

  // 2. drive straight for a while
  g.autopilot = () => { if (p.vehicle) { p.vehicle.input.throttle = 1; p.vehicle.input.steer = 0.15; } };
  run(g, 6);
  log('drove to', p.x.toFixed(1), p.z.toFixed(1), 'speed', p.vehicle ? p.vehicle.speed.toFixed(1) : '-', 'car hp', p.vehicle ? Math.round(p.vehicle.health) : '-');
  g.autopilot = null;

  // 3. get out and start a gunfight near pedestrians
  press(g, 'KeyF');
  run(g, 0.5);
  p.weapons.add('pistol'); p.ammo.pistol = 200; p.weapon = 'pistol';
  for (let k = 0; k < 20; k++) g.peds.spawnPed(5, 30);
  const ped = g.humans.find((h) => h.role === 'civ' && h.state !== 'dead');
  if (ped) {
    const dx = ped.x - p.x, dz = ped.z - p.z, l = Math.hypot(dx, dz);
    p.fireCooldown = 0;
    g.combat.fire(p, p.x, 1.4, p.z, dx / l, 0, dz / l, p.x, 1.4, p.z);
  }
  run(g, 0.2);
  log('after shooting: ped state', ped && ped.state, 'stars', g.police.stars, 'heat', g.police.heat.toFixed(2));
  g.police.setMinStars(4);
  let minHp = p.hp;
  run(g, 20, () => { minHp = Math.min(minHp, p.hp); if (p.hp < 30) p.hp = 100; });
  const units = g.vehicles.filter((v) => v.ai && v.ai.kind === 'police').length;
  const cops = g.humans.filter((h) => h.role === 'cop' && h.state !== 'dead').length;
  log('4 stars after 20s: police cars', units, 'officers on foot', cops, 'heli', !!g.police.heli, 'player min hp', Math.round(minHp), 'state', g.state, 'stars', g.police.stars);
  if (g.state === 'dead') run(g, 5);

  // regression: a pedestrian knocked down by a car must get up and flee with a finite position
  const victim = g.peds.spawnPed(5, 60) || g.humans.find((h) => h.role === 'civ' && h.state !== 'dead');
  if (victim) {
    victim.knock(6, 2, 3, g);
    run(g, 3);
    log('knocked pedestrian recovers', victim.state, Number.isFinite(victim.x) && Number.isFinite(victim.z) ? 'finite' : 'NaN');
  }

  // 4. evade: teleport far away and wait
  g.police.clear();
  log('cleared', g.police.stars);

  // 5. mission: homecoming
  p.x = POI.garage.x; p.z = POI.garage.z; p.vehicle = null; p.state = 'walk'; p.hp = 100;
  run(g, 0.5);
  log('mission started', g.missions.active && g.missions.active.def.id);
  run(g, 0.2, () => g.hud.skipDialogue());
  run(g, 0.3);
  const near = g.spawnVehicle('cub', p.x + 3, p.z + 6, 0);
  p.x = near.x + 2.5; p.z = near.z;
  press(g, 'KeyF');
  run(g, 0.3);
  log('objective', g.hud.objective, 'in car', !!p.vehicle);
  if (p.vehicle) { p.vehicle.x = POI.garage.x; p.vehicle.z = POI.garage.z + 2; p.vehicle.vx = 0; p.vehicle.vz = 0; }
  run(g, 1);
  log('missions done', [...g.missions.done].join(','), 'money', g.money, 'weapons', [...p.weapons].join(','));

  // 6. every story mission can build its steps
  for (const id of ['special_order', 'debt_collector', 'pier9', 'clean_hands', 'crane_falls']) {
    g.missions.active = null; g.missions.cooldown = 0;
    g.missions.start(STORY.find((m) => m.id === id));
    run(g, 0.5, () => g.hud.skipDialogue());
    run(g, 3);
    const a = g.missions.active;
    log('mission', id, 'step', a ? a.index : 'ended', 'objective', g.hud.objective);
    if (a) g.missions.fail('test');
    run(g, 0.2);
  }

  // 7. race
  g.police.clear();
  if (p.vehicle) g.playerCtl.exitVehicle();
  const rc = g.spawnVehicle('vanta', RACES[0].start.x, RACES[0].start.z, 0);
  p.x = rc.x + 2.5; p.z = rc.z; press(g, 'KeyF'); run(g, 0.2);
  g.missions.active = null;
  press(g, 'KeyE'); run(g, 0.1);
  log('race started', !!g.activities.race);
  g.autopilot = () => {
    const v = p.vehicle, r = g.activities.race;
    if (!v || !r) return;
    const t = g.activities.raceTarget();
    if (!t) return;
    const ang = Math.atan2(t.x - v.x, t.z - v.z) - v.heading;
    const a = Math.atan2(Math.sin(ang), Math.cos(ang));
    v.input.steer = Math.max(-1, Math.min(1, a * 2.5)); v.input.throttle = Math.abs(a) > 0.6 ? 0.3 : 1;
  };
  run(g, 40);
  log('race after 40s', g.activities.race ? `cp ${g.activities.race.cp} pos ${g.activities.racePosition()}` : 'finished', 'best', JSON.stringify(g.activities.bestTimes));
  g.autopilot = null;

  // 7b. taxi fares
  if (p.vehicle) g.playerCtl.exitVehicle();
  g.police.clear(); g.missions.active = null; g.activities.race = null;
  const cab = g.spawnVehicle('cab', p.x + 3, p.z, 0);
  p.x = cab.x + 2.5; p.z = cab.z; g.playerCtl.enterVehicle(cab); run(g, 0.2);
  press(g, 'KeyE'); run(g, 0.1);
  log('taxi on duty', g.taxi.active, 'phase', g.taxi.fare && g.taxi.fare.phase);
  if (g.taxi.fare) {
    const f = g.taxi.fare;
    cab.x = f.passenger.x + 3; cab.z = f.passenger.z; cab.vx = cab.vz = 0;
    run(g, 0.2);
    log('taxi after reaching passenger', f.phase, 'to', f.destName, 'timer', f.timer);
    cab.x = f.x + 2; cab.z = f.z; cab.vx = cab.vz = 0;
    const before = g.money;
    run(g, 0.2);
    log('taxi paid', g.money - before, 'streak', g.taxi.streak, 'next phase', g.taxi.fare && g.taxi.fare.phase);
  }
  g.taxi.stop(null);

  // 7c. weapon slots, reload and the rocket launcher
  if (p.vehicle) g.playerCtl.exitVehicle();
  g.police.clear();
  p.weapons.add('launcher'); p.ammo.launcher = 3; p.clip = {};
  p.x = 956.8; p.z = 250; p.heading = 0; p.hp = 100;
  press(g, 'Digit7'); run(g, 0.1);
  const rocketTarget = g.spawnVehicle('bayside', p.x, p.z + 24, 0);
  const vdx = rocketTarget.x - p.x, vdz = rocketTarget.z - p.z, vl = Math.hypot(vdx, vdz);
  p.fireCooldown = 0;
  const fired = g.combat.fire(p, p.x, 1.0, p.z, vdx / vl, -0.02, vdz / vl, p.x, 1.0, p.z);
  run(g, 1.2);
  log('slot 7 weapon', p.weapon, 'rocket fired', fired, 'target state', rocketTarget.state, 'reloading', p.reloading > 0, 'rockets left', p.ammo.launcher);
  p.weapon = 'pistol'; p.clip.pistol = 0; press(g, 'KeyR'); run(g, 1.3);
  log('pistol clip after reload', p.clip.pistol, 'state', g.state, 'hp', Math.round(p.hp));

  // 7d. crew abilities, the dispatch board, roadblocks and the helicopter spotlight
  g.missions.done.add('debt_collector'); g.missions.done.add('pier9');
  const getaway = g.spawnVehicle('vanta', p.x + 3, p.z, 0);
  g.playerCtl.enterVehicle(getaway);
  getaway.health = 300;
  press(g, 'KeyZ'); run(g, 0.1);
  log('crew repair health', Math.round(getaway.health), 'cooldown', Math.round(g.crew.cool.nina));
  g.police.setMinStars(3);
  const ammoBefore = p.ammo.pistol;
  press(g, 'KeyC'); run(g, 0.1);
  log('supply drop pistol ammo', ammoBefore, '->', p.ammo.pistol, 'armor', p.armor);
  // flee north up Ocean Drive, holding the lane
  g.autopilot = () => { const v = p.vehicle; if (v) { v.input.throttle = 0.9; v.input.steer = Math.max(-1, Math.min(1, (v.x - 956.8) * 0.06 + Math.sin(v.heading) * 1.5)); v.input.handbrake = false; } p.hp = 100; };
  let blocks = 0, spot = false;
  const tactics = new Set();
  run(g, 25, () => {
    blocks = Math.max(blocks, g.police.roadblocks.active.length);
    if (g.police.heli && g.police.heli.spotOn) spot = true;
    for (const u of g.police.dispatchUnits()) tactics.add(u.tactic);
  });
  g.autopilot = null;
  log('dispatch tactics seen', [...tactics].join(','), 'roadblocks', blocks, 'spotlight on suspect', spot);
  press(g, 'KeyX'); run(g, 0.1);
  log('scanner jam', g.police.jam.toFixed(1), 'seen while jammed', g.police.isPlayerSeen());
  g.radio.index = 1;
  const songA = g.radio.nowPlaying.song.title; g.radio.nextSong();
  log('radio song', songA, '->', g.radio.nowPlaying.song.title, 'respect', g.respect.points, 'rank', g.respect.rankName);
  if (p.vehicle) g.playerCtl.exitVehicle();
  g.police.clear();

  // 8. shop and save
  g.money += 5000;
  g.menus.open('shop'); g.menus.buy({ id: 'smg', price: 1500, ammo: 300 }); g.menus.close();
  g.missions.active = null;
  const saved = g.saveGame(false);
  log('shop bought smg', p.weapons.has('smg'), 'save written', saved, 'readable', !!readSave());

  // 9. run free roam for a while and make sure nothing explodes
  let maxVeh = 0, maxHum = 0;
  run(g, 30, () => { maxVeh = Math.max(maxVeh, g.vehicles.length); maxHum = Math.max(maxHum, g.humans.length); });
  log('free roam: max vehicles', maxVeh, 'max humans', maxHum, 'fx', g.fx.p.length, 'state', g.state);
  log('done in', Math.round(performance.now() - t0), 'ms');
  g.state = 'playing';
  g.frozen = true;
}

