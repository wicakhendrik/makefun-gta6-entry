// The game: owns the world and every system, runs the fixed-step simulation and draws each frame.

import { Renderer } from '../engine/renderer.js';
import { environmentAt } from '../engine/environment.js';
import { mat4, modelEuler, dist2, hexColor } from '../engine/math.js';
import { generateCity, POI, CITY_MAX, blockCenter } from '../world/city.js';
import { buildCityMeshes } from '../world/citymesh.js';
import { CollisionWorld } from '../world/collision.js';
import { Vehicle, VEHICLE_TYPES, collideVehicles } from '../entities/vehicles.js';
import { buildVehicleMesh, buildHelicopterMesh, buildRotorMesh } from '../entities/vehiclemodels.js';
import { Human } from '../entities/humans.js';
import { buildHumanMesh, humanLooks } from '../entities/humanmodels.js';
import { EventBus } from './events.js';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { PlayerController } from './player.js';
import { writeSave, readSave, applySave, loadSettings, saveSettings } from './save.js';
import { Effects } from '../fx/effects.js';
import { CombatSystem } from '../combat/combat.js';
import { TrafficSystem } from '../systems/traffic.js';
import { PedestrianSystem } from '../systems/pedestrians.js';
import { PoliceSystem } from '../systems/police.js';
import { GangSystem } from '../systems/gangs.js';
import { resolveVehicleHumanContacts } from '../systems/contacts.js';
import { MissionSystem } from '../story/missions.js';
import { ActivitySystem } from '../story/activities.js';
import { TaxiJobs } from '../story/taxi.js';
import { CrewSystem } from '../systems/crew.js';
import { AudioEngine } from '../audio/sfx.js';
import { Radio } from '../audio/music.js';
import { Hud } from '../ui/hud.js';
import { MenuSystem } from '../ui/menus.js';

const STEP = 1 / 60;
const HOURS_PER_SECOND = 1 / 40;

