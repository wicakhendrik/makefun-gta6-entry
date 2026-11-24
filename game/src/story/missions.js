// Mission runner: contact markers, step sequencing, objectives, timers, fail states, rewards and markers in the world.

import { dist, dist2 } from '../engine/math.js';
import { POI } from '../world/city.js';
import { STORY, CONTACTS } from './script.js';

export class MissionSystem {
  constructor(game) {
    this.game = game;
    this.done = new Set();
    this.active = null;
    this.cooldown = 0;
    this.markerPulse = 0;
    game.events.on('wasted', () => this.fail('You were flatlined.'));
    game.events.on('busted', () => this.fail('You got cuffed.'));
  }

  /** Missions whose prerequisites are complete and that are not done yet, one per contact. */
  available() {
    const out = [];
    for (const m of STORY) {
      if (this.done.has(m.id)) continue;
      if ((m.requires || []).every((r) => this.done.has(r))) out.push(m);
    }
    const seen = new Set();
    return out.filter((m) => (seen.has(m.giver) ? false : (seen.add(m.giver), true)));
  }

  get storyProgress() { return this.done.size / STORY.length; }

  update(dt) {
    const g = this.game, p = g.player;
    this.markerPulse += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (!this.active) {
      if (this.cooldown > 0 || !p.alive || g.activities.busy || g.taxi.active) return;
      for (const m of this.available()) {
        const poi = POI[CONTACTS[m.giver].poi];
        if (dist2(p.x, p.z, poi.x, poi.z) < 3.2 * 3.2 + (p.vehicle ? 16 : 0) && (!p.vehicle || p.vehicle.speed < 6)) { this.start(m); break; }
      }
      return;
    }
    const a = this.active;
    a.time += dt;
    if (a.timer !== null && a.timer !== undefined) {
      a.timer -= dt;
      if (a.timer <= 0) { this.fail(a.timerFail || 'Out of time.'); return; }
    }
    const step = a.steps[a.index];
    if (!step) { this.pass(); return; }
    if (!a.stepStarted) {
      a.stepStarted = true;
      a.stepTime = 0;
      step.start && step.start(g, a);
      if (step.text) g.hud.setObjective(step.text);
    }
    a.stepTime += dt;
    const r = step.update ? step.update(g, a, dt) : 'done';
    if (r === 'done') { a.index++; a.stepStarted = false; if (a.index >= a.steps.length) this.pass(); }
    else if (typeof r === 'string' && r.startsWith('fail')) this.fail(r.slice(5) || 'Mission failed.');
  }

  start(def) {
    const g = this.game;
    this.active = { def, steps: def.build(g), index: 0, stepStarted: false, time: 0, timer: null, spawned: [], vars: {} };
    g.hud.missionTitle(def.title, CONTACTS[def.giver].name);
    g.audio.ui('select');
    g.events.emit('missionStart', def);
  }

  /** Track anything a mission spawns so it can be cleaned up afterwards. */
  own(entity) {
    if (this.active) this.active.spawned.push(entity);
    entity.persistent = true;
    entity.missionOwned = true;
    return entity;
  }

  pass() {
    const g = this.game, a = this.active;
    if (!a) return;
    const def = a.def;
    this.done.add(def.id);
    g.money += def.reward;
    g.stats.missions++;
    if (def.unlock) for (const w of def.unlock) { g.player.weapons.add(w); g.player.ammo[w] = (g.player.ammo[w] || 0) + 60; }
    g.hud.bigMessage('MISSION PASSED', '+$' + def.reward.toLocaleString() + (def.unlockText ? '  ·  ' + def.unlockText : ''), '#ffd24a');
    g.audio.missionPassed();
    g.hud.setObjective(null);
    this.cleanup(false);
    this.active = null;
    this.cooldown = 4;
    if (def.outro) g.hud.queueDialogue(def.outro);
    g.events.emit('missionPassed', def);
    g.saveGame(true);
    if (this.done.size === STORY.length) g.hud.queueDialogue([{ who: 'PORT SOLARA', text: 'The story is complete — the city is yours. Races, exports, Sun Tokens and Bolt & Barrel still wait.' }]);
  }

  fail(reason) {
    const g = this.game;
    if (!this.active) return;
    g.hud.bigMessage('MISSION FAILED', reason, '#ff5a5a');
    g.audio.missionFailed();
    g.hud.setObjective(null);
    this.cleanup(true);
    this.active = null;
    this.cooldown = 6;
  }

  cleanup(failed) {
    const g = this.game;
    for (const e of this.active.spawned) {
      e.persistent = false;
      e.missionOwned = false;
      if (e.ai && (e.ai.kind === 'flee' || e.ai.kind === 'attack')) e.ai = null;
      if (e.role === 'goon' || e.role === 'boss') e.ai = { mode: 'runaway' };
    }
    this.active.timer = null;
  }

  /** Mission tracker data: stage x/y over the steps that carry an objective, the current one and the next. */
  progress() {
    const a = this.active;
    if (!a) return null;
    const marked = [];
    a.steps.forEach((s, k) => { if (s.text) marked.push(k); });
    const total = Math.max(1, marked.length);
    const doneCount = marked.filter((k) => k < a.index).length;
    const stage = Math.min(total, doneCount + 1);
    const cur = a.steps[a.index];
    const nextIdx = marked.find((k) => k > a.index);
    const giver = CONTACTS[a.def.giver];
    return {
      stage, total,
      current: cur && cur.text ? cur.text : 'Listen to ' + giver.name.split(' ')[0] + '.',
      next: nextIdx !== undefined ? a.steps[nextIdx].text : `Collect $${a.def.reward.toLocaleString('en-US')} from ${giver.name.split(' ')[0]}.`,
    };
  }

