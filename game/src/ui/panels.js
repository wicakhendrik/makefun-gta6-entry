// HUD panels: mission tracker, police dispatch, weapon slots, portrait dialogue, crew, respect rank,
// vehicle condition with the radio, and labelled health/armour bars.

import { roundRect } from './minimap.js';
import { FONT, DISPLAY, outlined, bar, panel, keyCap, drawStar, wrapText, drawWeaponIcon, drawLock } from './draw2d.js';
import { drawPortrait } from './portraits.js';
import { castFor } from '../story/cast.js';
import { CONTACTS } from '../story/script.js';
import { WEAPONS, WEAPON_ORDER, clipOf } from '../combat/combat.js';
import { TACTIC_INFO } from '../systems/police.js';
import { CREW } from '../systems/crew.js';
import { RANKS } from '../systems/respect.js';

const GIVER_CAST = { lou: 'LOU', teo: 'TEO', marr: 'DET. MARR' };

function clock(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

/** Top-left: the active mission (stage x/y, progress, objective, next step, timer) or the next job on offer. */
export function drawMissionTracker(ctx, g, hud, x, y, w) {
  const a = g.missions.active;
  if (!a) {
    const next = g.missions.available()[0];
    if (!next) return y;
    const c = CONTACTS[next.giver];
    panel(ctx, x, y, w, 58, c && `rgb(${c.color.map((v) => Math.round(v * 255)).join(',')})`);
    drawPortrait(ctx, castFor(GIVER_CAST[next.giver]).face, x + 12, y + 8, 42, GIVER_CAST[next.giver]);
    ctx.textAlign = 'left';
    outlined(ctx, 'NEXT JOB', x + 64, y + 22, `bold 12px ${FONT}`, '#9fe3c8', 3);
    outlined(ctx, next.title.toUpperCase(), x + 64, y + 44, `17px ${DISPLAY}`, '#ffd24a');
    ctx.textAlign = 'right';
    outlined(ctx, `${c.letter} on map`, x + w - 12, y + 22, `bold 12px ${FONT}`, 'rgba(255,255,255,0.75)', 3);
    ctx.textAlign = 'left';
    return y + 58;
  }
  const pr = g.missions.progress();
  const giverKey = GIVER_CAST[a.def.giver];
  const cast = castFor(giverKey);
  const h = 128 + (a.timer ? 0 : 0);
  panel(ctx, x, y, w, h, cast.color);
  drawPortrait(ctx, cast.face, x + 12, y + 10, 46, giverKey);
  ctx.textAlign = 'left';
  outlined(ctx, a.def.title.toUpperCase(), x + 68, y + 30, `19px ${DISPLAY}`, '#ffd24a');
  outlined(ctx, cast.name, x + 68, y + 50, `bold 13px ${FONT}`, 'rgba(255,255,255,0.8)', 3);
  ctx.textAlign = 'right';
  if (a.timer) {
    const s = Math.max(0, a.timer);
    outlined(ctx, clock(s), x + w - 12, y + 30, `20px ${DISPLAY}`, s < 15 && Math.floor(g.time * 4) % 2 ? '#ff4a4a' : '#ffffff');
    outlined(ctx, 'TIME LEFT', x + w - 12, y + 48, `bold 11px ${FONT}`, '#ff9a9a', 3);
  } else {
    outlined(ctx, `$${a.def.reward.toLocaleString('en-US')}`, x + w - 12, y + 30, `bold 15px ${FONT}`, '#7dffb0', 3);
    outlined(ctx, 'REWARD', x + w - 12, y + 48, `bold 11px ${FONT}`, 'rgba(255,255,255,0.6)', 3);
  }
  // stage and segmented progress bar
  ctx.textAlign = 'left';
  const by = y + 66;
  outlined(ctx, `STAGE ${pr.stage}/${pr.total}`, x + 14, by + 4, `bold 13px ${FONT}`, '#ffffff', 3);
  const bx = x + 106, bw = w - 120, seg = bw / pr.total;
  for (let k = 0; k < pr.total; k++) {
    ctx.fillStyle = k < pr.stage - 1 ? '#ffd24a' : k === pr.stage - 1 ? (Math.floor(g.time * 2) % 2 ? '#ffd24a' : '#b08a20') : 'rgba(255,255,255,0.16)';
    ctx.fillRect(bx + k * seg + 1, by - 6, seg - 3, 9);
  }
  ctx.font = `bold 15px ${FONT}`; ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'alphabetic';
  wrapText(ctx, hud.objective || pr.current || '', x + 14, by + 28, w - 28, 18, 1);
  ctx.font = `bold 13px ${FONT}`; ctx.fillStyle = '#9fe3c8';
  wrapText(ctx, 'NEXT ›  ' + pr.next, x + 14, by + 50, w - 28, 16, 1);
  return y + h;
}

/** Left: the SPD dispatch board while wanted — every pursuing unit's call sign, distance and tactic. */
export function drawDispatchPanel(ctx, g, x, y, w) {
  const pol = g.police;
  if (pol.stars === 0) return y;
  const units = pol.dispatchUnits();
  const rows = units.slice(0, 6);
  const h = 62 + rows.length * 24 + 4;
  const flash = Math.floor(g.time * 4) % 2;
  panel(ctx, x, y, w, h, flash ? '#ff3a4a' : '#3a6aff', 0.78);
  ctx.textAlign = 'left';
  outlined(ctx, 'SPD DISPATCH', x + 14, y + 24, `16px ${DISPLAY}`, '#ffffff');
  for (let k = 0; k < 5; k++) drawStar(ctx, x + 172 + k * 19, y + 18, 8, k < pol.stars ? '#ffd24a' : 'rgba(0,0,0,0.3)', k < pol.stars ? '#3a2a00' : 'rgba(255,255,255,0.3)');
  ctx.textAlign = 'right';
  const cars = units.filter((u) => u.kind === 'car' && u.tactic !== 'down').length;
  outlined(ctx, `UNITS ${cars}${pol.heli && pol.heli.hp > 0 ? ' + AIR' : ''}`, x + w - 12, y + 24, `bold 13px ${FONT}`, '#ffd24a', 3);
  // status line
  ctx.textAlign = 'left';
  const seen = pol.unseen < 0.5;
  const status = pol.jam > 0 ? `SIGNAL JAMMED  ${pol.jam.toFixed(0)}s` : seen ? 'EYES ON SUSPECT' : `SEARCHING · LOST ${pol.unseen.toFixed(0)}s / ${pol.wantedTimeout.toFixed(0)}s`;
  outlined(ctx, status, x + 14, y + 46, `bold 12px ${FONT}`, pol.jam > 0 ? '#3dff8e' : seen ? '#ff6a6a' : '#8fb4ff', 3);
  let ry = y + 62;
  for (const u of rows) {
    const t = TACTIC_INFO[u.tactic] || TACTIC_INFO.close;
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x + 8, ry - 4, w - 16, 21);
    ctx.beginPath(); ctx.arc(x + 20, ry + 6, 5, 0, Math.PI * 2); ctx.fillStyle = t.color; ctx.fill();
    ctx.textAlign = 'left';
    outlined(ctx, u.call, x + 32, ry + 12, `bold 14px ${FONT}`, u.kind === 'air' ? '#9fd0ff' : '#ffffff', 3);
    ctx.textAlign = 'right';
    outlined(ctx, `${Math.round(u.dist)} m`, x + 172, ry + 12, `bold 13px ${FONT}`, 'rgba(255,255,255,0.8)', 3);
    ctx.textAlign = 'left';
    outlined(ctx, t.label, x + 186, ry + 12, `bold 13px ${FONT}`, t.color, 3);
    ry += 24;
  }
  if (pol.jam > 0) {
    // radio static over the board while Dex has the band jammed
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#3dff8e';
    for (let k = 0; k < 14; k++) ctx.fillRect(x + 6, y + 56 + ((k * 37 + Math.floor(g.time * 60) * 13) % (h - 60)), w - 12, 1.5);
    ctx.restore();
  }
  return y + h;
}

