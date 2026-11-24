// Brisa Cab fares: in any cab, press E to go on duty, pick up waving passengers and race them across town.

import { dist, makeRng, clamp } from '../engine/math.js';
import { BLOCKS, blockMin, blockMax, districtAt, DISTRICTS, districtOfBlock } from '../world/city.js';
import { drawMarker } from './missions.js';

export class TaxiJobs {
  constructor(game) {
    this.game = game;
    this.rng = makeRng(2024);
    this.active = false;
    this.fare = null;
    this.streak = 0;
    this.earned = 0;
    this.best = 0;
  }

  /** A sidewalk corner some distance from (x, z), away from the docks' empty lots. */
  pickSpot(x, z, minD, maxD) {
    for (let k = 0; k < 40; k++) {
      const bx = this.rng.int(0, BLOCKS - 1), bz = this.rng.int(0, BLOCKS - 1);
      if (districtOfBlock(bx, bz) === 'docks') continue;
      const sx = this.rng() < 0.5 ? blockMin(bx) + 1.6 : blockMax(bx) - 1.6;
      const sz = this.rng() < 0.5 ? blockMin(bz) + 1.6 : blockMax(bz) - 1.6;
      const d = dist(sx, sz, x, z);
      if (d >= minD && d <= maxD) return { x: sx, z: sz };
    }
    return { x: x + 120, z };
  }

  start() {
    const g = this.game;
    this.active = true;
    this.streak = 0;
    this.earned = 0;
    g.hud.toast('On duty: Brisa Cab fares');
    g.audio.ui('select');
    this.nextFare();
  }

  stop(reason) {
    const g = this.game;
    if (this.fare && this.fare.passenger) this.releasePassenger();
    this.active = false;
    this.fare = null;
    g.hud.setObjective(null);
    if (reason) g.hud.toast(reason);
    if (this.earned > 0) g.hud.bigMessage('SHIFT OVER', `${this.streak} fares in a row · $${this.earned.toLocaleString()} earned`, '#f6c445');
    this.best = Math.max(this.best, this.streak);
  }

  nextFare() {
    const g = this.game, p = g.player;
    const spot = this.pickSpot(p.x, p.z, 70, 220);
    const h = g.spawnHuman('civ', spot.x, spot.z, { shirt: ['#ff6a5a', '#f6d24a', '#36b8c8', '#e85a9a'][this.rng.int(0, 3)] });
    h.persistent = true;
    h.look = this.rng.int(0, 9);
    h.ai = { mode: 'walk', bx: 0, bz: 0, k: 0, dir: 1, wait: 9999 };
    h.state = 'idle';
    this.fare = { phase: 'pickup', passenger: h, x: spot.x, z: spot.z, timer: 60 };
  }

  releasePassenger() {
    const g = this.game, h = this.fare.passenger, v = g.player.vehicle;
    if (h.vehicle && v) { const [dx, dz] = v.doorPoint(); h.x = dx; h.z = dz; }
    h.vehicle = null;
    h.state = 'walk';
    h.persistent = false;
    g.peds.reattach(h);
    if (!g.humans.includes(h)) g.humans.push(h);
  }

  update(dt) {
    const g = this.game, p = g.player, v = p.vehicle;
    if (!this.active) {
      if (v && v.type === 'cab' && !g.missions.active && !g.activities.race && g.police.stars === 0) {
        if (!g.activities.hint) {
          g.activities.hint = 'Press E to go on duty — Brisa Cab fares';
          if (g.input.pressed('KeyE')) this.start();
        }
      }
      return;
    }
    if (!v || v.type !== 'cab' || v.state !== 'ok') { this.stop('Off duty: you left the cab.'); return; }
    if (g.missions.active) { this.stop(null); return; }
    if (g.police.stars > 0 && this.fare && this.fare.phase === 'ride') { this.stop('Your passenger jumped out — too much heat.'); return; }
    if (g.input.pressed('KeyE')) { this.stop('Off duty.'); return; }
    const f = this.fare;
    if (!f) return;
    f.timer -= dt;
    const h = f.passenger;
    if (f.phase === 'pickup') {
      if (h.state === 'dead') { g.hud.toast('The fare is not going anywhere now.'); this.nextFare(); return; }
      h.faceToward(v.x, v.z);
      g.hud.setObjective(`Pick up the passenger  ·  ${Math.ceil(Math.max(0, f.timer))}s`);
      if (dist(v.x, v.z, h.x, h.z) < 9 && v.speed < 3) this.pickUp();
      else if (f.timer <= 0) { g.hud.toast('The passenger took another cab.'); this.releasePassenger(); this.streak = 0; this.nextFare(); }
    } else {
      const left = Math.max(0, f.timer);
      g.hud.setObjective(`Drive to ${f.destName}  ·  ${Math.ceil(left)}s`);
      if (dist(v.x, v.z, f.x, f.z) < 9 && v.speed < 4) this.dropOff();
      else if (f.timer <= 0) { g.hud.toast('Too slow! The passenger walked off without paying.'); this.releasePassenger(); this.streak = 0; this.nextFare(); }
    }
  }

  pickUp() {
    const g = this.game, f = this.fare, h = f.passenger, v = g.player.vehicle;
    h.vehicle = v;
    g.humans = g.humans.filter((o) => o !== h);
    const dest = this.pickSpot(v.x, v.z, 220, 620);
    const d = dist(v.x, v.z, dest.x, dest.z);
    f.phase = 'ride';
    f.x = dest.x; f.z = dest.z;
    f.destName = DISTRICTS[districtAt(dest.x, dest.z)].name;
    f.timer = Math.round(d / 13 + 18);
    f.distance = d;
    g.audio.ui('checkpoint');
    g.hud.queueDialogue([{ who: 'PASSENGER', text: ['To ' + f.destName + ', and step on it!', 'Take me to ' + f.destName + '. I tip for speed.', f.destName + ', please. I am late for everything.'][this.rng.int(0, 2)] }]);
  }

  dropOff() {
    const g = this.game, f = this.fare;
    this.streak++;
    const pay = Math.round(40 + f.distance * 0.35 + Math.max(0, f.timer) * 3) + this.streak * 25;
    g.money += pay;
    g.events.emit('taxiFare', pay);
    this.earned += pay;
    g.audio.ui('cash');
    g.hud.toast(`Fare paid: $${pay}  (streak ${this.streak})`);
    this.releasePassenger();
    if (this.streak % 5 === 0) { g.money += 500; g.hud.bigMessage('CAB BONUS', `${this.streak} fares in a row  +$500`, '#f6c445'); }
    this.nextFare();
  }

  /** Where the GPS should point while on duty. */
  target() {
    if (!this.active || !this.fare) return null;
    const f = this.fare;
    return f.phase === 'pickup' ? { x: f.passenger.x, z: f.passenger.z, entity: f.passenger } : { x: f.x, z: f.z };
  }

  render(r, right, up) {
    const t = this.target();
    if (!t) return;
    const pulse = 0.75 + Math.sin(this.game.time * 4) * 0.25;
    drawMarker(r, t.x, t.z, [1, 0.8, 0.2], pulse, right, up, t.entity ? 1.8 : 0);
  }
}

export { clamp };
