// Police roadblocks: from two stars, dispatch parks interceptors across the road a few junctions ahead of a
// fleeing driver, with officers holding position behind them.

import { Vehicle } from '../entities/vehicles.js';
import { Human } from '../entities/humans.js';
import { nearestNode, nodeValid, nodePos, DIRS, dirOfHeading, rightOfDir, headingOfDir } from '../world/roads.js';
import { ROAD, DISTRICTS, districtAt } from '../world/city.js';

const COP_SHIRT = [0.12, 0.17, 0.32];

export class RoadblockPlanner {
  constructor(police) {
    this.police = police;
    this.game = police.game;
    this.timer = 6;
    this.active = [];
  }

  clear() {
    for (const b of this.active) for (const v of b.cars) if (v.ai && v.ai.kind === 'roadblock') { v.ai = { kind: 'parked' }; v.sirenOn = false; }
    this.active = [];
    this.timer = 8;
  }

  update(dt) {
    const g = this.game, pol = this.police, p = g.player;
    // forget roadblocks the suspect has left far behind (the cars despawn with distance)
    this.active = this.active.filter((b) => b.cars.some((v) => g.vehicles.includes(v)) && Math.hypot(b.x - p.x, b.z - p.z) < 320);
    if (pol.stars < 2 || !p.vehicle || pol.jam > 0) return;
    this.timer -= dt;
    if (this.timer > 0 || this.active.length >= Math.min(2, pol.stars - 1) || p.vehicle.speed < 8) return;
    this.timer = 16 - pol.stars * 1.5;
    this.placeAhead();
  }

  /** Walk the road grid ahead of the suspect's car and block the segment leading into the chosen junction. */
  placeAhead() {
    const g = this.game, p = g.player, v = p.vehicle;
    const d = dirOfHeading(v.heading);
    let [i, j] = nearestNode(p.x, p.z);
    for (let k = 0; k < 2; k++) {
      if (!nodeValid(i + DIRS[d][0], j + DIRS[d][1])) break;
      i += DIRS[d][0]; j += DIRS[d][1];
    }
    const [nx, nz] = nodePos(i, j);
    const f = DIRS[d], r = rightOfDir(d);
    const cx = nx - f[0] * (ROAD / 2 + 9), cz = nz - f[1] * (ROAD / 2 + 9);
    const dist = Math.hypot(cx - p.x, cz - p.z);
    const ahead = (cx - p.x) * f[0] + (cz - p.z) * f[1];
    if (dist < 70 || ahead < 50) return null;
    return this.place(cx, cz, d, r);
  }

  /** Two interceptors parked across both lanes, sirens on, an officer behind each. */
  place(cx, cz, d, r) {
    const g = this.game, pol = this.police;
    const across = headingOfDir((d + 1) % 4);
    const block = { x: cx, z: cz, cars: [], cops: [] };
    // clear civilian traffic out of the way
    for (const v of g.vehicles) if (v.ai && v.ai.kind === 'traffic' && Math.hypot(v.x - cx, v.z - cz) < 12) v.dead = true;
    g.vehicles = g.vehicles.filter((v) => !v.dead);
    for (const side of [-1, 1]) {
      const x = cx + r[0] * side * 3.3, z = cz + r[1] * side * 3.3;
      const car = new Vehicle('interceptor', x, z, across + (side < 0 ? Math.PI : 0) + (Math.random() - 0.5) * 0.25);
      car.ai = { kind: 'roadblock' };
      car.callsign = pol.nextCallsign();
      car.sirenOn = true;
      car.input.handbrake = true;
      g.vehicles.push(car);
      block.cars.push(car);
      const f = DIRS[d];
      const cop = new Human('cop', x + f[0] * 3.2, z + f[1] * 3.2, 0, COP_SHIRT);
      cop.weapon = pol.stars >= 4 ? 'smg' : 'pistol';
      cop.ai = { mode: 'chase', burst: 0, strafe: side, hold: true };
      g.humans.push(cop);
      block.cops.push(cop);
    }
    this.active.push(block);
    const dn = districtAt(cx, cz);
    pol.radio(`${block.cars[0].callsign}, roadblock set in ${dn && DISTRICTS[dn] ? DISTRICTS[dn].name : 'the grid'}. Box him in.`);
    return block;
  }
}
