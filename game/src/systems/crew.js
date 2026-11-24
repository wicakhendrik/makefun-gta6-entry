// Crew and respect: three crew members with hotkey abilities on cooldowns, and a street rank earned from what you do.

import { STAR_HEAT } from './police.js';
import { WEAPONS } from '../combat/combat.js';

export const CREW = [
  {
    id: 'lou', key: 'KeyZ', keyLabel: 'Z', name: 'Lou', ability: 'PIT CREW', desc: 'Patch up your car', cooldown: 45,
    portrait: 'LOU',
    use(g) {
      const v = g.player.vehicle;
      if (!v || v.state !== 'ok') return 'Lou can only fix a car you are driving.';
      if (v.health >= v.spec.hp * 0.98) return 'The car is already in one piece.';
      v.health = Math.min(v.spec.hp, v.health + v.spec.hp * 0.5);
      g.fx.sparks(v.x, 1, v.z, 14);
      return { ok: true, line: 'Duct tape and prayer, mijo. Fifty percent, no more.' };
    },
  },
  {
    id: 'teo', key: 'KeyX', keyLabel: 'X', name: 'Teo', ability: 'BRIBE DESK', desc: '$500: drop a star', cooldown: 60, cost: 500,
    portrait: 'TEO',
    use(g) {
      const pol = g.police;
      if (pol.stars === 0) return 'Teo: nobody is looking for you, amigo.';
      if (g.money < 500) return 'Teo wants $500 up front.';
      g.money -= 500;
      const s = pol.stars - 1;
      pol.heat = s > 0 ? STAR_HEAT[s - 1] + 0.1 : 0;
      pol.stars = s;
      pol.unseen = Math.max(pol.unseen, 2);
      if (s === 0) { pol.clear(); g.events.emit('wantedLost'); }
      return { ok: true, line: 'A sergeant just lost your file. Drive casual.' };
    },
  },
  {
    id: 'nyla', key: 'KeyC', keyLabel: 'C', name: 'Nyla', ability: 'SUPPLY DROP', desc: 'Armor and ammo', cooldown: 75,
    portrait: 'NYLA',
    use(g) {
      const p = g.player;
      const owned = [...p.weapons].filter((w) => !WEAPONS[w].melee);
      if (p.armor >= 99 && !owned.length) return 'Nyla: you are already kitted out.';
      p.armor = Math.min(100, p.armor + 50);
      const w = !WEAPONS[p.weapon].melee ? p.weapon : owned[0];
      if (w) p.ammo[w] = (p.ammo[w] || 0) + WEAPONS[w].ammoPack;
      return { ok: true, line: 'Bag is under the bench. Vest, rounds, gum. Go.' };
    },
  },
];

export const RANKS = [
  { at: 0, name: 'Street Rat' },
  { at: 600, name: 'Wheelman' },
  { at: 1800, name: 'Hustler' },
  { at: 4000, name: 'Enforcer' },
  { at: 7500, name: 'Shot Caller' },
  { at: 12000, name: 'Island Boss' },
];

export class CrewSystem {
  constructor(game) {
    this.game = game;
    this.cool = {};
    this.flash = {};
    this.bonus = 0;
  }

  reset() { this.cool = {}; this.flash = {}; }

  update(dt) {
    const g = this.game;
    for (const k of Object.keys(this.cool)) this.cool[k] = Math.max(0, this.cool[k] - dt);
    for (const k of Object.keys(this.flash)) this.flash[k] = Math.max(0, this.flash[k] - dt);
    if (g.state !== 'playing' || !g.player.alive) return;
    for (const c of CREW) if (g.input.pressed(c.key)) this.use(c.id);
  }

  /** Call in a crew member. Returns true when the ability fired. */
  use(id) {
    const g = this.game, c = CREW.find((m) => m.id === id);
    if (!c) return false;
    if (this.cool[id] > 0) { g.hud.toast(`${c.name} is busy for ${Math.ceil(this.cool[id])}s`); g.audio.ui('back'); return false; }
    const r = c.use(g);
    if (typeof r === 'string') { g.hud.toast(r); g.audio.ui('back'); return false; }
    this.cool[id] = c.cooldown;
    this.flash[id] = 1.5;
    g.audio.ui('select');
    g.hud.queueDialogue([{ who: c.portrait, text: r.line }]);
    return true;
  }

  /** Respect: earned from story missions, jobs, wheels and fights. */
  get respect() {
    const g = this.game, s = g.stats;
    return Math.round(g.missions.done.size * 650 + s.kills * 12 + s.stolen * 25 + s.wrecked * 15 + s.driven / 40 + g.activities.tokens.size * 80 + (g.taxi.earned || 0) / 10 + this.bonus);
  }

  rank() {
    const rp = this.respect;
    let k = 0;
    while (k + 1 < RANKS.length && rp >= RANKS[k + 1].at) k++;
    const cur = RANKS[k], next = RANKS[k + 1];
    return { level: k + 1, name: cur.name, rp, from: cur.at, to: next ? next.at : cur.at, frac: next ? (rp - cur.at) / (next.at - cur.at) : 1 };
  }
}
