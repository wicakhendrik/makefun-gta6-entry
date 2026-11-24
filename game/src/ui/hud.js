// Heads-up display on a 2D canvas: minimap, health/armor, cash, wanted stars, weapon, objectives, dialogue and alerts.

import { Minimap, roundRect } from './minimap.js';
import { FONT, DISPLAY, rgb, outlined, drawStar } from './draw2d.js';
import { drawMissionTracker, drawDispatchPanel, drawWeaponSlots, drawDialogueBox, drawRankBar, drawCrewPanel, drawVehiclePanel, drawSongCard, drawVitals } from './panels.js';
import { formatClock } from '../engine/environment.js';
import { DISTRICTS, districtAt, POI } from '../world/city.js';
import { CONTACTS } from '../story/script.js';
import { RACES, TOKEN_SPOTS } from '../story/activities.js';
import { nearestNode, routeDir, DIRS, dirOfHeading } from '../world/roads.js';
import { PITCH } from '../world/city.js';


export class Hud {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimap = new Minimap(game.city);
    this.dpr = 1;
    this.objective = null;
    this.dialogue = [];
    this.dialogueTime = 0;
    this.big = null;
    this.toasts = [];
    this.title = null;
    this.vehicleName = null;
    this.station = null;
    this.district = null;
    this.districtShow = 0;
    this.hitMarker = 0;
    this.hurt = 0;
    this.weaponFlash = 0;
    this.lastHp = 100;
    this.visible = true;
    this.displayMoney = 0;
    this.songCard = null;
    this.crewFlash = null;
    this.respectGain = null;
    game.events.on('playerHit', (h, head) => { this.hitMarker = head ? 0.35 : 0.2; this.hitKill = h && h.state === 'dead'; });
    game.events.on('wantedLost', () => this.toast('Wanted level lost'));
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * this.dpr), h = Math.floor(this.canvas.clientHeight * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.w = this.canvas.clientWidth; this.h = this.canvas.clientHeight;
  }

  /* ---------- messages from game systems ---------- */
  setObjective(text) { this.objective = text; if (text) this.objectiveFlash = 1; }
  missionTitle(title, giver) { this.title = { title, giver, t: 5 }; }
  bigMessage(text, sub, color) { this.big = { text, sub, color, t: 4.5 }; }
  toast(text) { this.toasts.push({ text, t: 4 }); if (this.toasts.length > 4) this.toasts.shift(); }
  showVehicleName(name) { this.vehicleName = { text: name, t: 3 }; }
  showStation(st) {
    const np = this.game.radio.nowPlaying;
    this.songCard = { station: st.name, line: np ? `${np.song.title} — ${np.song.artist}` : st.tag || 'Radio off', t: 4 };
  }
  showSong(np) { if (np && this.game.player.vehicle) this.songCard = { station: 'NOW PLAYING · ' + np.station.name, line: `${np.song.title} — ${np.song.artist}`, t: 4 }; }
  flashWeapon() { this.weaponFlash = 2; }
  queueDialogue(lines) { for (const l of lines) this.dialogue.push({ ...l }); if (this.dialogue.length === lines.length) this.dialogueTime = 0; }
  get dialogueBusy() { return this.dialogue.length > 0; }
  skipDialogue() { if (this.dialogue.length) { this.dialogue.shift(); this.dialogueTime = 0; } }

  update(dt) {
    const g = this.game, p = g.player;
    if (this.dialogue.length) {
      this.dialogueTime += dt;
      const line = this.dialogue[0];
      if (this.dialogueTime > 1.6 + line.text.length * 0.045) { this.dialogue.shift(); this.dialogueTime = 0; }
    }
    if (this.big) { this.big.t -= dt; if (this.big.t <= 0) this.big = null; }
    if (this.title) { this.title.t -= dt; if (this.title.t <= 0) this.title = null; }
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    for (const k of ['vehicleName', 'station', 'songCard', 'crewFlash', 'respectGain']) if (this[k]) { this[k].t -= dt; if (this[k].t <= 0) this[k] = null; }
    if (this.hitMarker > 0) this.hitMarker -= dt;
    if (this.weaponFlash > 0) this.weaponFlash -= dt;
    if (this.objectiveFlash > 0) this.objectiveFlash -= dt;
    if (p.hp < this.lastHp - 0.5) this.hurt = Math.min(1, this.hurt + (this.lastHp - p.hp) / 25);
    this.lastHp = p.hp;
    this.hurt = Math.max(0, this.hurt - dt * 1.2);
    const d = districtAt(p.x, p.z);
    if (d !== this.district) { this.district = d; this.districtShow = 4; }
    if (this.districtShow > 0) this.districtShow -= dt;
    this.displayMoney += (g.money - this.displayMoney) * Math.min(1, dt * 6);
    if (Math.abs(g.money - this.displayMoney) < 1) this.displayMoney = g.money;
  }

  /** Every blip the minimap should show right now. */
  collectBlips() {
    const g = this.game, blips = [];
    const flash = Math.floor(g.time * 4) % 2;
    if (!g.missions.active && !g.activities.race) {
      for (const m of g.missions.available()) {
        const c = CONTACTS[m.giver], poi = POI[c.poi];
        blips.push({ x: poi.x, z: poi.z, letter: c.letter, color: rgb(c.color), edge: true });
      }
      for (const r of RACES) blips.push({ x: r.start.x, z: r.start.z, shape: 'diamond', color: '#4ab8ff', size: 4 });
    }
    blips.push({ x: POI.safehouse.x, z: POI.safehouse.z, letter: 'H', color: '#9fe3c8', edge: true });
    blips.push({ x: POI.gunshop.x, z: POI.gunshop.z, letter: '$', color: '#ffae4a' });
    blips.push({ x: POI.garage.x, z: POI.garage.z, letter: 'G', color: '#ff6ac1' });
    blips.push({ x: POI.hospital.x, z: POI.hospital.z, shape: 'square', color: '#ff4a5a', size: 4 });
    for (const k of g.activities.pickups) if (!k.cooldown || k.cooldown <= 0) blips.push({ x: k.x, z: k.z, size: 2.5, color: { health: '#6bff7a', armor: '#5a9aff', ammo: '#ffa040', cash: '#6bff7a', bag: '#ffd24a' }[k.kind] });
    TOKEN_SPOTS.forEach((s, i) => { if (!g.activities.tokens.has(i) && Math.hypot(s.x - g.player.x, s.z - g.player.z) < 90) blips.push({ x: s.x, z: s.z, size: 3, color: '#ffd24a' }); });
    for (const v of g.vehicles) {
      if (v.spec.police && v.driver && v.state === 'ok') blips.push({ x: v.x, z: v.z, color: flash ? '#ff3a4a' : '#3a6aff', size: 4.5, edge: g.police.stars > 0 });
    }
    for (const h of g.humans) {
      if (h.role === 'cop' && h.state !== 'dead') blips.push({ x: h.x, z: h.z, color: flash ? '#ff3a4a' : '#3a6aff', size: 3 });
      if ((h.role === 'goon' || h.role === 'boss') && h.state !== 'dead' && h.missionOwned) blips.push({ x: h.x, z: h.z, color: '#ff4040', size: 3.5, edge: true });
    }
    if (g.police.heli) blips.push({ x: g.police.heli.x, z: g.police.heli.z, shape: 'square', color: flash ? '#ff3a4a' : '#3a6aff', size: 4, edge: true });
    const obj = g.missions.objectivePos() || g.activities.raceTarget() || g.taxi.target();
    if (obj) blips.push({ x: obj.x, z: obj.z, color: '#ffd24a', size: 6, edge: true, pulse: true, shape: obj.entity ? 'diamond' : undefined });
    return blips;
  }

  /** Road-grid route from the player to the current objective, refreshed twice a second. */
  gpsRoute() {
    const g = this.game, p = g.player;
    const obj = g.missions.objectivePos() || g.activities.raceTarget() || g.taxi.target();
    if (!obj) { this.route = null; return null; }
    if (this.route && g.time - this.routeTime < 0.5 && this.routeFor === obj) return this.route;
    this.routeTime = g.time; this.routeFor = obj;
    let [i, j] = nearestNode(p.x, p.z);
    const [ti, tj] = nearestNode(obj.x, obj.z);
    let d = dirOfHeading(p.vehicle ? p.vehicle.heading : p.heading);
    const pts = [[p.x, p.z], [i * PITCH, j * PITCH]];
    for (let k = 0; k < 40 && (i !== ti || j !== tj); k++) {
      d = routeDir(i, j, ti, tj, d);
      i += DIRS[d][0]; j += DIRS[d][1];
      pts.push([i * PITCH, j * PITCH]);
    }
    pts.push([obj.x, obj.z]);
    this.route = pts;
    return pts;
  }

  /** Where the police last saw the player, while they are searching. */
  searchArea() {
    const pol = this.game.police;
    if (pol.stars === 0 || pol.unseen < 0.5) return null;
    return { x: pol.lastSeen.x, z: pol.lastSeen.z, r: 40 + pol.unseen * 4 };
  }

  draw() {
    const g = this.game, ctx = this.ctx, p = g.player;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.visible || g.state === 'title') return;
    const W = this.w, H = this.h;

    // cinematic vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,0,20,0.38)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // damage vignette
    const low = p.hp < 30 ? (0.35 + Math.sin(g.time * 6) * 0.15) : 0;
    const v = Math.max(this.hurt, low);
    if (v > 0.01) {
      const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      grd.addColorStop(0, 'rgba(180,0,0,0)'); grd.addColorStop(1, `rgba(180,0,0,${v * 0.6})`);
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    }

    const ms = Math.round(Math.min(230, Math.max(170, H * 0.3)));
    const mx = 22, my = H - ms - 46;
    this.minimap.draw(ctx, g, mx, my, ms, this.collectBlips(), this.gpsRoute(), this.searchArea());
    drawVitals(ctx, p, mx, my + ms + 6, ms);
    // left column: mission tracker, then the police dispatch board
    let ly = drawMissionTracker(ctx, g, this, 20, 18, 356);
    ly = drawDispatchPanel(ctx, g, 20, ly + 10, 356);
    // top centre: weapon slots; right column: cash, stars, rank, crew
    const wy = drawWeaponSlots(ctx, g, W / 2, 14);
    this.drawTopRight(W);
    drawRankBar(ctx, g, W - 20, 122, 268);
    const cy = drawCrewPanel(ctx, g, this, W - 20, 176, 268);
    if (this.songCard) drawSongCard(ctx, this.songCard, W - 20, cy + 10);
    if (p.vehicle) drawVehiclePanel(ctx, g, W, H);
    if (!p.vehicle && p.alive && g.state === 'playing') this.drawCrosshair(W, H);
    this.drawObjective(W, H, wy);
    this.drawDialogue(W, H);
    this.drawPopups(W, H, cy);
    this.drawRace(W);
    this.drawBig(W, H);
    if (g.state === 'paused') { ctx.fillStyle = 'rgba(5,6,12,0.45)'; ctx.fillRect(0, 0, W, H); }
  }

  drawTopRight(W) {
    const g = this.game, ctx = this.ctx, p = g.player;
    const x = W - 26;
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    outlined(ctx, formatClock(g.hour), x, 40, `bold 22px ${FONT}`, '#ffffff');
    outlined(ctx, '$' + Math.round(this.displayMoney).toLocaleString('en-US'), x, 78, `34px ${DISPLAY}`, '#7dffb0');
    // wanted stars
    const stars = g.police.stars;
    const unseen = g.police.unseen > 0.5 && stars > 0;
    const blink = unseen && Math.floor(g.time * 3) % 2 === 0;
    for (let k = 0; k < 5; k++) {
      const sx = x - 14 - (4 - k) * 33, sy = 104;
      const on = k < stars;
      drawStar(ctx, sx, sy, 14, on ? (blink ? 'rgba(255,255,255,0.35)' : '#ffd24a') : 'rgba(0,0,0,0.25)', on ? '#3a2a00' : 'rgba(255,255,255,0.35)');
    }
    if (this.respectGain) {
      ctx.globalAlpha = Math.min(1, this.respectGain.t);
      outlined(ctx, `+${this.respectGain.n} RP`, x - 180, 104, `bold 15px ${FONT}`, '#7dffb0', 3);
      ctx.globalAlpha = 1;
    }
  }

  drawCrosshair(W, H) {
    const ctx = this.ctx, g = this.game;
    const aim = g.camera.aiming;
    const cx = W / 2, cy = H / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
    const gap = aim ? 5 : 8, len = aim ? 7 : 6;
    if (this.game.player.weapon !== 'fist') {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.beginPath(); ctx.moveTo(cx + dx * gap, cy + dy * gap); ctx.lineTo(cx + dx * (gap + len), cy + dy * (gap + len)); ctx.stroke();
      }
    }
    ctx.fillStyle = '#fff'; ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    if (this.hitMarker > 0) {
      ctx.strokeStyle = this.hitKill ? '#ff4a4a' : '#ffffff'; ctx.lineWidth = 2.5;
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        ctx.beginPath(); ctx.moveTo(cx + dx * 6, cy + dy * 6); ctx.lineTo(cx + dx * 13, cy + dy * 13); ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawObjective(W, H, topY) {
    const ctx = this.ctx, g = this.game;
    // toasts under the weapon bar
    let ty = topY + 8;
    for (const t of this.toasts) {
      ctx.save(); ctx.globalAlpha = Math.min(1, t.t);
      ctx.font = `bold 15px ${FONT}`;
      const tw = ctx.measureText(t.text).width;
      roundRect(ctx, W / 2 - tw / 2 - 14, ty, tw + 28, 28, 7); ctx.fillStyle = 'rgba(8,10,20,0.74)'; ctx.fill();
      ctx.fillStyle = '#9fe3c8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t.text, W / 2, ty + 14);
      ctx.restore(); ty += 33;
    }
    const busy = this.dialogue.length > 0;
    // context hint above the dialogue / objective line
    const hint = g.activities.hint || g.hint;
    if (hint) {
      ctx.save();
      ctx.font = `bold 16px ${FONT}`;
      const tw = ctx.measureText(hint).width;
      const y = busy ? H - 174 : H - 140;
      roundRect(ctx, W / 2 - tw / 2 - 16, y, tw + 32, 34, 8);
      ctx.fillStyle = 'rgba(8,10,20,0.76)'; ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(hint, W / 2, y + 17);
      ctx.restore();
    }
    // objective line (bottom centre) when no one is talking
    if (this.objective && !busy) {
      ctx.save();
      ctx.font = `bold 19px ${FONT}`;
      const tw = ctx.measureText(this.objective).width;
      const y = H - 78;
      roundRect(ctx, W / 2 - tw / 2 - 22, y - 20, tw + 44, 40, 10);
      ctx.fillStyle = 'rgba(8,10,20,0.66)'; ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = this.objectiveFlash > 0 && Math.floor(this.objectiveFlash * 8) % 2 ? '#ffd24a' : '#ffffff';
      ctx.fillText(this.objective, W / 2, y + 1);
      ctx.restore();
    }
  }

  drawDialogue(W, H) {
    if (!this.dialogue.length) return;
    const line = this.dialogue[0];
    const shown = line.text.slice(0, Math.floor(this.dialogueTime * 55));
    const bw = Math.min(640, W - 560), bx = W / 2 - bw / 2;
    drawDialogueBox(this.ctx, line, shown, bx, H - 128, bw);
  }

  drawPopups(W, H, crewBottom) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'right';
    let y = crewBottom + (this.songCard ? 96 : 34);
    if (this.vehicleName) { ctx.globalAlpha = Math.min(1, this.vehicleName.t); outlined(ctx, this.vehicleName.text, W - 26, y, `22px ${DISPLAY}`, '#ffffff'); y += 34; }
    if (this.districtShow > 0 && this.district) {
      const d = DISTRICTS[this.district];
      ctx.globalAlpha = Math.min(1, this.districtShow);
      outlined(ctx, d.name, W - 26, y + 8, `italic 30px ${DISPLAY}`, '#ffffff');
      outlined(ctx, d.tag, W - 28, y + 30, `italic bold 14px ${FONT}`, '#ffd24a');
    }
    ctx.restore();
  }

  drawRace(W) {
    const r = this.game.activities.race;
    if (!r) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    if (r.time < 0) outlined(ctx, String(Math.ceil(-r.time)), W / 2, this.h / 2 - 40, `90px ${DISPLAY}`, '#ffd24a');
    else if (r.time < 1) outlined(ctx, 'GO!', W / 2, this.h / 2 - 40, `90px ${DISPLAY}`, '#7dffb0');
    roundRect(ctx, W / 2 - 150, 100, 300, 56, 10); ctx.fillStyle = 'rgba(8,10,20,0.6)'; ctx.fill();
    const pos = this.game.activities.racePosition();
    outlined(ctx, `${r.def.name.toUpperCase()}   POS ${pos}/4`, W / 2, 124, `16px ${DISPLAY}`, '#4ab8ff');
    outlined(ctx, `CP ${r.cp}/${r.def.checkpoints.length}    ${Math.max(0, r.time).toFixed(1)}s`, W / 2, 146, `bold 15px ${FONT}`, '#ffffff');
    ctx.restore();
  }

  drawBig(W, H) {
    const ctx = this.ctx;
    if (this.title && !this.big) {
      ctx.save(); ctx.globalAlpha = Math.min(1, this.title.t); ctx.textAlign = 'center';
      outlined(ctx, this.title.title.toUpperCase(), W / 2, H * 0.3, `44px ${DISPLAY}`, '#ffd24a', 5);
      outlined(ctx, this.title.giver, W / 2, H * 0.3 + 30, `italic bold 18px ${FONT}`, '#ffffff');
      ctx.restore();
    }
    if (!this.big) return;
    const b = this.big;
    ctx.save();
    ctx.globalAlpha = Math.min(1, b.t * 1.5);
    const sc = 1 + Math.max(0, b.t - 4.2) * 0.6;
    ctx.translate(W / 2, H * 0.36); ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-W, -46, W * 2, 92);
    ctx.textAlign = 'center';
    outlined(ctx, b.text, 0, 8, `52px ${DISPLAY}`, b.color, 6);
    if (b.sub) outlined(ctx, b.sub, 0, 36, `bold 18px ${FONT}`, '#ffffff');
    ctx.restore();
  }
}

