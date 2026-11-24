// Heads-up display on a 2D canvas: minimap, health/armor, cash, wanted stars, weapon, objectives, dialogue and alerts.

import { Minimap, roundRect } from './minimap.js';
import { WEAPONS } from '../combat/combat.js';
import { formatClock } from '../engine/environment.js';
import { DISTRICTS, districtAt, POI } from '../world/city.js';
import { CONTACTS } from '../story/script.js';
import { RACES, TOKEN_SPOTS } from '../story/activities.js';
import { nearestNode, routeDir, DIRS, dirOfHeading } from '../world/roads.js';
import { PITCH } from '../world/city.js';

const FONT = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';
const DISPLAY = '"Arial Black", "Segoe UI Black", Impact, sans-serif';

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
  showStation(st) { this.station = { text: st.name, tag: st.tag, t: 3 }; }
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
    for (const k of ['vehicleName', 'station']) if (this[k]) { this[k].t -= dt; if (this[k].t <= 0) this[k] = null; }
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
    this.drawVitals(mx, my + ms + 8, ms);
    this.drawTopRight(W);
    if (p.vehicle) this.drawSpeedo(W, H);
    if (!p.vehicle && p.alive && g.state === 'playing') this.drawCrosshair(W, H);
    this.drawObjective(W, H);
    this.drawDialogue(W, H);
    this.drawPopups(W, H);
    this.drawRace(W);
    this.drawBig(W, H);
    if (g.state === 'paused') { ctx.fillStyle = 'rgba(5,6,12,0.45)'; ctx.fillRect(0, 0, W, H); }
  }

  drawVitals(x, y, w) {
    const ctx = this.ctx, p = this.game.player;
    const half = (w - 6) / 2;
    bar(ctx, x, y, half, 9, p.hp / p.maxHp, p.hp < 30 ? '#ff4a4a' : '#57d36a');
    bar(ctx, x + half + 6, y, half, 9, p.armor / 100, '#4a8cff');
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
    // weapon
    const w = WEAPONS[p.weapon];
    const wy = 140;
    const ammo = w.melee ? '' : String(p.ammo[p.weapon] || 0);
    ctx.save();
    ctx.globalAlpha = 0.92;
    roundRect(ctx, x - 168, wy, 168, 44, 10);
    ctx.fillStyle = 'rgba(8,10,20,0.55)'; ctx.fill();
    ctx.restore();
    drawWeaponIcon(ctx, p.weapon, x - 152, wy + 22);
    ctx.textAlign = 'right';
    outlined(ctx, w.name, x - 12, wy + 19, `bold 14px ${FONT}`, '#ffffff');
    if (ammo) outlined(ctx, ammo, x - 12, wy + 38, `bold 15px ${FONT}`, '#ffd24a');
  }

  drawSpeedo(W, H) {
    const ctx = this.ctx, v = this.game.player.vehicle;
    const kmh = Math.round(Math.abs(v.forwardSpeed) * 3.6);
    const cx = W - 96, cy = H - 92, r = 62;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r + 10, 0, Math.PI * 2); ctx.fillStyle = 'rgba(8,10,20,0.5)'; ctx.fill();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.stroke();
    const frac = Math.min(1, kmh / 240);
    const grd = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    grd.addColorStop(0, '#36f2ff'); grd.addColorStop(1, '#ff3fa4');
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * frac); ctx.strokeStyle = grd; ctx.stroke();
    ctx.textAlign = 'center';
    outlined(ctx, String(kmh), cx, cy + 10, `32px ${DISPLAY}`, '#ffffff');
    outlined(ctx, 'KM/H', cx, cy + 30, `bold 11px ${FONT}`, 'rgba(255,255,255,0.7)');
    const hpk = v.health / v.spec.hp;
    ctx.fillStyle = hpk > 0.5 ? '#57d36a' : hpk > 0.25 ? '#ffb03a' : '#ff4a4a';
    ctx.fillRect(cx - 26, cy + 38, 52 * Math.max(0, hpk), 4);
    ctx.restore();
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

  drawObjective(W, H) {
    const ctx = this.ctx, g = this.game;
    const a = g.missions.active;
    // mission card (top-left)
    if (a) {
      const t = a.def.title.toUpperCase();
      ctx.save();
      roundRect(ctx, 22, 22, 300, a.timer ? 70 : 50, 10);
      ctx.fillStyle = 'rgba(8,10,20,0.6)'; ctx.fill();
      ctx.fillStyle = rgb(CONTACTS[a.def.giver].color); ctx.fillRect(22, 30, 4, 34);
      ctx.textAlign = 'left';
      outlined(ctx, t, 36, 46, `18px ${DISPLAY}`, '#ffd24a');
      outlined(ctx, CONTACTS[a.def.giver].name, 36, 64, `bold 12px ${FONT}`, 'rgba(255,255,255,0.75)');
      if (a.timer) {
        const s = Math.max(0, a.timer);
        outlined(ctx, `TIME  ${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`, 36, 84, `bold 15px ${FONT}`, s < 15 ? '#ff6a6a' : '#ffffff');
      }
      ctx.restore();
    }
    const hint = g.activities.hint || g.hint;
    if (hint) {
      ctx.save();
      ctx.font = `bold 15px ${FONT}`;
      const tw = ctx.measureText(hint).width;
      const y = a ? (a.timer ? 104 : 84) : 22;
      roundRect(ctx, 22, y, tw + 28, 34, 8);
      ctx.fillStyle = 'rgba(8,10,20,0.72)'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(hint, 36, y + 17);
      ctx.restore();
    }
    // toasts
    let ty = 140;
    for (const t of this.toasts) {
      ctx.save(); ctx.globalAlpha = Math.min(1, t.t);
      ctx.font = `bold 14px ${FONT}`;
      const tw = ctx.measureText(t.text).width;
      roundRect(ctx, 22, ty, tw + 24, 28, 7); ctx.fillStyle = 'rgba(8,10,20,0.7)'; ctx.fill();
      ctx.fillStyle = '#9fe3c8'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t.text, 34, ty + 14);
      ctx.restore(); ty += 34;
    }
    // objective line (bottom centre)
    if (this.objective && !this.dialogue.length) {
      ctx.save();
      ctx.font = `bold 19px ${FONT}`;
      const tw = ctx.measureText(this.objective).width;
      const y = H - 78;
      roundRect(ctx, W / 2 - tw / 2 - 22, y - 20, tw + 44, 40, 10);
      ctx.fillStyle = 'rgba(8,10,20,0.6)'; ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = this.objectiveFlash > 0 && Math.floor(this.objectiveFlash * 8) % 2 ? '#ffd24a' : '#ffffff';
      ctx.fillText(this.objective, W / 2, y + 1);
      ctx.restore();
    }
  }

  drawDialogue(W, H) {
    if (!this.dialogue.length) return;
    const ctx = this.ctx, line = this.dialogue[0];
    const shown = line.text.slice(0, Math.floor(this.dialogueTime * 55));
    ctx.save();
    const bw = Math.min(760, W - 80), bx = W / 2 - bw / 2, by = H - 150;
    roundRect(ctx, bx, by, bw, 84, 12);
    ctx.fillStyle = 'rgba(8,10,20,0.78)'; ctx.fill();
    ctx.textAlign = 'left';
    const col = { LOU: '#ff6ac1', TEO: '#4ae4ff', 'DET. MARR': '#8c9cff', MARCO: '#ffd24a', CRANE: '#ff5a5a', ROCCO: '#9fe3c8' }[line.who] || '#ffd24a';
    outlined(ctx, line.who, bx + 22, by + 28, `15px ${DISPLAY}`, col);
    ctx.font = `17px ${FONT}`; ctx.fillStyle = '#ffffff';
    wrapText(ctx, shown, bx + 22, by + 52, bw - 44, 21);
    ctx.font = `11px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.textAlign = 'right';
    ctx.fillText('ENTER to skip', bx + bw - 14, by + 76);
    ctx.restore();
  }

  drawPopups(W, H) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'right';
    let y = H - 200;
    if (this.game.player.vehicle) y = H - 190;
    if (this.vehicleName) { ctx.globalAlpha = Math.min(1, this.vehicleName.t); outlined(ctx, this.vehicleName.text, W - 28, y, `22px ${DISPLAY}`, '#ffffff'); y -= 30; }
    if (this.station) { ctx.globalAlpha = Math.min(1, this.station.t); outlined(ctx, this.station.text, W - 28, y, `18px ${DISPLAY}`, '#ff6ac1'); outlined(ctx, this.station.tag, W - 28, y + 18, `italic 12px ${FONT}`, 'rgba(255,255,255,0.8)'); }
    if (this.districtShow > 0 && this.district) {
      const d = DISTRICTS[this.district];
      ctx.globalAlpha = Math.min(1, this.districtShow);
      ctx.textAlign = 'right';
      const dy = this.game.player.vehicle ? H - 262 : H - 96;
      outlined(ctx, d.name, W - 28, dy, `italic 30px ${DISPLAY}`, '#ffffff');
      outlined(ctx, d.tag, W - 30, dy + 22, `italic 14px ${FONT}`, '#ffd24a');
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
    roundRect(ctx, W / 2 - 150, 20, 300, 56, 10); ctx.fillStyle = 'rgba(8,10,20,0.6)'; ctx.fill();
    const pos = this.game.activities.racePosition();
    outlined(ctx, `${r.def.name.toUpperCase()}   POS ${pos}/4`, W / 2, 44, `16px ${DISPLAY}`, '#4ab8ff');
    outlined(ctx, `CP ${r.cp}/${r.def.checkpoints.length}    ${Math.max(0, r.time).toFixed(1)}s`, W / 2, 66, `bold 15px ${FONT}`, '#ffffff');
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

function rgb(c) { return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`; }

function outlined(ctx, text, x, y, font, color, width = 4) {
  ctx.font = font;
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = 'rgba(5,6,14,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(8,10,20,0.7)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}

function drawStar(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
}

/** Tiny vector icons for each weapon. */
function drawWeaponIcon(ctx, w, x, y) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#e8e8f0'; ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 2;
  if (w === 'fist') { roundRect(ctx, -2, -9, 18, 16, 5); ctx.fill(); }
  else {
    const len = { pistol: 18, smg: 26, shotgun: 34, rifle: 36 }[w];
    ctx.fillRect(-2, -6, len, 6);
    ctx.fillRect(-2, -1, 6, 10);
    if (w === 'smg' || w === 'rifle') ctx.fillRect(10, 0, 4, 9);
    if (w === 'rifle' || w === 'shotgun') ctx.fillRect(-10, -5, 9, 8);
  }
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; }
    else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}
