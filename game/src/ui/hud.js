// Heads-up display on a 2D canvas: minimap, vitals, rank, crew, cash, wanted stars, police dispatch, weapon slots,
// mission tracker, portrait dialogue, vehicle panel, radio and alerts.

import { Minimap, roundRect } from './minimap.js';
import { WEAPONS, WEAPON_ORDER, magOf } from '../combat/combat.js';
import { TACTICS } from '../systems/police.js';
import { CREW } from '../systems/crew.js';
import { drawPortrait, faceOf } from './portraits.js';
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
    this.radioFlash = 0;
    this.lockedSlot = null;
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
  showStation(st) { this.station = { text: st.name, tag: st.tag, t: 3 }; this.radioFlash = 3; }
  showSong() { this.radioFlash = 3; }
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
    if (this.radioFlash > 0) this.radioFlash -= dt;
    if (this.lockedSlot && (this.lockedSlot.t -= dt) <= 0) this.lockedSlot = null;
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
      else if (v.ai && v.ai.kind === 'roadblock') blips.push({ x: v.x, z: v.z, shape: 'square', color: '#ff6ac1', size: 4, edge: true });
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

    // left column, bottom up: vitals, minimap, rank, crew
    const ms = Math.round(Math.min(230, Math.max(170, H * 0.3)));
    const mx = 22, my = H - ms - 50;
    this.minimap.draw(ctx, g, mx, my, ms, this.collectBlips(), this.gpsRoute(), this.searchArea());
    this.drawVitals(mx, H - 40, ms);
    this.drawRank(mx, my - 34, ms);
    this.drawCrew(mx, my - 42 - 88, ms);
    // right column
    this.drawTopRight(W);
    const dispatchBottom = this.drawDispatch(W);
    if (p.vehicle) { this.drawVehiclePanel(W, H); this.drawRadio(W, H); }
    // centre
    if (!p.vehicle && p.alive && g.state === 'playing') this.drawCrosshair(W, H);
    this.drawWeaponSlots(W, H);
    const trackerBottom = this.drawTracker();
    this.drawHints(W, H, trackerBottom);
    this.drawDialogue(W, H);
    this.drawPopups(W, H, dispatchBottom);
    this.drawRace(W);
    this.drawBig(W, H);
    if (g.state === 'paused') { ctx.fillStyle = 'rgba(5,6,12,0.45)'; ctx.fillRect(0, 0, W, H); }
  }

  /** Health and armour bars with their numbers, under the minimap. */
  drawVitals(x, y, w) {
    const ctx = this.ctx, p = this.game.player;
    const half = (w - 6) / 2;
    labelBar(ctx, x, y, half, 18, p.hp / p.maxHp, p.hp < 30 ? '#ff4a4a' : '#4fd862', 'HEALTH', String(Math.max(0, Math.round(p.hp))));
    labelBar(ctx, x + half + 6, y, half, 18, p.armor / 100, '#4a8cff', 'ARMOR', String(Math.round(p.armor)));
  }

  /** Street rank and respect points above the minimap. */
  drawRank(x, y, w) {
    const ctx = this.ctx, r = this.game.crew.rank();
    ctx.save();
    roundRect(ctx, x, y, w, 26, 7); ctx.fillStyle = 'rgba(8,10,20,0.72)'; ctx.fill();
    roundRect(ctx, x + 3, y + 3, 26, 20, 5); ctx.fillStyle = '#ffd24a'; ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `15px ${DISPLAY}`; ctx.fillStyle = '#1a1200'; ctx.fillText(String(r.level), x + 16, y + 14);
    ctx.textAlign = 'left';
    outlined(ctx, r.name.toUpperCase(), x + 36, y + 10, `bold 11px ${FONT}`, '#ffffff', 3);
    const bx = x + 36, bw = w - 36 - 74;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(bx, y + 16, bw, 5);
    ctx.fillStyle = '#ffd24a'; ctx.fillRect(bx, y + 16, bw * Math.min(1, r.frac), 5);
    ctx.textAlign = 'right';
    outlined(ctx, r.rp.toLocaleString('en-US') + ' RP', x + w - 6, y + 18, `bold 13px ${FONT}`, '#ffe9a0', 3);
    ctx.restore();
  }

  /** Crew cards: portrait, hotkey, ability and a cooldown sweep. */
  drawCrew(x, y, w) {
    const ctx = this.ctx, crew = this.game.crew;
    const cw = (w - 8) / 3;
    ctx.save();
    CREW.forEach((c, k) => {
      const cx = x + k * (cw + 4);
      roundRect(ctx, cx, y, cw, 88, 8); ctx.fillStyle = crew.flash[c.id] > 0 ? 'rgba(60,50,10,0.85)' : 'rgba(8,10,20,0.72)'; ctx.fill();
      const ps = 46, px = cx + (cw - ps) / 2, py = y + 5;
      drawPortrait(ctx, c.portrait, px, py, ps, 0);
      const cd = crew.cool[c.id] || 0;
      if (cd > 0) {
        ctx.save();
        ctx.beginPath(); ctx.moveTo(px + ps / 2, py + ps / 2);
        ctx.arc(px + ps / 2, py + ps / 2, ps * 0.75, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (cd / c.cooldown));
        ctx.closePath(); roundRect(ctx, px, py, ps, ps, 6); ctx.clip();
        ctx.fillStyle = 'rgba(5,6,14,0.7)';
        ctx.beginPath(); ctx.moveTo(px + ps / 2, py + ps / 2);
        ctx.arc(px + ps / 2, py + ps / 2, ps * 0.75, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (cd / c.cooldown));
        ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.textAlign = 'center'; outlined(ctx, Math.ceil(cd) + 's', px + ps / 2, py + ps / 2 + 6, `bold 15px ${FONT}`, '#ffffff', 3);
      }
      // hotkey chip
      roundRect(ctx, cx + 3, y + 3, 17, 17, 4); ctx.fillStyle = cd > 0 ? '#5a5a66' : '#ffd24a'; ctx.fill();
      ctx.fillStyle = '#14100a'; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.keyLabel, cx + 11.5, y + 12);
      ctx.textBaseline = 'alphabetic';
      outlined(ctx, c.name.toUpperCase(), cx + cw / 2, y + 64, `bold 11px ${FONT}`, faceOf(c.portrait).color, 3);
      outlined(ctx, c.ability, cx + cw / 2, y + 79, `bold 10px ${FONT}`, cd > 0 ? 'rgba(255,255,255,0.55)' : '#ffffff', 3);
    });
    ctx.restore();
  }

  drawTopRight(W) {
    const g = this.game, ctx = this.ctx;
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
  }

  /** Police dispatch: every unit on the player with call sign, distance and tactic, plus the radio chatter. */
  drawDispatch(W) {
    const g = this.game, pol = g.police, ctx = this.ctx;
    if (pol.stars === 0) return 124;
    const rows = pol.dispatchList().slice(0, 6);
    const w = 312, x = W - 22 - w, y = 126;
    const chatter = pol.call ? pol.call.text : pol.unseen > 1.5 ? 'All units: suspect lost, search the area.' : null;
    ctx.save();
    ctx.font = `italic bold 12px ${FONT}`;
    const chatLines = chatter ? wrapLines(ctx, '"' + chatter + '"', w - 20) : [];
    const h = 34 + Math.max(1, rows.length) * 25 + (chatLines.length ? chatLines.length * 15 + 10 : 4);
    roundRect(ctx, x, y, w, h, 9); ctx.fillStyle = 'rgba(6,8,18,0.8)'; ctx.fill();
    const flash = Math.floor(g.time * 4) % 2;
    ctx.fillStyle = flash ? '#d8263a' : '#2a56e8'; roundRect(ctx, x, y, w, 26, 9); ctx.fill();
    ctx.fillStyle = 'rgba(6,8,18,0.8)'; ctx.fillRect(x, y + 20, w, 6);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    outlined(ctx, 'SOLARA PD DISPATCH', x + 10, y + 18, `13px ${DISPLAY}`, '#ffffff', 3);
    const units = rows.filter((r) => r.kind !== 'foot').length;
    ctx.textAlign = 'right';
    outlined(ctx, `${units} UNIT${units === 1 ? '' : 'S'} · ${'★'.repeat(pol.stars)}`, x + w - 10, y + 18, `bold 13px ${FONT}`, '#ffe04a', 3);
    let ry = y + 34;
    if (!rows.length) { ctx.textAlign = 'left'; outlined(ctx, 'Units en route…', x + 12, ry + 15, `bold 13px ${FONT}`, 'rgba(255,255,255,0.75)', 3); ry += 25; }
    for (const r of rows) {
      const t = TACTICS[r.tactic] || TACTICS.CLOSE;
      drawUnitIcon(ctx, r.kind, x + 18, ry + 10);
      ctx.textAlign = 'left';
      outlined(ctx, r.sign, x + 34, ry + 15, `bold 14px ${FONT}`, '#ffffff', 3);
      ctx.textAlign = 'right';
      outlined(ctx, Math.round(r.d) + ' m', x + 172, ry + 15, `bold 13px ${FONT}`, r.d < 30 ? '#ff8a8a' : 'rgba(230,236,255,0.85)', 3);
      ctx.font = `bold 11px ${FONT}`;
      const tw = ctx.measureText(t.label).width + 14;
      roundRect(ctx, x + w - 10 - tw, ry + 1, tw, 19, 5); ctx.fillStyle = t.color; ctx.fill();
      ctx.fillStyle = '#0a0a12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.label, x + w - 10 - tw / 2, ry + 11);
      ctx.textBaseline = 'alphabetic';
      ry += 25;
    }
    if (chatLines.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 10, ry + 1, w - 20, 1);
      ctx.textAlign = 'left';
      chatLines.forEach((l, k) => outlined(ctx, l, x + 10, ry + 16 + k * 15, `italic bold 12px ${FONT}`, '#9fe3ff', 3));
    }
    ctx.restore();
    return y + h;
  }

  /** Vehicle panel: speed gauge, model, class, gear and condition. */
  drawVehiclePanel(W, H) {
    const ctx = this.ctx, v = this.game.player.vehicle;
    const w = 312, h = 112, x = W - 22 - w, y = H - 22 - h;
    const kmh = Math.round(Math.abs(v.forwardSpeed) * 3.6);
    ctx.save();
    roundRect(ctx, x, y, w, h, 12); ctx.fillStyle = 'rgba(6,8,18,0.72)'; ctx.fill();
    const cx = x + 60, cy = y + 60, r = 42;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.stroke();
    const frac = Math.min(1, kmh / Math.max(120, v.spec.top * 3.6));
    const grd = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    grd.addColorStop(0, '#36f2ff'); grd.addColorStop(1, '#ff3fa4');
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * frac); ctx.strokeStyle = grd; ctx.stroke();
    ctx.textAlign = 'center';
    outlined(ctx, String(kmh), cx, cy + 9, `28px ${DISPLAY}`, '#ffffff');
    outlined(ctx, 'KM/H', cx, cy + 27, `bold 11px ${FONT}`, 'rgba(255,255,255,0.75)', 3);
    const gear = v.forwardSpeed < -0.5 ? 'R' : String(Math.min(6, 1 + Math.floor(Math.abs(v.forwardSpeed) / (v.spec.top / 6))));
    outlined(ctx, gear, cx, cy + 46, `bold 13px ${FONT}`, '#ffd24a', 3);
    const tx = x + 118;
    ctx.textAlign = 'left';
    outlined(ctx, v.spec.name.toUpperCase(), tx, y + 28, `17px ${DISPLAY}`, '#ffffff');
    outlined(ctx, `${v.spec.cls.toUpperCase()}  ·  GEAR ${gear}${v.spec.police ? '  ·  SIREN ' + (v.sirenOn ? 'ON' : 'OFF') : ''}`, tx, y + 46, `bold 11px ${FONT}`, 'rgba(220,230,255,0.8)', 3);
    const hpk = Math.max(0, v.health / v.spec.hp);
    const col = hpk > 0.6 ? '#4fd862' : hpk > 0.3 ? '#ffb03a' : '#ff4a4a';
    outlined(ctx, 'CONDITION', tx, y + 70, `bold 11px ${FONT}`, 'rgba(255,255,255,0.8)', 3);
    ctx.textAlign = 'right';
    outlined(ctx, Math.round(hpk * 100) + '%', x + w - 14, y + 70, `bold 15px ${FONT}`, col, 3);
    const bw = w - 118 - 14;
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(tx, y + 78, bw, 9);
    ctx.fillStyle = col; ctx.fillRect(tx, y + 78, bw * hpk, 9);
    for (let k = 1; k < 10; k++) { ctx.fillStyle = 'rgba(6,8,18,0.6)'; ctx.fillRect(tx + (bw * k) / 10 - 1, y + 78, 2, 9); }
    ctx.textAlign = 'left';
    const dmg = hpk > 0.8 ? 'Clean' : hpk > 0.55 ? 'Dented' : hpk > 0.3 ? 'Smoking' : 'On its last legs';
    outlined(ctx, 'DAMAGE: ' + dmg.toUpperCase(), tx, y + 102, `bold 10px ${FONT}`, col, 3);
    ctx.restore();
  }

  /** Car radio: station, song and artist; flashes when the station or song changes. */
  drawRadio(W, H) {
    const ctx = this.ctx, np = this.game.radio.nowPlaying();
    if (!np || this.game.player.vehicle.spec.police) return;
    const w = 312, h = 54, x = W - 22 - w, y = H - 22 - 112 - 8 - h;
    const hot = this.radioFlash > 0;
    ctx.save();
    roundRect(ctx, x, y, w, h, 10); ctx.fillStyle = hot ? 'rgba(60,10,40,0.85)' : 'rgba(6,8,18,0.72)'; ctx.fill();
    if (hot) { ctx.lineWidth = 2; ctx.strokeStyle = '#ff6ac1'; ctx.stroke(); }
    drawRadioIcon(ctx, x + 22, y + 27);
    ctx.textAlign = 'left';
    outlined(ctx, np.station, x + 42, y + 21, `14px ${DISPLAY}`, '#ff6ac1', 3);
    if (hot) { ctx.textAlign = 'right'; outlined(ctx, 'NOW PLAYING', x + w - 10, y + 20, `bold 10px ${FONT}`, '#ffd24a', 3); ctx.textAlign = 'left'; }
    outlined(ctx, `♪ ${np.title} — ${np.artist}`, x + 42, y + 40, `bold 13px ${FONT}`, '#ffffff', 3);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x + 42, y + 46, w - 54, 3);
    ctx.fillStyle = '#ff6ac1'; ctx.fillRect(x + 42, y + 46, (w - 54) * Math.min(1, np.progress), 3);
    ctx.restore();
  }

  /** Weapon slots 1-7: owned ones selectable, the current one with clip and reserve, locked ones padlocked. */
  drawWeaponSlots(W, H) {
    const g = this.game, ctx = this.ctx, p = g.player;
    const n = WEAPON_ORDER.length, sw = 60, sh = 54, gap = 6;
    const total = n * sw + (n - 1) * gap;
    const x0 = Math.round(W / 2 - total / 2), y0 = H - 22 - sh;
    const cur = WEAPONS[p.weapon];
    ctx.save();
    // header: current weapon name and ammo
    roundRect(ctx, x0, y0 - 30, total, 26, 8); ctx.fillStyle = 'rgba(6,8,18,0.72)'; ctx.fill();
    ctx.textAlign = 'left';
    outlined(ctx, cur.name.toUpperCase(), x0 + 10, y0 - 11, `15px ${DISPLAY}`, '#ffffff', 3);
    ctx.textAlign = 'right';
    if (p.reloading > 0) {
      const k = 1 - p.reloading / (p.reloadMax || 1);
      ctx.fillStyle = 'rgba(255,210,74,0.3)'; ctx.fillRect(x0 + total - 170, y0 - 24, 160 * k, 14);
      outlined(ctx, 'RELOADING…', x0 + total - 10, y0 - 12, `bold 14px ${FONT}`, '#ffd24a', 3);
    } else if (cur.melee) outlined(ctx, 'MELEE', x0 + total - 10, y0 - 11, `bold 14px ${FONT}`, '#ffd24a', 3);
    else {
      const mag = magOf(p, p.weapon), reserve = Math.max(0, (p.ammo[p.weapon] || 0) - mag);
      outlined(ctx, `${mag}`, x0 + total - 64, y0 - 10, `20px ${DISPLAY}`, mag === 0 ? '#ff5a5a' : '#ffd24a', 3);
      outlined(ctx, `/ ${reserve}`, x0 + total - 10, y0 - 11, `bold 14px ${FONT}`, 'rgba(255,255,255,0.85)', 3);
      ctx.font = `bold 10px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('CLIP ' + cur.clip, x0 + total - 124, y0 - 12);
    }
    WEAPON_ORDER.forEach((w, k) => {
      const x = x0 + k * (sw + gap);
      const owned = w === 'fist' || p.weapons.has(w);
      const active = w === p.weapon;
      const denied = this.lockedSlot && this.lockedSlot.slot === k;
      roundRect(ctx, x, y0, sw, sh, 8);
      ctx.fillStyle = active ? 'rgba(255,210,74,0.28)' : owned ? 'rgba(8,10,20,0.72)' : 'rgba(8,10,20,0.5)';
      ctx.fill();
      ctx.lineWidth = active ? 3 : 1.5;
      ctx.strokeStyle = active ? '#ffd24a' : denied ? '#ff4a4a' : owned ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
      ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      outlined(ctx, String(k + 1), x + 5, y0 + 14, `bold 12px ${FONT}`, active ? '#ffd24a' : 'rgba(255,255,255,0.75)', 3);
      ctx.save();
      ctx.globalAlpha = owned ? 1 : 0.28;
      drawWeaponIcon(ctx, w, x + sw / 2, y0 + 27, active ? '#ffffff' : '#d8dae6');
      ctx.restore();
      if (!owned) drawLock(ctx, x + sw - 13, y0 + 12);
      ctx.textAlign = 'center';
      const label = owned ? (WEAPONS[w].melee ? (w === 'fist' ? 'FISTS' : 'BAT') : String(p.ammo[w] || 0)) : 'LOCKED';
      outlined(ctx, label, x + sw / 2, y0 + sh - 6, `bold 10px ${FONT}`, !owned ? 'rgba(255,255,255,0.45)' : (p.ammo[w] || 0) === 0 && !WEAPONS[w].melee ? '#ff6a6a' : 'rgba(255,255,255,0.9)', 3);
    });
    ctx.restore();
  }

  drawCrosshair(W, H) {
    const ctx = this.ctx, g = this.game;
    const aim = g.camera.aiming;
    const cx = W / 2, cy = H / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
    const gap = aim ? 5 : 8, len = aim ? 7 : 6;
    if (!WEAPONS[g.player.weapon].melee) {
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

  /** Mission tracker: title, giver portrait, stage x/y with progress, the current step, NEXT and the timer. */
  drawTracker() {
    const ctx = this.ctx, g = this.game;
    const a = g.missions.active;
    const x = 22, y = 22, w = 352;
    ctx.save();
    if (!a) {
      const taxi = g.taxi.active;
      const next = g.missions.available()[0];
      const title = taxi ? 'BRISA CAB · ON DUTY' : g.activities.race ? null : 'FREE ROAM';
      if (!title) { ctx.restore(); return 22; }
      const sub = taxi ? `Fares in a row: ${g.taxi.streak}  ·  earned $${(g.taxi.earned || 0).toLocaleString('en-US')}` : next ? `Next job: ${next.title} for ${CONTACTS[next.giver].name} (${CONTACTS[next.giver].letter} on the map)` : 'Story complete. The city is yours.';
      roundRect(ctx, x, y, w, 50, 10); ctx.fillStyle = 'rgba(6,8,18,0.66)'; ctx.fill();
      ctx.fillStyle = taxi ? '#f6c445' : '#9fe3c8'; ctx.fillRect(x, y + 8, 4, 34);
      ctx.textAlign = 'left';
      outlined(ctx, title, x + 14, y + 22, `15px ${DISPLAY}`, taxi ? '#f6c445' : '#9fe3c8', 3);
      outlined(ctx, sub, x + 14, y + 40, `bold 12px ${FONT}`, 'rgba(255,255,255,0.85)', 3);
      if (this.objective) { ctx.restore(); return y + 50; }
      ctx.restore();
      return y + 50;
    }
    const c = CONTACTS[a.def.giver];
    const giverKey = { lou: 'LOU', teo: 'TEO', marr: 'DET. MARR' }[a.def.giver];
    const steps = a.steps, total = steps.length, stage = Math.min(total, a.index + 1);
    let next = null;
    for (let k = a.index + 1; k < steps.length; k++) if (steps[k].text) { next = steps[k].text; break; }
    ctx.font = `bold 14px ${FONT}`;
    const nowLines = wrapLines(ctx, this.objective || 'Listen to ' + c.name.split(' ')[0] + '.', w - 30).slice(0, 2);
    ctx.font = `bold 12px ${FONT}`;
    const nextLines = wrapLines(ctx, 'NEXT: ' + (next || 'Collect the payout.'), w - 30).slice(0, 2);
    const h = 104 + nowLines.length * 18 + nextLines.length * 15 + 8;
    roundRect(ctx, x, y, w, h, 11); ctx.fillStyle = 'rgba(6,8,18,0.74)'; ctx.fill();
    ctx.fillStyle = rgb(c.color); ctx.fillRect(x, y + 10, 4, h - 20);
    drawPortrait(ctx, giverKey, x + 12, y + 10, 54, 0);
    ctx.textAlign = 'left';
    outlined(ctx, a.def.title.toUpperCase(), x + 76, y + 30, `19px ${DISPLAY}`, '#ffd24a');
    outlined(ctx, `${c.name} · ${c.role.split(',')[0]}`, x + 76, y + 49, `bold 12px ${FONT}`, rgb(c.color), 3);
    outlined(ctx, `REWARD $${a.def.reward.toLocaleString('en-US')}`, x + 76, y + 64, `bold 11px ${FONT}`, '#7dffb0', 3);
    if (a.timer) {
      const s = Math.max(0, a.timer);
      ctx.textAlign = 'right';
      outlined(ctx, `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`, x + w - 12, y + 30, `22px ${DISPLAY}`, s < 15 ? '#ff6a6a' : '#ffffff');
      outlined(ctx, 'TIME LEFT', x + w - 12, y + 46, `bold 10px ${FONT}`, 'rgba(255,255,255,0.7)', 3);
      ctx.textAlign = 'left';
    }
    // stage bar
    const by = y + 74;
    outlined(ctx, `STAGE ${stage}/${total}`, x + 12, by + 13, `bold 13px ${FONT}`, '#ffffff', 3);
    const bx = x + 102, bw = w - 114;
    for (let k = 0; k < total; k++) {
      const sx = bx + (bw * k) / total, sw = bw / total - 3;
      ctx.fillStyle = k < a.index ? '#ffd24a' : k === a.index ? (Math.floor(g.time * 2) % 2 ? '#ffd24a' : '#b89020') : 'rgba(255,255,255,0.16)';
      ctx.fillRect(sx, by + 4, sw, 10);
    }
    let ty = by + 36;
    const flash = this.objectiveFlash > 0 && Math.floor(this.objectiveFlash * 8) % 2;
    nowLines.forEach((l, k) => outlined(ctx, (k === 0 ? '▶ ' : '   ') + l, x + 12, ty + k * 18, `bold 14px ${FONT}`, flash ? '#ffd24a' : '#ffffff', 3));
    ty += nowLines.length * 18 + 2;
    nextLines.forEach((l, k) => outlined(ctx, l, x + 12, ty + k * 15, `bold 12px ${FONT}`, '#9fe3ff', 3));
    ctx.restore();
    return y + h;
  }

  /** Context hints under the tracker, toasts at the top centre, and the free-roam objective above the weapon bar. */
  drawHints(W, H, top) {
    const ctx = this.ctx, g = this.game;
    const hint = g.activities.hint || g.hint;
    ctx.save();
    if (hint) {
      ctx.font = `bold 15px ${FONT}`;
      const tw = ctx.measureText(hint).width;
      const y = top + 8;
      roundRect(ctx, 22, y, tw + 28, 32, 8);
      ctx.fillStyle = 'rgba(8,10,20,0.75)'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(hint, 36, y + 16);
    }
    let ty = g.activities.race ? 90 : 22;
    for (const t of this.toasts) {
      ctx.globalAlpha = Math.min(1, t.t);
      ctx.font = `bold 14px ${FONT}`;
      const tw = ctx.measureText(t.text).width;
      roundRect(ctx, W / 2 - tw / 2 - 14, ty, tw + 28, 28, 7); ctx.fillStyle = 'rgba(8,10,20,0.75)'; ctx.fill();
      ctx.fillStyle = '#9fe3c8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t.text, W / 2, ty + 14);
      ty += 34;
    }
    ctx.globalAlpha = 1;
    if (this.objective && !this.dialogue.length && !g.missions.active) {
      ctx.font = `bold 18px ${FONT}`;
      const tw = ctx.measureText(this.objective).width;
      const y = H - 22 - 54 - 30 - 30;
      roundRect(ctx, W / 2 - tw / 2 - 20, y - 18, tw + 40, 36, 10);
      ctx.fillStyle = 'rgba(8,10,20,0.66)'; ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = this.objectiveFlash > 0 && Math.floor(this.objectiveFlash * 8) % 2 ? '#ffd24a' : '#ffffff';
      ctx.fillText(this.objective, W / 2, y + 1);
    }
    ctx.restore();
  }

  /** Dialogue box with the speaker's portrait (lips move while the line types out), name and role. */
  drawDialogue(W, H) {
    if (!this.dialogue.length) return;
    const ctx = this.ctx, line = this.dialogue[0];
    const chars = Math.floor(this.dialogueTime * 55);
    const shown = line.text.slice(0, chars);
    const typing = chars < line.text.length;
    const face = faceOf(line.who);
    ctx.save();
    const bw = Math.min(620, W - 80), bh = 100, bx = W / 2 - bw / 2, by = H - 22 - 54 - 30 - 12 - bh;
    roundRect(ctx, bx, by, bw, bh, 12);
    ctx.fillStyle = 'rgba(6,8,18,0.84)'; ctx.fill();
    const col = face ? face.color : '#ffd24a';
    ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
    const talk = typing ? (Math.sin(this.dialogueTime * 26) * 0.5 + 0.5) : 0;
    drawPortrait(ctx, line.who, bx + 10, by + 10, 80, talk);
    const tx = bx + 104;
    ctx.textAlign = 'left';
    outlined(ctx, line.who, tx, by + 27, `16px ${DISPLAY}`, col);
    ctx.font = `16px ${DISPLAY}`;
    const nw = ctx.measureText(line.who).width;
    const role = face ? face.role : line.who === 'TIP' ? 'Tip' : 'Port Solara';
    outlined(ctx, role, tx + nw + 12, by + 26, `italic bold 12px ${FONT}`, 'rgba(255,255,255,0.7)', 3);
    ctx.font = `bold 16px ${FONT}`; ctx.fillStyle = '#ffffff';
    const lines = wrapLines(ctx, shown, bw - 104 - 18).slice(0, 3);
    lines.forEach((l, k) => ctx.fillText(l, tx, by + 52 + k * 20));
    ctx.font = `11px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.textAlign = 'right';
    ctx.fillText('ENTER to skip', bx + bw - 12, by + bh - 8);
    ctx.restore();
  }

  drawPopups(W, H, dispatchBottom) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'right';
    if (this.districtShow > 0 && this.district) {
      const d = DISTRICTS[this.district];
      ctx.globalAlpha = Math.min(1, this.districtShow);
      const dy = this.game.player.vehicle ? Math.max(dispatchBottom + 40, H - 228) : H - 60;
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

function labelBar(ctx, x, y, w, h, frac, color, label, value) {
  ctx.fillStyle = 'rgba(8,10,20,0.75)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; outlined(ctx, label, x + 6, y + h / 2 + 1, `bold 11px ${FONT}`, '#ffffff', 3);
  ctx.textAlign = 'right'; outlined(ctx, value, x + w - 6, y + h / 2 + 1, `bold 13px ${FONT}`, '#ffffff', 3);
  ctx.textBaseline = 'alphabetic';
}

function wrapLines(ctx, text, maxW) {
  const words = text.split(' '), out = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
  }
  if (line) out.push(line);
  return out;
}

/** Small icons for the dispatch rows: cruiser, helicopter, roadblock and officers on foot. */
function drawUnitIcon(ctx, kind, x, y) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#e8ecf8'; ctx.strokeStyle = '#e8ecf8'; ctx.lineWidth = 2;
  if (kind === 'car') {
    roundRect(ctx, -9, -3, 18, 7, 2); ctx.fill();
    roundRect(ctx, -5, -7, 10, 5, 2); ctx.fill();
    ctx.fillStyle = '#ff3a4a'; ctx.fillRect(-4, -9, 4, 2); ctx.fillStyle = '#3a7aff'; ctx.fillRect(0, -9, 4, 2);
  } else if (kind === 'heli') {
    ctx.beginPath(); ctx.ellipse(-1, 0, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(4, -1, 7, 2);
    ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(9, -6); ctx.stroke();
  } else if (kind === 'block') {
    ctx.fillStyle = '#ff6ac1';
    for (let k = 0; k < 3; k++) ctx.fillRect(-9 + k * 7, -3, 4, 7);
    ctx.fillStyle = '#e8ecf8'; ctx.fillRect(-10, -5, 20, 2);
  } else {
    ctx.beginPath(); ctx.arc(-3, -5, 2.5, 0, Math.PI * 2); ctx.arc(4, -5, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-6, -2, 6, 8); ctx.fillRect(1, -2, 6, 8);
  }
  ctx.restore();
}

function drawRadioIcon(ctx, x, y) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#ff6ac1';
  roundRect(ctx, -11, -6, 22, 15, 3); ctx.fill();
  ctx.fillStyle = '#0a0a12'; ctx.beginPath(); ctx.arc(-4, 1.5, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(3, -2, 5, 2); ctx.fillRect(3, 2, 5, 2);
  ctx.strokeStyle = '#ff6ac1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(6, -13); ctx.stroke();
  ctx.restore();
}

function drawLock(ctx, x, y) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, -2, 4, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-5.5, -2, 11, 8);
  ctx.restore();
}