/** Top centre: seven numbered weapon slots, the current one highlighted with clip and reserve, locked ones padlocked. */
export function drawWeaponSlots(ctx, g, cx, y) {
  const p = g.player;
  const n = WEAPON_ORDER.length, sw = 52, gap = 6, total = n * sw + (n - 1) * gap;
  const x0 = cx - total / 2;
  for (let k = 0; k < n; k++) {
    const w = WEAPON_ORDER[k], spec = WEAPONS[w];
    const owned = w === 'fist' || p.weapons.has(w);
    const cur = p.weapon === w;
    const x = x0 + k * (sw + gap);
    ctx.save();
    roundRect(ctx, x, y, sw, 46, 8);
    ctx.fillStyle = cur ? 'rgba(255,210,74,0.28)' : 'rgba(8,10,22,0.7)'; ctx.fill();
    ctx.lineWidth = cur ? 2.5 : 1; ctx.strokeStyle = cur ? '#ffd24a' : 'rgba(255,255,255,0.14)'; ctx.stroke();
    ctx.restore();
    ctx.textAlign = 'left';
    outlined(ctx, String(k + 1), x + 5, y + 14, `bold 11px ${FONT}`, cur ? '#ffd24a' : 'rgba(255,255,255,0.6)', 3);
    drawWeaponIcon(ctx, w, x + sw / 2 + 2, y + 25, w === 'shotgun' || w === 'rifle' || w === 'launcher' ? 0.95 : 1, owned ? (cur ? '#ffffff' : '#c8ccd8') : 'rgba(200,204,216,0.22)');
    if (!owned) drawLock(ctx, x + sw - 11, y + 13);
    else if (spec.clip) {
      ctx.textAlign = 'right';
      outlined(ctx, String(p.ammo[w] || 0), x + sw - 4, y + 42, `bold 10px ${FONT}`, (p.ammo[w] || 0) > 0 ? 'rgba(255,255,255,0.8)' : '#ff6a6a', 3);
    }
  }
  // current weapon name, clip and reserve
  const spec = WEAPONS[p.weapon];
  ctx.textAlign = 'center';
  let label = spec.name.toUpperCase();
  if (spec.clip) {
    const clip = clipOf(p, p.weapon), reserve = Math.max(0, (p.ammo[p.weapon] || 0) - clip);
    label += p.reloading > 0 ? '   RELOADING…' : `   ${clip} / ${reserve}`;
  } else label += spec.melee && p.weapon !== 'fist' ? '   MELEE' : '';
  ctx.font = `bold 15px ${FONT}`;
  const tw = ctx.measureText(label).width;
  ctx.save(); roundRect(ctx, cx - tw / 2 - 14, y + 51, tw + 28, 24, 7); ctx.fillStyle = 'rgba(8,10,22,0.72)'; ctx.fill(); ctx.restore();
  outlined(ctx, label, cx, y + 68, `bold 15px ${FONT}`, p.reloading > 0 ? '#ffb03a' : '#ffd24a', 3);
  if (p.reloading > 0 && spec.reload) {
    ctx.fillStyle = '#ffb03a'; ctx.fillRect(cx - tw / 2 - 6, y + 72, (tw + 12) * (1 - p.reloading / spec.reload), 2);
  }
  return y + 78;
}