  /** The current target position for the HUD arrow and minimap. */
  objectivePos() {
    const a = this.active;
    if (!a) return null;
    const step = a.steps[a.index];
    if (!step || !step.target) return null;
    return step.target(this.game, a);
  }

  render(r, right, up) {
    const g = this.game;
    const pulse = 0.75 + Math.sin(this.markerPulse * 4) * 0.25;
    if (!this.active) {
      for (const m of this.available()) {
        const poi = POI[CONTACTS[m.giver].poi];
        drawMarker(r, poi.x, poi.z, CONTACTS[m.giver].color, pulse, right, up);
      }
      return;
    }
    const t = this.objectivePos();
    if (t && t.marker !== false) drawMarker(r, t.x, t.z, [1, 0.85, 0.2], pulse, right, up, t.entity ? 2.6 : 0);
  }
}

/** A glowing beacon column with a ground ring. */
export function drawMarker(r, x, z, col, pulse, right, up, lift = 0) {
  const [cr, cg, cb] = col;
  if (!lift) {
    r.groundQuad(x, z, 0.08, 2.6 * pulse, 2.6 * pulse, 0, cr * 0.8, cg * 0.8, cb * 0.8, 0);
    for (let y = 0.5; y < 6; y += 0.9) r.billboard(x, y, z, 0.9 - y * 0.08, cr * 0.5 * pulse, cg * 0.5 * pulse, cb * 0.5 * pulse, 0, right, up);
  } else {
    r.billboard(x, lift + 1.2 + Math.sin(pulse * 6) * 0.2, z, 0.7, cr * 1.5, cg * 1.5, cb * 1.5, 0, right, up);
  }
}

/* ---------- step library ---------- */

export const Steps = {
  talk(lines) {
    return { start: (g) => g.hud.queueDialogue(lines), update: (g) => (g.hud.dialogueBusy ? null : 'done') };
  },
  goTo(pos, text, opts = {}) {
    return {
      text,
      target: () => ({ x: pos.x, z: pos.z }),
      update: (g) => {
        const p = g.player;
        if (opts.inVehicle && !p.vehicle) return null;
        if (opts.vehicle && p.vehicle !== opts.vehicle()) return null;
        if (opts.check) { const c = opts.check(g); if (c) return c; }
        return dist(p.x, p.z, pos.x, pos.z) < (opts.radius || 4) + (p.vehicle ? 3 : 0) && (!p.vehicle || p.vehicle.speed < 10) ? 'done' : null;
      },
    };
  },
  stealAny(text) {
    return { text, update: (g) => (g.player.vehicle ? 'done' : null) };
  },
  enterVehicle(getVehicle, text) {
    return {
      text,
      target: (g) => { const v = getVehicle(g); return v ? { x: v.x, z: v.z, entity: v } : null; },
      update: (g) => {
        const v = getVehicle(g);
        if (!v || v.state !== 'ok') return 'fail:The car was wrecked.';
        return g.player.vehicle === v ? 'done' : null;
      },
    };
  },
  deliver(getVehicle, pos, text, radius = 5) {
    return {
      text,
      target: () => ({ x: pos.x, z: pos.z }),
      update: (g) => {
        const v = getVehicle(g), p = g.player;
        if (!v || v.state !== 'ok') return 'fail:The car was wrecked.';
        if (p.vehicle !== v) { g.hud.setObjective('Get back in the ' + v.spec.name + '.'); return null; }
        g.hud.setObjective(text);
        return dist(v.x, v.z, pos.x, pos.z) < radius + 3 && v.speed < 6 ? 'done' : null;
      },
    };
  },
  loseWanted(text = 'Lose the cops.') {
    return { text, update: (g) => (g.police.stars === 0 ? 'done' : null) };
  },
  setWanted(n) {
    return { start: (g) => g.police.setMinStars(n), update: () => 'done' };
  },
  timer(seconds, failText) {
    return { start: (g, a) => { a.timer = seconds; a.timerFail = failText; }, update: () => 'done' };
  },
  clearTimer() {
    return { start: (g, a) => { a.timer = null; }, update: () => 'done' };
  },
  run(fn) {
    return { start: (g, a) => fn(g, a), update: () => 'done' };
  },
  wait(seconds) {
    return { update: (g, a) => (a.stepTime >= seconds ? 'done' : null) };
  },
  killAll(getList, text) {
    return {
      text,
      target: (g) => {
        const alive = getList(g).filter((h) => h.state !== 'dead');
        if (!alive.length) return null;
        const p = g.player;
        alive.sort((a, b) => dist2(a.x, a.z, p.x, p.z) - dist2(b.x, b.z, p.x, p.z));
        return { x: alive[0].x, z: alive[0].z, entity: alive[0] };
      },
      update: (g) => {
        const list = getList(g);
        const left = list.filter((h) => h.state !== 'dead').length;
        g.hud.setObjective(text + (list.length > 1 ? `  (${list.length - left}/${list.length})` : ''));
        return left === 0 ? 'done' : null;
      },
    };
  },
  destroyVehicle(getVehicle, text, opts = {}) {
    return {
      text,
      target: (g) => { const v = getVehicle(g); return v ? { x: v.x, z: v.z, entity: v } : null; },
      update: (g) => {
        const v = getVehicle(g);
        if (!v) return 'done';
        if (opts.escapeDist && dist(v.x, v.z, g.player.x, g.player.z) > opts.escapeDist) return 'fail:The target got away.';
        if (v.state !== 'ok' || (v.driver && v.driver.state === 'dead') || (opts.stopAt && v.health < opts.stopAt)) return 'done';
        return null;
      },
    };
  },
};