function outlined(ctx, text, x, y, font, color, width = 4) {
  ctx.font = font;
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = 'rgba(5,6,14,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
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

/** Vector silhouettes for each weapon, centred on (x, y). */
function drawWeaponIcon(ctx, w, x, y, color = '#e8e8f0') {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
  if (w === 'fist') {
    roundRect(ctx, -9, -8, 18, 15, 5); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = 0; k < 3; k++) ctx.fillRect(-5 + k * 5, -8, 1.5, 6);
  } else if (w === 'bat') {
    ctx.rotate(-0.5);
    ctx.beginPath(); ctx.moveTo(-17, -1.5); ctx.lineTo(8, -4.5); ctx.quadraticCurveTo(15, -4, 15, 0); ctx.quadraticCurveTo(15, 4, 8, 4.5); ctx.lineTo(-17, 1.5); ctx.closePath(); ctx.fill();
    ctx.fillRect(-20, -2.5, 4, 5);
  } else if (w === 'launcher') {
    ctx.fillRect(-21, -5, 40, 7);
    ctx.fillRect(14, -7, 7, 11);
    ctx.fillRect(-6, 2, 4, 7); ctx.fillRect(4, 2, 3, 6);
    ctx.fillStyle = '#ff6a3a'; ctx.beginPath(); ctx.moveTo(-21, -5); ctx.lineTo(-27, -1.5); ctx.lineTo(-21, 2); ctx.closePath(); ctx.fill();
  } else {
    const len = { pistol: 20, smg: 28, shotgun: 38, rifle: 40 }[w];
    const x0 = -len / 2;
    ctx.fillRect(x0, -5, len, 6);
    ctx.fillRect(x0 + 1, 0, 6, 10);
    if (w === 'smg' || w === 'rifle') ctx.fillRect(x0 + 13, 1, 4, 9);
    if (w === 'rifle' || w === 'shotgun') ctx.fillRect(x0 - 8, -4, 9, 8);
    if (w === 'shotgun') ctx.fillRect(x0 + 16, 1, 12, 3);
    if (w === 'rifle') ctx.fillRect(x0 + 18, -8, 8, 3);
  }
  ctx.restore();
}