/** Bottom centre: the speaker's portrait, name and role, and the line being typed out. */
export function drawDialogueBox(ctx, line, shown, x, y, w) {
  const cast = castFor(line.who);
  const h = 108;
  panel(ctx, x, y, w, h, cast.color, 0.82);
  drawPortrait(ctx, cast.face, x + 12, y + 12, 84, line.who);
  ctx.save(); roundRect(ctx, x + 12, y + 12, 84, 84, 12); ctx.lineWidth = 2; ctx.strokeStyle = cast.color; ctx.stroke(); ctx.restore();
  ctx.textAlign = 'left';
  outlined(ctx, cast.name.toUpperCase(), x + 110, y + 30, `16px ${DISPLAY}`, cast.color);
  ctx.font = `bold 16px ${DISPLAY}`;
  const nw = ctx.measureText(cast.name.toUpperCase()).width;
  if (cast.role) outlined(ctx, cast.role, x + 120 + nw, y + 30, `italic bold 12px ${FONT}`, 'rgba(255,255,255,0.6)', 3);
  ctx.font = `bold 17px ${FONT}`; ctx.fillStyle = '#ffffff';
  wrapText(ctx, shown, x + 110, y + 56, w - 126, 21, 3);
  ctx.font = `11px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.textAlign = 'right';
  ctx.fillText('ENTER ▸ skip', x + w - 12, y + h - 9);
  return y + h;
}

/** Right: respect rank badge, rank name and progress to the next rank. */
export function drawRankBar(ctx, g, xr, y, w) {
  const r = g.respect, n = r.rank, [have, need] = r.progress();
  const x = xr - w;
  panel(ctx, x, y, w, 44, null, 0.66);
  // hexagon badge with the rank number
  ctx.save();
  ctx.beginPath();
  for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; ctx.lineTo(x + 24 + Math.cos(a) * 17, y + 22 + Math.sin(a) * 17); }
  ctx.closePath(); ctx.fillStyle = '#7dffb0'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#0c3a20'; ctx.stroke();
  ctx.fillStyle = '#08200f'; ctx.font = `17px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.fillText(String(n + 1), x + 24, y + 29);
  ctx.restore();
  ctx.textAlign = 'left';
  outlined(ctx, `RANK ${n + 1} · ${RANKS[n].toUpperCase()}`, x + 48, y + 18, `bold 14px ${FONT}`, '#ffffff', 3);
  bar(ctx, x + 48, y + 26, w - 60, 7, have / need, '#7dffb0');
  ctx.textAlign = 'right';
  outlined(ctx, `${r.points.toLocaleString('en-US')} RP`, x + w - 10, y + 18, `bold 12px ${FONT}`, '#7dffb0', 3);
  ctx.textAlign = 'left';
  return y + 44;
}

