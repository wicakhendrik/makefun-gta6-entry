// DOM menus: title screen, pause, map, stats, controls, settings, credits and the Bolt & Barrel gun shop.

import { SHOP_ITEMS, EXPORT_LIST, TOKEN_SPOTS, RACES } from '../story/activities.js';
import { STORY } from '../story/script.js';
import { WEAPONS } from '../combat/combat.js';
import { VEHICLE_TYPES } from '../entities/vehicles.js';

const CONTROLS = [
  ['W A S D', 'Move / drive'], ['Mouse', 'Look and aim'], ['Left click', 'Shoot / punch'], ['Right click', 'Aim down sights'],
  ['Shift', 'Sprint'], ['F or Enter', 'Steal / enter / exit a vehicle'], ['Space', 'Handbrake'], ['H', 'Horn'],
  ['Q / E / wheel / 1-7', 'Switch weapon (slots)'], ['R', 'Reload'], ['Z / X / C', 'Crew abilities'], ['E', 'Interact (shops, races, garage, save)'], ['N / B', 'Next / previous radio station'],
  ['G', 'Siren (police cars)'], ['M or Tab', 'Map'], ['Esc / P', 'Pause'],
];

export class MenuSystem {
  constructor(game) {
    this.game = game;
    this.root = document.createElement('div');
    this.root.id = 'menu';
    document.body.appendChild(this.root);
    this.screen = null;
    this.index = 0;
    this.items = [];
  }

  open(screen) {
    this.screen = screen;
    this.index = 0;
    this.root.style.display = 'flex';
    this.render();
    if (screen !== 'title') this.game.input.releaseLock();
  }

  close() {
    this.screen = null;
    this.root.style.display = 'none';
    this.root.innerHTML = '';
  }

  get isOpen() { return !!this.screen; }

  update() {
    if (!this.screen) return;
    const inp = this.game.input;
    if (this.screen === 'map') { this.drawMap(); }
    if (inp.pressed('ArrowDown') || inp.pressed('KeyS')) this.move(1);
    if (inp.pressed('ArrowUp') || inp.pressed('KeyW')) this.move(-1);
    if (inp.pressed('Enter') || inp.pressed('Space')) { const it = this.items[this.index]; if (it && it.action) { this.game.audio.ui('select'); it.action(); } }
    if (inp.pressed('Escape') || inp.pressed('Backspace')) this.back();
    if (this.screen === 'shop') for (let k = 1; k <= SHOP_ITEMS.length; k++) if (inp.pressed('Digit' + k)) this.buy(SHOP_ITEMS[k - 1]);
    if ((this.screen === 'map') && (inp.pressed('KeyM') || inp.pressed('Tab'))) this.back();
  }

  move(d) {
    if (!this.items.length) return;
    this.index = (this.index + d + this.items.length) % this.items.length;
    this.game.audio.ui('move');
    this.highlight();
  }

  back() {
    const g = this.game;
    g.audio.ui('back');
    if (this.screen === 'title') return;
    if (this.screen === 'pause' || this.screen === 'shop' || this.screen === 'map') { this.close(); g.resume(); return; }
    this.open(g.state === 'title' ? 'title' : 'pause');
  }

  highlight() {
    this.root.querySelectorAll('.item').forEach((el, k) => el.classList.toggle('on', k === this.index));
  }

  button(label, action, sub) {
    this.items.push({ label, action });
    const k = this.items.length - 1;
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `<span>${label}</span>${sub ? `<small>${sub}</small>` : ''}`;
    el.addEventListener('mouseenter', () => { this.index = k; this.highlight(); });
    el.addEventListener('click', () => { this.game.audio.unlock(); this.game.audio.ui('select'); action(); });
    return el;
  }

