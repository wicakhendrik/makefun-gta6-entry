// Marco's crew: three specialists who join as the story moves on, each with an ability on a hotkey and a cooldown.

import { WEAPONS } from '../combat/combat.js';

export const CREW = [
  {
    id: 'nina', name: 'Nina Ortiz', nick: 'WRENCH', role: 'Mechanic', key: 'KeyZ', keyLabel: 'Z', ability: 'Field Repair',
    cooldown: 45, joins: null, joinText: '',
    use(g) {
      const v = g.player.vehicle;
      if (!v) return 'Nina needs a car to work on.';
      v.health = Math.min(v.spec.hp, v.health + v.spec.hp * 0.6);
      if (v.state === 'burning') { v.state = 'ok'; v.burnTime = 0; }
      for (let k = 0; k < 10; k++) g.fx.sparks(v.x, 0.8, v.z, 2);
      return 'Nina patched the ' + v.spec.name + ' over the radio.';
    },
  },
  {
    id: 'dex', name: 'Dex Kahale', nick: 'STATIC', role: 'Hacker', key: 'KeyX', keyLabel: 'X', ability: 'Scanner Jam',
    cooldown: 80, joins: 'debt_collector', joinText: 'Joins after Debt Collector',
    use(g) {
      if (g.police.stars === 0) return 'No police on you — nothing to jam.';
      g.police.jam = 10;
      g.police.unseen = Math.max(g.police.unseen, 3);
      return 'Dex jammed the SPD band for 10 seconds.';
    },
  },
  {
    id: 'bea', name: 'Bea Moreno', nick: 'BRASS', role: 'Enforcer', key: 'KeyC', keyLabel: 'C', ability: 'Supply Drop',
    cooldown: 60, joins: 'pier9', joinText: 'Joins after Pier 9',
    use(g) {
      const p = g.player;
      let n = 0;
      for (const w of p.weapons) if (WEAPONS[w] && WEAPONS[w].ammoPack) { p.ammo[w] = (p.ammo[w] || 0) + WEAPONS[w].ammoPack; n++; }
      p.armor = Math.min(100, p.armor + 50);
      return n ? 'Bea dropped ammo for every gun and fresh armor.' : 'Bea dropped fresh armor.';
    },
  },
];

export class CrewSystem {
  constructor(game) {
    this.game = game;
    this.cool = {};
    for (const c of CREW) this.cool[c.id] = 0;
  }

  joined(c) { return !c.joins || this.game.missions.done.has(c.joins); }

  /** Seconds left before this member can help again (0 when ready). */
  cooldownLeft(c) { return Math.max(0, this.cool[c.id]); }

  update(dt) {
    const g = this.game;
    for (const c of CREW) if (this.cool[c.id] > 0) this.cool[c.id] -= dt;
    if (g.state !== 'playing' || !g.player.alive) return;
    for (const c of CREW) if (g.input.pressed(c.key)) this.call(c);
  }

  call(c) {
    const g = this.game;
    if (!this.joined(c)) { g.hud.toast(`${c.name}: ${c.joinText.toLowerCase()}`); return false; }
    if (this.cool[c.id] > 0) { g.hud.toast(`${c.nick} is busy — ${Math.ceil(this.cool[c.id])}s`); g.audio.dryFire(); return false; }
    const msg = c.use(g);
    const worked = !/needs|nothing/.test(msg);
    g.hud.toast(msg);
    if (worked) {
      this.cool[c.id] = c.cooldown;
      g.audio.crewCall();
      g.hud.crewFlash = { id: c.id, t: 1.2 };
      g.events.emit('crewAbility', c);
    }
    return worked;
  }
}