/** Right: the crew, each with a portrait, ability hotkey and cooldown. */
export function drawCrewPanel(ctx, g, hud, xr, y, w) {
  const crew = g.crew, x = xr - w;
  const rowH = 50, h = 28 + CREW.length * rowH;
  panel(ctx, x, y, w, h, null, 0.66);
  ctx.textAlign = 'left';
  outlined(ctx, 'CREW', x + 12, y + 19, `14px ${DISPLAY}`, '#ffd24a', 3);
  ctx.textAlign = 'right';
  outlined(ctx, 'call with Z X C', x + w - 10, y + 19, `bold 11px ${FONT}`, 'rgba(255,255,255,0.55)', 3);
  let ry = y + 26;
  for (const c of CREW) {
    const key = c.id.toUpperCase();
    const cast = castFor(key);
    const joined = crew.joined(c), left = crew.cooldownLeft(c);
    const flash = hud.crewFlash && hud.crewFlash.id === c.id && hud.crewFlash.t > 0;
    if (flash) { ctx.fillStyle = `rgba(255,210,74,${0.3 * hud.crewFlash.t})`; ctx.fillRect(x + 4, ry, w - 8, rowH - 4); }
    ctx.save(); if (!joined) ctx.globalAlpha = 0.4;
    drawPortrait(ctx, cast.face, x + 8, ry + 3, 40, key);
    ctx.restore();
    ctx.textAlign = 'left';
    outlined(ctx, `${c.name.split(' ')[0].toUpperCase()} "${c.nick}"`, x + 56, ry + 18, `bold 13px ${FONT}`, joined ? cast.color : 'rgba(255,255,255,0.45)', 3);
    if (!joined) {
      drawLock(ctx, x + 64, ry + 37, 'rgba(255,255,255,0.5)');
      outlined(ctx, c.joinText, x + 76, ry + 40, `italic bold 12px ${FONT}`, 'rgba(255,255,255,0.5)', 3);
    } else {
      const kw = keyCap(ctx, c.keyLabel, x + 56, ry + 40, left > 0 ? '#8a8a96' : '#ffd24a');
      outlined(ctx, c.ability.toUpperCase(), x + 62 + kw, ry + 40, `bold 12px ${FONT}`, '#ffffff', 3);
      ctx.textAlign = 'right';
      if (left > 0) {
        outlined(ctx, `${Math.ceil(left)}s`, x + w - 10, ry + 40, `bold 12px ${FONT}`, '#ffb03a', 3);
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 56, ry + 44, w - 66, 3);
        ctx.fillStyle = '#ffb03a'; ctx.fillRect(x + 56, ry + 44, (w - 66) * (1 - left / c.cooldown), 3);
      } else outlined(ctx, 'READY', x + w - 10, ry + 40, `bold 12px ${FONT}`, '#7dffb0', 3);
    }
    ry += rowH;
  }
  ctx.textAlign = 'left';
  return y + h;
}