  render() {
    const g = this.game;
    this.items = [];
    this.root.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'panel ' + this.screen;
    const add = (html) => { const d = document.createElement('div'); d.innerHTML = html; panel.appendChild(d); return d; };
    const list = document.createElement('div'); list.className = 'list';

    if (this.screen === 'title') {
      panel.className = 'panel title';
      add(`<div class="logo"><span class="l1">SOLARA</span><span class="l2">HEAT</span></div><div class="tagline">Port Solara never sleeps.</div>`);
      if (g.hasSave()) list.appendChild(this.button('Continue', () => g.continueGame(), g.saveSummary()));
      list.appendChild(this.button('New Game', () => g.newGame()));
      list.appendChild(this.button('Controls', () => this.open('controls')));
      list.appendChild(this.button('Settings', () => this.open('settings')));
      list.appendChild(this.button('Credits', () => this.open('credits')));
      panel.appendChild(list);
      add(`<div class="foot">An original open-world crime story · keyboard &amp; mouse · click to capture the mouse</div>`);
    } else if (this.screen === 'pause') {
      add(`<h1>PAUSED</h1><div class="sub">${g.player.vehicle ? g.player.vehicle.spec.name + ' · ' : ''}$${g.money.toLocaleString()} · ${Math.round(g.missions.storyProgress * 100)}% story</div>`);
      list.appendChild(this.button('Resume', () => { this.close(); g.resume(); }));
      list.appendChild(this.button('Map', () => this.open('map')));
      list.appendChild(this.button('Save Game', () => { const ok = g.saveGame(false); g.hud.toast(ok ? 'Game saved' : 'Cannot save during a mission'); this.close(); g.resume(); }, g.missions.active ? 'not during missions' : 'quick save'));
      list.appendChild(this.button('Stats & Progress', () => this.open('stats')));
      list.appendChild(this.button('Controls', () => this.open('controls')));
      list.appendChild(this.button('Settings', () => this.open('settings')));
      list.appendChild(this.button('Quit to Title', () => { this.close(); g.toTitle(); }));
      panel.appendChild(list);
    } else if (this.screen === 'map') {
      panel.className = 'panel map';
      add(`<h1>PORT SOLARA</h1>`);
      const c = document.createElement('canvas'); c.id = 'fullmap'; panel.appendChild(c);
      add(`<div class="legend"><b style="color:#ffd24a">●</b> objective &nbsp; <b style="color:#ff6ac1">L</b><b style="color:#4ae4ff">T</b><b style="color:#8c9cff">M</b> contacts &nbsp; <b style="color:#9fe3c8">H</b> safehouse &nbsp; <b style="color:#ffae4a">$</b> Bolt &amp; Barrel &nbsp; <b style="color:#ff6ac1">G</b> Lou's garage &nbsp; <b style="color:#4ab8ff">◆</b> races &nbsp; <b style="color:#ff4a5a">■</b> hospital — Esc to close</div>`);
    } else if (this.screen === 'controls') {
      add(`<h1>CONTROLS</h1>`);
      add(`<table class="keys">${CONTROLS.map(([k, v]) => `<tr><td class="k">${k}</td><td>${v}</td></tr>`).join('')}</table>`);
      list.appendChild(this.button('Back', () => this.back()));
      panel.appendChild(list);
    } else if (this.screen === 'settings') {
      add(`<h1>SETTINGS</h1>`);
      const s = g.settings;
      const slider = (label, key, min, max, step) => {
        const d = add(`<label class="slider">${label}<input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}"></label>`);
        d.querySelector('input').addEventListener('input', (e) => { s[key] = +e.target.value; g.applySettings(); });
      };
      slider('Master volume', 'master', 0, 1, 0.05);
      slider('Music & radio', 'music', 0, 1, 0.05);
      slider('Effects', 'sfx', 0, 1, 0.05);
      slider('Mouse sensitivity', 'sensitivity', 0.3, 2.5, 0.1);
      list.appendChild(this.button('Back', () => { g.storeSettings(); this.back(); }));
      panel.appendChild(list);
    } else if (this.screen === 'stats') {
      add(`<h1>PROGRESS</h1>`);
      const st = g.stats, a = g.activities;
      const done = STORY.filter((m) => g.missions.done.has(m.id)).map((m) => m.title);
      add(`<table class="keys">
        <tr><td class="k">Story</td><td>${done.length}/${STORY.length} missions ${done.length ? '· ' + done.join(', ') : ''}</td></tr>
        <tr><td class="k">Cash</td><td>$${g.money.toLocaleString()}</td></tr>
        <tr><td class="k">Exports</td><td>${a.exported.size}/${EXPORT_LIST.length} · wanted: ${EXPORT_LIST.filter((t) => !a.exported.has(t)).map((t) => VEHICLE_TYPES[t].name).join(', ') || 'all delivered'}</td></tr>
        <tr><td class="k">Sun Tokens</td><td>${a.tokens.size}/${TOKEN_SPOTS.length}</td></tr>
        <tr><td class="k">Races</td><td>${RACES.map((r) => `${r.name}: ${a.bestTimes[r.id] ? a.bestTimes[r.id].toFixed(1) + 's' : '—'}`).join(' · ')}</td></tr>
        <tr><td class="k">Brisa Cab</td><td>best streak ${Math.max(g.taxi.best, g.taxi.streak)} fares</td></tr>
        <tr><td class="k">Weapons</td><td>${[...g.player.weapons].map((w) => WEAPONS[w].name).join(', ') || 'fists'}</td></tr>
        <tr><td class="k">Takedowns</td><td>${st.kills} · cars stolen ${st.stolen} · wrecked ${st.wrecked}</td></tr>
        <tr><td class="k">Distance</td><td>${(st.driven / 1000).toFixed(1)} km driven · ${(st.walked / 1000).toFixed(1)} km on foot</td></tr>
      </table>`);
      list.appendChild(this.button('Back', () => this.back()));
      panel.appendChild(list);
    } else if (this.screen === 'credits') {
      add(`<h1>SOLARA HEAT</h1><p class="credits">An original open-world crime game set in the fictional island city of Port Solara.<br>
        Every model, texture, sound, song and line of code is procedural and written for this game:<br>raw WebGL2 rendering, Web Audio synthesis, no libraries.<br><br>
        Story: Marco Vela, Lou Santi, Teo Bravo, Det. Ilsa Marr and Victor Crane are fictional characters.<br>Any resemblance to real people or other games is coincidental.</p>`);
      list.appendChild(this.button('Back', () => this.back()));
      panel.appendChild(list);
    } else if (this.screen === 'shop') {
      add(`<h1>BOLT &amp; BARREL</h1><div class="sub">Cash: $${g.money.toLocaleString()} · press 1-${SHOP_ITEMS.length} or click</div>`);
      SHOP_ITEMS.forEach((it, k) => {
        const owned = WEAPONS[it.id] && g.player.weapons.has(it.id);
        const price = owned ? it.ammo : it.price;
        const label = owned ? (WEAPONS[it.id].melee ? `${WEAPONS[it.id].name} (owned)` : `${WEAPONS[it.id].name} ammo`) : it.label;
        list.appendChild(this.button(`${k + 1}. ${label}`, () => this.buy(it), `$${price.toLocaleString()}`));
      });
      list.appendChild(this.button('Leave', () => this.back()));
      panel.appendChild(list);
    }
    this.root.appendChild(panel);
    this.highlight();
    if (this.screen === 'map') requestAnimationFrame(() => this.drawMap());
  }

  buy(item) {
    const g = this.game, p = g.player;
    const isWeapon = !!WEAPONS[item.id];
    const owned = isWeapon && p.weapons.has(item.id);
    const price = owned ? item.ammo : item.price;
    if (owned && WEAPONS[item.id].melee) { g.hud.toast('You already carry the ' + WEAPONS[item.id].name); return; }
    if (g.money < price) { g.audio.ui('back'); g.hud.toast('Not enough cash'); return; }
    g.money -= price;
    if (item.id === 'armor') p.armor = 100;
    else if (item.id === 'health') p.hp = p.maxHp;
    else { p.weapons.add(item.id); if (!WEAPONS[item.id].melee) p.ammo[item.id] = (p.ammo[item.id] || 0) + WEAPONS[item.id].ammoPack; if (!owned) p.weapon = item.id; }
    g.audio.ui('cash');
    g.hud.toast('Purchased: ' + (owned ? WEAPONS[item.id].name + ' ammo' : item.label));
    this.render();
  }

  drawMap() {
    const c = document.getElementById('fullmap');
    if (!c) return;
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    this.game.hud.minimap.drawFull(ctx, this.game, 0, 0, w, h, this.game.hud.collectBlips());
  }
}
