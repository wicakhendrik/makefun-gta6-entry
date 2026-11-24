// Civilian traffic: parked cars along the curbs, lane-following drivers that turn at junctions, brake and honk.

import { makeRng, clamp, wrapAngle, dist2 } from '../engine/math.js';
import { PITCH, ROAD } from '../world/city.js';
import { DIRS, lanePoint, nodePos, chooseNextDir, nodeValid, randomLaneSpot, nearestNode, dirOfHeading } from '../world/roads.js';
import { Vehicle, TRAFFIC_MIX, VEHICLE_TYPES } from '../entities/vehicles.js';
import { Human } from '../entities/humans.js';
import { SHIRTS } from '../entities/humanmodels.js';
import { hexColor } from '../engine/math.js';

export class TrafficSystem {
  constructor(game) {
    this.game = game;
    this.rng = makeRng(4242);
    this.maxCars = 28;
    this.spawnTimer = 0;
  }

  spawnParked() {
    const g = this.game;
    for (const spot of g.city.parking) {
      const type = this.rng.pick(['bayside', 'cub', 'riviera', 'ranchero', 'vanta', 'hauler', 'cub', 'bayside']);
      const v = new Vehicle(type, spot.x, spot.z, spot.heading, this.rng.pick(VEHICLE_TYPES[type].colors));
      v.parked = true;
      v.persistent = true;
      g.vehicles.push(v);
    }
  }

  makeDriver(v) {
    const looks = this.game.looks.civilians;
    const h = new Human('civ', v.x, v.z, this.rng.int(0, looks.length - 1), hexColor(this.rng.pick(SHIRTS)));
    h.vehicle = v;
    h.state = 'driving';
    v.driver = h;
    return h;
  }

  /** Put a new car with a driver on a lane somewhere around the player. */
  spawnCar(minD = 90, maxD = 230, typeKey = null) {
    const g = this.game, p = g.player;
    const spot = randomLaneSpot(this.rng, p.x, p.z, minD, maxD);
    if (!spot) return null;
    for (const o of g.vehicles) if (dist2(o.x, o.z, spot.x, spot.z) < 100) return null;
    const type = typeKey || this.rng.pick(TRAFFIC_MIX);
    const v = new Vehicle(type, spot.x, spot.z, spot.heading, this.rng.pick(VEHICLE_TYPES[type].colors));
    const sp = 9 + this.rng() * 4;
    v.vx = Math.sin(spot.heading) * sp; v.vz = Math.cos(spot.heading) * sp;
    v.ai = { kind: 'traffic', i: spot.i, j: spot.j, d: spot.d, next: chooseNextDir(spot.i + DIRS[spot.d][0], spot.j + DIRS[spot.d][1], spot.d, this.rng), cruise: 11 + this.rng() * 4, stuck: 0, ignore: 0, panic: 0 };
    this.makeDriver(v);
    g.vehicles.push(v);
    return v;
  }

  update(dt) {
    const g = this.game, p = g.player;
    // despawn distant cars that nobody cares about
    for (const v of g.vehicles) {
      if (v.persistent || v === p.vehicle) continue;
      const far = dist2(v.x, v.z, p.x, p.z) > 300 * 300;
      const oldWreck = v.state === 'wreck' && g.time - v.wreckTime > 45;
      if (far || oldWreck) v.dead = true;
    }
    g.vehicles = g.vehicles.filter((v) => !v.dead);
    let count = 0;
    for (const v of g.vehicles) if (v.ai && v.ai.kind === 'traffic') count++;
    this.spawnTimer -= dt;
    if (count < this.maxCars && this.spawnTimer <= 0) { this.spawnCar(); this.spawnTimer = 0.25; }

    for (const v of g.vehicles) {
      if (!v.ai || v.ai.kind !== 'traffic') continue;
      if (!v.driver || v.driver.state === 'dead' || v.state !== 'ok') { v.input.throttle = 0; v.input.handbrake = true; v.ai = null; continue; }
      followRoad(v, v.ai, dt, g, {
        cruise: v.ai.panic > 0 ? 24 : v.ai.cruise,
        chooseNext: (i, j, d) => chooseNextDir(i, j, d, this.rng),
        careful: v.ai.panic <= 0,
      });
      if (v.ai.panic > 0) v.ai.panic -= dt;
    }
  }

  /** Make drivers near a loud event floor it. */
  panicNear(x, z, radius) {
    for (const v of this.game.vehicles) {
      if (v.ai && v.ai.kind === 'traffic' && dist2(v.x, v.z, x, z) < radius * radius) v.ai.panic = 8;
    }
  }
}

