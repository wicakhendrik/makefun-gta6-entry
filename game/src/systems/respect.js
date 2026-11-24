// Street respect: points for jobs, fights, escapes and fares; ranks from Nobody to Legend of Port Solara.

export const RANKS = ['Nobody', 'Street Rat', 'Wheelman', 'Hustler', 'Fixer', 'Enforcer', 'Lieutenant', 'Heavy', 'Kingpin', 'Legend'];

/** Total respect needed to reach rank index n (rank 1 is free). */
export const rankThreshold = (n) => 150 * n * (n + 1) / 2;

export class RespectSystem {
  constructor(game) {
    this.game = game;
    this.points = 0;
    const ev = game.events;
    ev.on('missionPassed', (def) => this.add(Math.round(def.reward / 4), def.title));
    ev.on('humanKilled', (h, a) => { if (a && a.isPlayer && (h.role === 'goon' || h.role === 'boss')) this.add(h.role === 'boss' ? 120 : 15); });
    ev.on('wantedLost', () => this.add(30 * Math.max(1, this.lastStars || 1), 'Escape'));
    ev.on('wantedUp', (n) => { this.lastStars = n; });
    ev.on('raceWon', () => this.add(150, 'Race'));
    ev.on('taxiFare', () => this.add(25));
    ev.on('carjack', () => this.add(5));
    ev.on('carExported', (v) => this.add(Math.round(v.spec.value / 25), 'Export'));
  }

  get rank() {
    let n = 0;
    while (n < RANKS.length - 1 && this.points >= rankThreshold(n + 1)) n++;
    return n;
  }

  get rankName() { return RANKS[this.rank]; }

  /** Progress inside the current rank as [have, need]. */
  progress() {
    const n = this.rank;
    if (n >= RANKS.length - 1) return [1, 1];
    const lo = rankThreshold(n), hi = rankThreshold(n + 1);
    return [this.points - lo, hi - lo];
  }

  add(n, why) {
    if (!n) return;
    const before = this.rank;
    this.points += n;
    const hud = this.game.hud;
    if (hud) hud.respectGain = { n, t: 2 };
    if (this.rank > before && hud) {
      hud.bigMessage('RANK UP', `Rank ${this.rank + 1} · ${this.rankName}`, '#7dffb0');
      this.game.audio.rankUp();
    }
  }
}
