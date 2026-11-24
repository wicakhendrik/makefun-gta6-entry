// Static collision: a spatial hash of axis-aligned rectangles (buildings, walls, containers) with circle and ray queries.

const CELL = 20;

export class CollisionWorld {
  constructor(rects) {
    this.rects = rects;
    this.cells = new Map();
    this.stamp = 0;
    rects.forEach((r, idx) => {
      r.id = idx; r.mark = 0;
      for (let cx = Math.floor(r.x0 / CELL); cx <= Math.floor(r.x1 / CELL); cx++) {
        for (let cz = Math.floor(r.z0 / CELL); cz <= Math.floor(r.z1 / CELL); cz++) {
          const k = cx * 4096 + cz;
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(r);
        }
      }
    });
  }

  /** Rectangles overlapping the square around (x, z) with half-size r. */
  query(x, z, r, out = []) {
    out.length = 0;
    const s = ++this.stamp;
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
        const list = this.cells.get(cx * 4096 + cz);
        if (!list) continue;
        for (const rect of list) if (rect.mark !== s) { rect.mark = s; out.push(rect); }
      }
    }
    return out;
  }

  /**
   * Push a circle out of every rectangle it overlaps. Returns the total push and the last contact normal,
   * or null when the circle is free.
   */
  resolveCircle(x, z, radius) {
    const rects = this.query(x, z, radius + 1, this._tmp || (this._tmp = []));
    let px = 0, pz = 0, nx = 0, nz = 0, hit = false;
    for (const r of rects) {
      const cx = Math.max(r.x0, Math.min(x + px, r.x1));
      const cz = Math.max(r.z0, Math.min(z + pz, r.z1));
      let dx = x + px - cx, dz = z + pz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = radius - d;
        dx /= d; dz /= d;
        px += dx * push; pz += dz * push; nx = dx; nz = dz;
      } else {
        // centre inside the rectangle: leave by the nearest edge
        const ox = x + px, oz = z + pz;
        const opts = [[ox - r.x0 + radius, -1, 0], [r.x1 - ox + radius, 1, 0], [oz - r.z0 + radius, 0, -1], [r.z1 - oz + radius, 0, 1]];
        opts.sort((a, b) => a[0] - b[0]);
        px += opts[0][1] * opts[0][0]; pz += opts[0][2] * opts[0][0]; nx = opts[0][1]; nz = opts[0][2];
      }
    }
    return hit ? { px, pz, nx, nz } : null;
  }

  pointBlocked(x, z, y = 1) {
    const rects = this.query(x, z, 0.5, this._tmp2 || (this._tmp2 = []));
    for (const r of rects) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && y <= r.h) return true;
    return false;
  }

  /** Distance along a 3D ray (unit direction) to the first rectangle prism it enters, or maxDist. */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist;
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    const minX = Math.min(ox, ex), maxX = Math.max(ox, ex), minZ = Math.min(oz, ez), maxZ = Math.max(oz, ez);
    const s = ++this.stamp;
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
        const list = this.cells.get(cx * 4096 + cz);
        if (!list) continue;
        for (const r of list) {
          if (r.mark === s) continue;
          r.mark = s;
          const t = rayBox(ox, oy, oz, dx, dy, dz, r.x0, 0, r.z0, r.x1, r.h, r.z1);
          if (t >= 0 && t < best) best = t;
        }
      }
    }
    if (dy < 0) { const tg = -oy / dy; if (tg >= 0 && tg < best) best = tg; }
    return best;
  }

  /** True when nothing solid lies between two points. */
  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    return this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len) >= len - 0.05;
  }
}

/** Slab test: entry distance of a ray into a box, or -1. */
export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity;
  const axes = [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return -1; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0;
}
