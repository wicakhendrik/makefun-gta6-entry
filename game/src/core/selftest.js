// Automated play-through (?selftest=1): drives the real systems through stealing, a chase, combat, a mission,
// a race, shopping and save/load, and logs what happened so regressions show up in headless runs.

import { POI } from '../world/city.js';
import { RACES } from '../story/activities.js';
import { readSave } from './save.js';
import { STORY } from '../story/script.js';
import { magOf } from '../combat/combat.js';
import { followRoad } from '../systems/traffic.js';
import { lanePoint, headingOfDir, chooseNextDir } from '../world/roads.js';
import { makeRng } from '../engine/math.js';

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
  g.police.clear(); g.missions.active = null;
  const cab = g.spawnVehicle('cab', p.x + 3, p.z, 0);
  p.x = cab.x + 2.5; p.z = cab.z; press(g, 'KeyF'); run(g, 0.2);
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

  // 8. shop and save
  g.money += 5000;
  g.menus.open('shop'); g.menus.buy({ id: 'smg', price: 1500, ammo: 300 }); g.menus.close();
  g.missions.active = null;
  const saved = g.saveGame(false);
  log('shop bought smg', p.weapons.has('smg'), 'save written', saved, 'readable', !!readSave());

  // 8b. weapon slots, clips, reload and a rocket
  if (p.vehicle) g.playerCtl.exitVehicle();
  run(g, 0.2);
  p.weapons.add('bat'); p.weapons.add('launcher'); p.ammo.launcher = 4; p.weapons.delete('rifle');
  press(g, 'Digit7'); run(g, 0.05);
  const pick7 = p.weapon;
  press(g, 'Digit6'); run(g, 0.05);
  log('slot 7 selects', pick7, 'locked slot 6 keeps', p.weapon, 'padlock flash', !!g.hud.lockedSlot);
  p.weapon = 'smg'; p.ammo.smg = 100; p.mag = {}; p.reloading = 0;
  const clip0 = magOf(p, 'smg');
  for (let k = 0; k < 34; k++) { p.fireCooldown = 0; g.combat.fire(p, p.x, 1.4, p.z, 0, 1, 0, p.x, 1.4, p.z); }
  log('smg clip', clip0, 'after 34 trigger pulls: mag', p.mag.smg, 'ammo', p.ammo.smg, 'reloading', p.reloading > 0);
  run(g, 2);
  log('after reload: mag', p.mag.smg, 'reserve', p.ammo.smg - p.mag.smg);
  p.weapon = 'launcher'; p.mag.launcher = 1; p.reloading = 0; p.fireCooldown = 0;
  g.combat.fire(p, p.x, 1.2, p.z, 0, -0.05, 1, p.x, 1.2, p.z + 0.6);
  const inFlight = g.combat.rockets.length;
  let blasts = 0;
  const offBlast = () => blasts++;
  g.events.on('explosion', offBlast);
  run(g, 3);
  log('rocket fired', inFlight, 'exploded', blasts > 0, 'rockets left', g.combat.rockets.length, 'launcher reloading', p.reloading > 0 || p.mag.launcher === 1);

  // 8c. crew abilities and street rank
  g.police.setMinStars(2);
  const s0 = g.police.stars, cash0 = g.money;
  press(g, 'KeyX'); run(g, 0.05);
  log('Teo bribe: stars', s0, '->', g.police.stars, 'cost', cash0 - g.money, 'cooldown', Math.round(g.crew.cool.teo));
  const s1 = g.police.stars;
  press(g, 'KeyX'); run(g, 0.05);
  log('Teo again while busy: stars stay', s1 === g.police.stars);
  p.armor = 10; press(g, 'KeyC'); run(g, 0.05);
  log('Nyla supply drop armor', p.armor);
  const rk = g.crew.rank();
  log('rank', rk.level, rk.name, rk.rp, 'RP', 'next at', rk.to);

  // 8d. pursuit tactics, roadblocks and the helicopter spotlight on a car driving the grid
  g.police.clear(); g.police.heli = null; g.missions.active = null;
  const [rx, rz] = lanePoint(4, 4, 0, 20);
  const chaseCar = g.spawnVehicle('vanta', rx, rz, headingOfDir(0));
  g.playerCtl.enterVehicle(chaseCar);
  g.police.setMinStars(4);
  const drive = { i: 4, j: 4, d: 0, next: 0, stuck: 0, ignore: 0 }, rng = makeRng(77);
  g.autopilot = () => { if (p.vehicle) followRoad(p.vehicle, drive, 1 / 60, g, { cruise: 15, chooseNext: (i, j, d) => chooseNextDir(i, j, d, rng), careful: false }); };
  const tactics = new Set();
  let blocks = 0, spot = 0, rows = 0, minD = 1e9;
  const chatter = new Set();
  run(g, 30, () => {
    for (const v of g.vehicles) if (v.ai && v.ai.kind === 'police' && v.ai.tactic) tactics.add(v.ai.tactic);
    blocks = Math.max(blocks, g.police.roadblocks.length);
    if (g.police.heli && g.police.heli.spotOn) spot++;
    rows = Math.max(rows, g.police.dispatchList().length);
    if (g.police.call) chatter.add(g.police.call.text);
    for (const v of g.vehicles) if (v.ai && v.ai.kind === 'police' && v.driver) { const d = Math.hypot(v.x - p.x, v.z - p.z); if (d < minD) minD = d; }
  });
  log('closest pursuit car', minD.toFixed(1), 'm; units', g.vehicles.filter((v) => v.ai && v.ai.kind === 'police').map((v) => `${v.ai.tactic}@${Math.round(Math.hypot(v.x - p.x, v.z - p.z))}m/${v.speed.toFixed(0)}`).join(' '));
  log('pursuit 30s: tactics', [...tactics].join(','), 'roadblocks', blocks, 'spotlight frames on player', spot, 'dispatch rows', rows, 'stars', g.police.stars);
  log('radio chatter', [...chatter].slice(0, 3).join(' | '));
  // vanish: jump far from every unit; the search tactic and the spotlight sweep take over
  g.autopilot = null;
  const mover = p.vehicle || p;
  mover.x = 60; mover.z = 900; mover.vx = mover.vz = 0;
  if (!p.vehicle) { p.x = 60; p.z = 900; }
  run(g, 4);
  const searching = g.vehicles.filter((v) => v.ai && v.ai.kind === 'police' && v.ai.tactic === 'SEARCH').length;
  log('after vanishing: unseen', g.police.unseen.toFixed(1), 'units searching', searching, 'spot on player', !!(g.police.heli && g.police.heli.spotOn));
  const np = g.radio.nowPlaying(); g.radio.nextSong(); const np2 = g.radio.nowPlaying();
  log('radio', np.station, np.title, '->', np2.title);
  if (p.vehicle) g.playerCtl.exitVehicle();
  p.hp = p.maxHp;
  g.police.clear(); g.police.heli = null;

  // 9. run free roam for a while and make sure nothing explodes
  let maxVeh = 0, maxHum = 0;
  run(g, 30, () => { maxVeh = Math.max(maxVeh, g.vehicles.length); maxHum = Math.max(maxHum, g.humans.length); });
  log('free roam: max vehicles', maxVeh, 'max humans', maxHum, 'fx', g.fx.p.length, 'state', g.state);
  log('done in', Math.round(performance.now() - t0), 'ms');
  g.state = 'playing';
  g.frozen = true;
}