export class Game {
  constructor(worldCanvas, hudCanvas) {
    this.renderer = new Renderer(worldCanvas);
    this.events = new EventBus();
    this.input = new Input(worldCanvas);
    this.camera = new CameraRig();
    this.settings = loadSettings();
    this.city = generateCity();
    this.collision = new CollisionWorld(this.city.colliders);
    this.looks = humanLooks();
    this.buildMeshes();
    this.audio = new AudioEngine();
    this.radio = new Radio(this.audio);
    this.fx = new Effects();
    this.combat = new CombatSystem(this);
    this.time = 0;
    this.hour = 17.4;
    this.money = 0;
    this.state = 'title';
    this.vehicles = [];
    this.humans = [];
    this.stats = { kills: 0, stolen: 0, wrecked: 0, driven: 0, walked: 0, missions: 0 };
    this.player = this.makePlayer();
    this.traffic = new TrafficSystem(this);
    this.peds = new PedestrianSystem(this);
    this.police = new PoliceSystem(this);
    this.gangs = new GangSystem(this);
    this.missions = new MissionSystem(this);
    this.activities = new ActivitySystem(this);
    this.taxi = new TaxiJobs(this);
    this.crew = new CrewSystem(this);
    this.hud = new Hud(this, hudCanvas);
    this.menus = new MenuSystem(this);
    this.playerCtl = new PlayerController(this);
    this.player.controller = this.playerCtl;
    this.radio.onChange = (st) => this.hud.showStation(st);
    this.radio.onSong = () => this.hud.showSong();
    this.accum = 0;
    this.deathTimer = 0;
    this.ferrisAngle = 0;
    this.identity = mat4();
    this.tmp = mat4();
    this.applySettings();
    this.wireStats();
    this.traffic.spawnParked();
    // Esc releases the mouse in the browser before the page sees the key: treat that as "pause"
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'playing' && this.input.wantLock && !this.shotMode) this.pause();
    });
  }

  buildMeshes() {
    const r = this.renderer;
    const cm = buildCityMeshes(this.city);
    this.meshes = {
      cityGlobal: r.upload(cm.global), ferris: r.upload(cm.ferris), ferrisCenter: cm.ferrisCenter,
      chunks: cm.chunks.map((c) => ({ mesh: r.upload(c.built), x: c.x, z: c.z, radius: c.radius })),
      heli: r.upload(buildHelicopterMesh()), rotor: r.upload(buildRotorMesh()),
      vehicles: {}, civilians: [],
    };
    for (const [k, spec] of Object.entries(VEHICLE_TYPES)) this.meshes.vehicles[k] = r.upload(buildVehicleMesh(spec));
    for (const look of this.looks.civilians) this.meshes.civilians.push(r.upload(buildHumanMesh(look)));
    for (const role of ['player', 'cop', 'goon', 'boss']) this.meshes[role] = r.upload(buildHumanMesh(this.looks[role]));
  }

  makePlayer() {
    const p = new Human('player', POI.safehouse.x, POI.safehouse.z + 3, 0, hexColor('#1fb5a8'));
    p.weapons = new Set();
    p.ammo = {};
    p.mag = {};
    p.reloading = 0;
    p.heading = Math.PI;
    this.humans.push(p);
    return p;
  }

  wireStats() {
    this.events.on('humanKilled', (h, a) => { if (a && a.isPlayer) this.stats.kills++; });
    this.events.on('carjack', () => this.stats.stolen++);
    this.events.on('enterVehicle', (v) => { if (!v.countedStolen) { v.countedStolen = true; this.stats.stolen++; } });
    this.events.on('vehicleDestroyed', (v) => { if (v.killedBy && v.killedBy.isPlayer) this.stats.wrecked++; this.events.emit('explosion', v.x, v.z); });
  }

  applySettings() {
    const s = this.settings;
    this.audio.volume = { master: s.master, music: s.music, sfx: s.sfx };
    this.audio.applyVolume();
  }
  storeSettings() { saveSettings(this.settings); }

  /* ---------- spawning helpers used by missions and activities ---------- */

  spawnVehicle(type, x, z, heading, color) {
    const v = new Vehicle(type, x, z, heading, color);
    this.vehicles.push(v);
    return v;
  }

  spawnHuman(role, x, z, opts = {}) {
    const shirt = role === 'goon' ? hexColor('#1c1c22') : role === 'boss' ? hexColor('#e8e4da') : role === 'cop' ? [0.12, 0.17, 0.32] : hexColor(opts.shirt || '#ff6a5a');
    const h = new Human(role, x, z, 0, shirt);
    if (opts.weapon) h.weapon = opts.weapon;
    h.ai = { mode: 'fight' };
    if (!opts.detached) this.humans.push(h);
    return h;
  }

  /* ---------- game flow ---------- */

  hasSave() { return !!readSave(); }
  saveSummary() {
    const d = readSave();
    if (!d) return '';
    return `${d.missions.length}/6 missions · $${(d.money || 0).toLocaleString()}`;
  }

  resetWorld() {
    this.vehicles = [];
    this.humans = [this.player];
    this.fx = new Effects();
    this.police.clear();
    this.police.heli = null;
    this.missions.active = null;
    this.activities.race = null;
    this.taxi.active = false; this.taxi.fare = null;
    this.combat.rockets = [];
    this.crew.reset();
    this.traffic.spawnParked();
    const p = this.player;
    Object.assign(p, { hp: 100, armor: 0, state: 'walk', vehicle: null, vx: 0, vz: 0, y: 0, weapon: 'fist' });
  }

  newGame() {
    this.resetWorld();
    this.money = 150;
    this.hour = 17.3;
    this.missions.done = new Set();
    this.activities.exported = new Set();
    this.activities.tokens = new Set();
    this.activities.bestTimes = {};
    Object.assign(this.stats, { kills: 0, stolen: 0, wrecked: 0, driven: 0, walked: 0, missions: 0 });
    const p = this.player;
    p.weapons = new Set(); p.ammo = {}; p.mag = {}; p.reloading = 0;
    p.x = POI.safehouse.x; p.z = POI.safehouse.z + 3; p.heading = Math.PI;
    this.startPlaying();
    this.hud.bigMessage('PORT SOLARA', 'Five years gone. The city kept the lights on.', '#ff6ac1');
    this.hud.queueDialogue([
      { who: 'MARCO', text: 'Home sweet home. Tía Lou said to come straight to the garage.' },
      { who: 'TIP', text: 'Follow the pink L on the minimap to Cinder Row. Steal a car with F — the cops do not love that.' },
    ]);
    this.saveGame(true);
  }

  continueGame() {
    const data = readSave();
    if (!data) return this.newGame();
    this.resetWorld();
    applySave(this, data);
    this.startPlaying();
    this.hud.toast('Welcome back to Port Solara');
  }

  startPlaying() {
    this.menus.close();
    this.state = 'playing';
    this.input.wantLock = true;
    this.input.requestLock();
    this.radio.stop();
    this.camera.yaw = this.player.heading;
    for (let k = 0; k < 18; k++) this.traffic.spawnCar(30, 200);
    for (let k = 0; k < 25; k++) this.peds.spawnPed(15, 120);
  }

  toTitle() {
    this.state = 'title';
    this.input.wantLock = false;
    this.input.releaseLock();
    this.menus.open('title');
    this.radio.playTitle();
  }

  pause(screen = 'pause') {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.menus.open(screen);
    this.audio.ui('back');
  }

  resume() {
    this.state = 'playing';
    this.input.requestLock();
  }

  /** Save to localStorage. Autosaves happen silently; manual saves are refused during missions. */
  saveGame(auto) {
    if (this.missions.active && !auto) return false;
    if (this.shotMode) return true;
    const ok = writeSave(this);
    if (ok && !auto) this.audio.ui('select');
    return ok;
  }

  onWasted() {
    if (this.state !== 'playing' || !this.player.alive && this.deathTimer > 0) return;
    this.state = 'dead';
    this.deathTimer = 4.5;
    this.deathKind = 'wasted';
    this.hud.bigMessage('FLATLINED', 'St. Amara Medical will patch you up — for a fee.', '#ff4a5a');
    this.audio.wasted();
    this.events.emit('wasted');
  }

  onBusted() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.deathTimer = 4;
    this.deathKind = 'busted';
    this.hud.bigMessage('CUFFED', 'A night in the precinct cells, and a lawyer bill.', '#5a8cff');
    this.audio.wantedUp();
    this.player.wantX = 0; this.player.wantZ = 0;
    this.events.emit('busted');
  }

  respawn() {
    const p = this.player, busted = this.deathKind === 'busted';
    if (p.vehicle) { p.vehicle.driver = null; p.vehicle = null; }
    const at = busted ? POI.precinct : POI.hospital;
    p.x = at.x; p.z = at.z + 2; p.y = 0; p.vx = p.vz = p.vy = 0;
    p.state = 'walk'; p.hp = p.maxHp; p.armor = 0;
    const fee = Math.min(this.money, busted ? 300 : 200);
    this.money -= fee;
    if (busted) { p.ammo = Object.fromEntries(Object.keys(p.ammo).map((k) => [k, Math.floor(p.ammo[k] / 2)])); }
    this.police.clear();
    this.police.heli = null;
    this.hour = (this.hour + 6) % 24;
    this.state = 'playing';
    this.hud.toast(busted ? `Released. Lawyer: -$${fee}` : `Hospital bill: -$${fee}`);
    this.camera.yaw = 0;
  }

  /* ---------- main loop ---------- */

  frame(dt) {
    dt = Math.min(dt, 0.1);
    this.renderer.resize();
    this.hud.resize();
    if (this.input.hits.size || this.input.clicks[0]) this.audio.unlock();
    if (this.state === 'title' && this.audio.ctx && !this.radio.on) this.radio.playTitle();
    this.handleGlobalKeys();
    this.crew.handleKeys();
    this.menus.update();
    if ((this.state === 'playing' || this.state === 'dead') && !this.frozen) {
      this.accum += dt;
      let steps = 0;
      while (this.accum >= STEP && steps < 6) { this.step(STEP); this.accum -= STEP; steps++; }
      if (steps === 6) this.accum = 0;
    } else if (this.state === 'title') {
      this.time += dt;
      this.hour = 18.2;
    }
    this.radio.update();
    this.audio.update(this, dt);
    this.hud.update(this.state === 'paused' ? 0 : dt);
    this.render();
    this.input.endFrame();
  }

  handleGlobalKeys() {
    const inp = this.input;
    if (this.state === 'playing') {
      if (inp.pressed('Escape') || inp.pressed('KeyP')) this.pause('pause');
      else if (inp.pressed('KeyM') || inp.pressed('Tab')) this.pause('map');
      else if ((inp.pressed('Enter') || inp.pressed('Space')) && this.hud.dialogueBusy && !this.player.vehicle) this.hud.skipDialogue();
      else if (inp.pressed('Enter') && this.hud.dialogueBusy) this.hud.skipDialogue();
    }
  }

  step(dt) {
    this.time += dt;
    this.hour = (this.hour + dt * HOURS_PER_SECOND) % 24;
    this.isNight = this.hour > 19.8 || this.hour < 5.8;
    const p = this.player;
    if (this.state === 'dead') {
      this.deathTimer -= dt;
      p.wantX = 0; p.wantZ = 0;
      if (this.deathTimer <= 0) this.respawn();
    } else {
      this.playerCtl.update(dt);
      if (this.autopilot) this.autopilot(dt);
      this.hint = this.playerCtl.nearbyHint();
    }
    const px = p.x, pz = p.z;
    for (const v of this.vehicles) {
      if (Math.abs(v.x - p.x) > 320 || Math.abs(v.z - p.z) > 320) continue;
      v.update(dt, this);
    }
    collideVehicles(this.vehicles.filter((v) => Math.abs(v.x - p.x) < 260 && Math.abs(v.z - p.z) < 260), this);
    for (const h of this.humans) h.update(dt, this);
    resolveVehicleHumanContacts(this);
    this.traffic.update(dt);
    this.peds.update(dt);
    this.police.update(dt);
    this.combat.update(dt);
    this.crew.update(dt);
    this.gangs.update(dt);
    this.missions.update(dt);
    this.activities.update(dt);
    this.taxi.update(dt);
    // drop anyone whose physics went non-finite rather than letting NaN spread
    this.humans = this.humans.filter((h) => (!h.gone && Number.isFinite(h.x) && Number.isFinite(h.z)) || h === p);
    this.vehicles = this.vehicles.filter((v) => Number.isFinite(v.x) && Number.isFinite(v.z));
    this.fx.update(dt);
    if (p.vehicle) this.stats.driven += Math.hypot(p.x - px, p.z - pz); else this.stats.walked += Math.hypot(p.x - px, p.z - pz);
    if (p.state === 'dead' && this.state === 'playing') this.onWasted();
    if (p.vehicle && p.vehicle.state !== 'ok' && p.vehicle.state === 'burning' && p.vehicle.burnTime < 1.2) this.playerCtl.exitVehicle();
    this.camera.update(dt, this);
    this.ferrisAngle += dt * 0.12;
  }

  render() {
    const r = this.renderer;
    const env = environmentAt(this.hour);
    const cam = this.camera;
    if (this.state === 'title') cam.orbit(this.time, CITY_MAX * 0.62, CITY_MAX * 0.42);
    r.setCamera(cam.eye, cam.target, cam.fov);
    const focus = this.state === 'title' ? [cam.target[0], cam.target[2]] : [this.player.x, this.player.z];
    r.setShadowFocus(focus[0], focus[1], env.sunDir);
    r.flash = 0;
    const eye = cam.eye;
    // camera basis for billboards
    const fx = cam.target[0] - eye[0], fy = cam.target[1] - eye[1], fz = cam.target[2] - eye[2];
    const fl = Math.hypot(fx, fy, fz);
    const f = [fx / fl, fy / fl, fz / fl];
    const rl = Math.hypot(f[0], f[2]) || 1;
    const right = [-f[2] / rl, 0, f[0] / rl];
    const upN = [-right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1]];

    this.drawCity(r, focus, eye, f);
    const fc = this.meshes.ferrisCenter;
    r.draw(this.meshes.ferris, modelEuler(this.tmp, fc[0], fc[1], fc[2], Math.PI / 2, 0, this.ferrisAngle));
    this.drawVehicles(r, env, right, upN, eye);
    this.drawHumans(r, eye);
    this.police.render(r, this.meshes, env);
    this.fx.emitLights(r);
    this.police.renderSirens(r, right, upN);
    this.addStreetLights(r, env, right, upN);
    this.combat.render(r, right, upN);
    this.fx.render(r, right, upN);
    this.missions.render(r, right, upN);
    if (this.state !== 'title') { this.activities.render(r, right, upN); this.taxi.render(r, right, upN); }
    r.render(env, this.time);
    this.hud.draw();
  }

  /** Static city chunks: skip those behind the camera; only chunks near the focus cast shadows. */
  drawCity(r, focus, eye, f) {
    r.draw(this.meshes.cityGlobal, this.identity);
    const fl = Math.hypot(f[0], f[2]) || 1;
    const fx = f[0] / fl, fz = f[2] / fl;
    for (const c of this.meshes.chunks) {
      const dx = c.x - eye[0], dz = c.z - eye[2];
      const d = Math.hypot(dx, dz);
      if (d > 1000 + c.radius) continue;
      const ahead = dx * fx + dz * fz;
      if (ahead < -c.radius - 30 && f[1] > -0.8) continue;
      const shadow = Math.abs(c.x - focus[0]) < 210 && Math.abs(c.z - focus[1]) < 210;
      r.draw(c.mesh, this.identity, null, 0, shadow);
    }
  }

  drawVehicles(r, env, right, up, eye) {
    const p = this.player;
    const night = env.night > 0.35;
    let glows = 0;
    for (const v of this.vehicles) {
      const dx = v.x - eye[0], dz = v.z - eye[2];
      const d2 = dx * dx + dz * dz;
      if (d2 > 360 * 360) continue;
      v.modelMatrix();
      r.draw(this.meshes.vehicles[v.type], v.model, v.tint, 0, d2 < 160 * 160);
      if (night && v.state === 'ok' && (v.driver || v === p.vehicle) && d2 < 140 * 140 && glows < 40) {
        glows++;
        const s = Math.sin(v.heading), c = Math.cos(v.heading);
        const hl = v.spec.len / 2 + 0.1, hw = v.spec.wid / 2 - 0.35;
        for (const side of [-1, 1]) {
          r.billboard(v.x + s * hl + c * side * hw, 0.75, v.z + c * hl - s * side * hw, 0.45, 1.6, 1.5, 1.2, 0, right, up);
          r.billboard(v.x - s * hl + c * side * hw, 0.75, v.z - c * hl - s * side * hw, 0.3, 1.2, 0.1, 0.1, 0, right, up);
        }
        r.groundQuad(v.x + s * (hl + 6), v.z + c * (hl + 6), 0.07, 2.2, 6, v.heading, 0.18, 0.17, 0.13, 0);
      }
    }
    if (night && p.vehicle) {
      const v = p.vehicle;
      r.addLight(v.x + Math.sin(v.heading) * 9, 1.5, v.z + Math.cos(v.heading) * 9, 16, 1.4, 1.3, 1.1);
    }
  }

  drawHumans(r, eye) {
    for (const h of this.humans) {
      if (h.vehicle) continue;
      const dx = h.x - eye[0], dz = h.z - eye[2];
      const d2 = dx * dx + dz * dz;
      if (d2 > 180 * 180) continue;
      const mesh = h.role === 'civ' ? this.meshes.civilians[h.look % this.meshes.civilians.length] : this.meshes[h.role] || this.meshes.goon;
      r.draw(mesh, h.modelMatrix(), h.hitFlash > 0 ? [2, 0.6, 0.6] : h.tint, h.swing, d2 < 90 * 90);
    }
  }

  /** Street lamps glow at night; the closest ones light the ground. */
  addStreetLights(r, env, right, up) {
    if (env.night < 0.3) return;
    const p = this.state === 'title' ? { x: this.camera.target[0], z: this.camera.target[2] } : this.player;
    const near = [];
    for (const l of this.city.lamps) {
      const d2 = dist2(l.x, l.z, p.x, p.z);
      if (d2 > 170 * 170) continue;
      const hx = l.x + Math.sin(l.yaw) * 2.05, hz = l.z + Math.cos(l.yaw) * 2.05;
      r.billboard(hx, 6.75, hz, 0.9, 1.3 * env.night, 1.05 * env.night, 0.6 * env.night, 0, right, up);
      near.push([d2, hx, hz]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < Math.min(near.length, 6); k++) r.addLight(near[k][1], 5.5, near[k][2], 15, 1.2 * env.night, 0.9 * env.night, 0.5 * env.night);
    // neon halos along the Strand rooftops and blade signs
    for (const n of this.city.neon) {
      const b = n.b;
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      if (dist2(cx, cz, p.x, p.z) > 260 * 260) continue;
      const c1 = n.rgb || (n.rgb = [hexColor(n.color), hexColor(n.color2)]);
      const k = env.night * 0.55;
      for (let t = 0.1; t < 1; t += 0.2) {
        const gx = b.x0 + (b.x1 - b.x0) * t, gz = b.z0 + (b.z1 - b.z0) * t;
        for (const [qx, qz] of [[gx, b.z1 + 0.3], [gx, b.z0 - 0.3], [b.x0 - 0.3, gz], [b.x1 + 0.3, gz]]) r.billboard(qx, b.h - 0.6, qz, 2.0, c1[0][0] * k, c1[0][1] * k, c1[0][2] * k, 0, right, up);
      }
      const top = Math.min(b.h - 2, 13);
      for (let y = 5; y < top; y += 2.2) r.billboard(b.x0 + 2.5, y, b.z1 + 1, 1.6, c1[1][0] * k, c1[1][1] * k, c1[1][2] * k, 0, right, up);
    }
  }
}

export { blockCenter };