/** Bottom right while driving: speed gauge, car name and class, condition, and the radio's station and song. */
export function drawVehiclePanel(ctx, g, W, H) {
  const v = g.player.vehicle;
  const w = 318, h = 156, x = W - w - 18, y = H - h - 16;
  panel(ctx, x, y, w, h, null, 0.74);
  const kmh = Math.round(Math.abs(v.forwardSpeed) * 3.6);
  const cx = x + 62, cy = y + 64, r = 44;
  ctx.save();
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.stroke();
  const frac = Math.min(1, kmh / 240);
  const grd = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  grd.addColorStop(0, '#36f2ff'); grd.addColorStop(1, '#ff3fa4');
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * frac); ctx.strokeStyle = grd; ctx.stroke();
  ctx.restore();
  ctx.textAlign = 'center';
  outlined(ctx, String(kmh), cx, cy + 10, `30px ${DISPLAY}`, '#ffffff');
  outlined(ctx, 'KM/H', cx, cy + 28, `bold 11px ${FONT}`, 'rgba(255,255,255,0.7)', 3);
  // name, class and condition
  const tx = x + 124;
  ctx.textAlign = 'left';
  outlined(ctx, v.spec.name.toUpperCase(), tx, y + 28, `16px ${DISPLAY}`, '#ffffff');
  outlined(ctx, v.spec.cls.toUpperCase() + (v.spec.police ? '  ·  SIREN [G]' : '') + (v.wasStolen ? '  ·  STOLEN' : ''), tx, y + 46, `bold 11px ${FONT}`, v.wasStolen ? '#ff9a9a' : 'rgba(255,255,255,0.65)', 3);
  const hpk = Math.max(0, v.health / v.spec.hp);
  const col = hpk > 0.6 ? '#57d36a' : hpk > 0.3 ? '#ffb03a' : '#ff4a4a';
  outlined(ctx, 'CONDITION', tx, y + 70, `bold 12px ${FONT}`, 'rgba(255,255,255,0.8)', 3);
  ctx.textAlign = 'right';
  outlined(ctx, `${Math.round(hpk * 100)}%`, x + w - 14, y + 70, `bold 14px ${FONT}`, col, 3);
  bar(ctx, tx, y + 78, x + w - 14 - tx, 8, hpk, col);
  if (v.state === 'burning') { ctx.textAlign = 'left'; outlined(ctx, 'ON FIRE — GET OUT!', tx, y + 102, `bold 13px ${FONT}`, Math.floor(g.time * 5) % 2 ? '#ff4a4a' : '#ffd24a', 3); }
  // radio
  const np = g.radio.nowPlaying;
  const ry = y + 120;
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x + 10, ry - 6, w - 20, 38);
  ctx.textAlign = 'left';
  if (np) {
    drawNote(ctx, x + 24, ry + 12, '#ff6ac1');
    outlined(ctx, np.station.name, x + 40, ry + 9, `bold 13px ${FONT}`, '#ff6ac1', 3);
    outlined(ctx, `${np.song.title} — ${np.song.artist}`, x + 40, ry + 26, `italic bold 12px ${FONT}`, '#ffffff', 3);
    ctx.textAlign = 'right';
    outlined(ctx, 'N / B', x + w - 16, ry + 9, `bold 10px ${FONT}`, 'rgba(255,255,255,0.5)', 3);
  } else outlined(ctx, v.spec.police ? 'POLICE BAND  ·  radio off' : 'RADIO OFF  ·  press N', x + 24, ry + 18, `bold 13px ${FONT}`, 'rgba(255,255,255,0.6)', 3);
  ctx.textAlign = 'left';
  return y;
}

/** "Now playing" card when the station or song changes. */
export function drawSongCard(ctx, card, xr, y) {
  const w = 270, x = xr - w;
  ctx.save(); ctx.globalAlpha = Math.min(1, card.t);
  panel(ctx, x, y, w, 52, '#ff6ac1', 0.8);
  drawNote(ctx, x + 22, y + 32, '#ff6ac1');
  ctx.textAlign = 'left';
  outlined(ctx, card.station, x + 40, y + 21, `14px ${DISPLAY}`, '#ff6ac1', 3);
  outlined(ctx, card.line, x + 40, y + 40, `italic bold 12px ${FONT}`, '#ffffff', 3);
  ctx.restore();
}

function drawNote(ctx, x, y, color) {
  ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(x - 4, y + 4, 4.5, 3.5, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 7, y + 1, 4.5, 3.5, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0 + x, y + 4); ctx.lineTo(x, y - 11); ctx.lineTo(x + 11, y - 14); ctx.lineTo(x + 11, y + 1); ctx.stroke();
  ctx.restore();
}

/** Under the minimap: labelled health and armour bars. */
export function drawVitals(ctx, p, x, y, w) {
  const half = (w - 8) / 2;
  const hp = Math.max(0, Math.round(p.hp)), ar = Math.max(0, Math.round(p.armor));
  bar(ctx, x, y + 12, half, 10, p.hp / p.maxHp, p.hp < 30 ? '#ff4a4a' : '#57d36a');
  bar(ctx, x + half + 8, y + 12, half, 10, p.armor / 100, '#4a8cff');
  ctx.textAlign = 'left';
  drawHeart(ctx, x + 6, y + 4, p.hp < 30 ? '#ff4a4a' : '#57d36a');
  outlined(ctx, `HEALTH ${hp}`, x + 16, y + 8, `bold 12px ${FONT}`, '#ffffff', 3);
  outlined(ctx, `ARMOR ${ar}`, x + half + 8, y + 8, `bold 12px ${FONT}`, '#9fc0ff', 3);
}

function drawHeart(ctx, x, y, color) {
  ctx.save(); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x, y + 4);
  ctx.bezierCurveTo(x - 6, y - 1, x - 3, y - 6, x, y - 2.5);
  ctx.bezierCurveTo(x + 3, y - 6, x + 6, y - 1, x, y + 4);
  ctx.fill(); ctx.restore();
}