/**
 * Drive a car along the right-hand lane of the road grid. ai holds the segment (i, j, d) and the
 * pre-chosen next direction. opts: cruise speed, chooseNext(i,j,d), careful (brake for obstacles).
 */
export function followRoad(v, ai, dt, g, opts, depth = 0) {
  if (!nodeValid(ai.i + DIRS[ai.d][0], ai.j + DIRS[ai.d][1])) {
    // re-snap onto the grid if the car was pushed somewhere odd
    const [i, j] = nearestNode(v.x, v.z);
    ai.i = i; ai.j = j; ai.d = dirOfHeading(v.heading);
    if (!nodeValid(i + DIRS[ai.d][0], j + DIRS[ai.d][1])) ai.d = (ai.d + 2) % 4;
    ai.next = opts.chooseNext(ai.i + DIRS[ai.d][0], ai.j + DIRS[ai.d][1], ai.d);
  }
  const f = DIRS[ai.d];
  const [ax, az] = nodePos(ai.i, ai.j);
  let along = (v.x - ax) * f[0] + (v.z - az) * f[1];
  if ((along > PITCH - 6 || along < -PITCH * 0.6) && depth < 3) {
    // passed the junction: move to the next segment
    if (along < -PITCH * 0.6) { const [i, j] = nearestNode(v.x, v.z); ai.i = i; ai.j = j; }
    else { ai.i += f[0]; ai.j += f[1]; ai.d = ai.next; }
    if (!nodeValid(ai.i + DIRS[ai.d][0], ai.j + DIRS[ai.d][1])) ai.d = (ai.d + 2) % 4;
    ai.next = opts.chooseNext(ai.i + DIRS[ai.d][0], ai.j + DIRS[ai.d][1], ai.d);
    return followRoad(v, ai, dt, g, opts, depth + 1);
  }
  const speed = v.forwardSpeed;
  const look = 6 + Math.max(0, speed) * 0.45;
  let tx, tz;
  const t = along + look;
  if (t > PITCH - ROAD / 2 + 1 && ai.next !== ai.d) {
    [tx, tz] = lanePoint(ai.i + f[0], ai.j + f[1], ai.next, Math.max(2, t - PITCH + 2));
  } else [tx, tz] = lanePoint(ai.i, ai.j, ai.d, t);
  const ang = wrapAngle(Math.atan2(tx - v.x, tz - v.z) - v.heading);
  v.input.steer = clamp(ang * 2.4, -1, 1);

  let want = opts.cruise;
  if (ai.next !== ai.d && along > PITCH - 34) want = Math.min(want, 7.5);
  if (Math.abs(ang) > 0.5) want = Math.min(want, 6);
  if (opts.careful) {
    const gap = obstacleAhead(v, g, 7 + Math.max(0, speed) * 1.25);
    if (gap !== null && ai.ignore <= 0) {
      want = Math.min(want, Math.max(0, (gap - 5) * 0.8));
      if (speed < 0.6) {
        ai.stuck += dt;
        if (ai.stuck > 2.5 && v.horn <= 0 && Math.random() < 0.02) { v.horn = 0.5; g.audio.horn(v.x, v.z); }
        if (ai.stuck > 5) { ai.ignore = 2.2; ai.stuck = 0; }
      }
    } else ai.stuck = 0;
    if (ai.ignore > 0) ai.ignore -= dt;
  }
  const diff = want - speed;
  v.input.throttle = clamp(diff * 0.4, -1, 1);
  v.input.handbrake = false;
}

/** Distance to the nearest car or person in the driving corridor ahead, or null. */
function obstacleAhead(v, g, range) {
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  let best = null;
  const test = (x, z, half) => {
    const dx = x - v.x, dz = z - v.z;
    const fwd = dx * fx + dz * fz;
    if (fwd < 1 || fwd > range) return;
    const lat = Math.abs(dx * -fz + dz * fx);
    if (lat < 1.6 + half && (best === null || fwd < best)) best = fwd;
  };
  for (const o of g.vehicles) {
    if (o === v) continue;
    if (Math.abs(o.x - v.x) > range + 3 || Math.abs(o.z - v.z) > range + 3) continue;
    // ignore cars driving straight at us from the other lane
    const same = Math.sin(o.heading) * fx + Math.cos(o.heading) * fz;
    if (same < -0.7 && o.speed > 1) continue;
    test(o.x, o.z, o.spec.wid / 2);
  }
  const p = g.player;
  if (!p.vehicle && p.alive) test(p.x, p.z, 0.4);
  for (const h of g.humans) {
    if (h.state === 'dead' || h.vehicle || h.isPlayer) continue;
    if (Math.abs(h.x - v.x) > range || Math.abs(h.z - v.z) > range) continue;
    test(h.x, h.z, 0.3);
  }
  return best;
}
