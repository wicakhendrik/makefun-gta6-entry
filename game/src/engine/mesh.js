// CPU-side mesh builder: boxes, cylinders, cones and quads with per-vertex color/material, under a movable transform.

import { VERTEX_FLOATS } from './gl.js';

export const MAT = {
  MATTE: 0, PAINT: 1, EMISSIVE: 2, FACADE: 3, WATER: 4, GLASS: 5, ASPHALT: 6, NEON: 7, FOLIAGE: 8, SAND: 9,
  TOWER: 10, RIBBON: 11,
};

export class MeshBuilder {
  constructor() {
    this.v = [];
    this.i = [];
    this.tx = 0; this.ty = 0; this.tz = 0;
    this.c = 1; this.s = 0;
  }

  /** Subsequent shapes are placed in a frame translated to (x,y,z) and turned by yaw about Y. */
  at(x, y, z, yaw = 0) {
    this.tx = x; this.ty = y; this.tz = z;
    this.c = Math.cos(yaw); this.s = Math.sin(yaw);
    return this;
  }

  vertex(x, y, z, nx, ny, nz, col, mat, anim) {
    const c = this.c, s = this.s;
    this.v.push(
      this.tx + x * c + z * s, this.ty + y, this.tz - x * s + z * c,
      nx * c + nz * s, ny, -nx * s + nz * c,
      col[0], col[1], col[2], mat, anim,
    );
    return this.v.length / VERTEX_FLOATS - 1;
  }

  /** Quad from four corners in counter-clockwise order seen from the front. */
  quad(p0, p1, p2, p3, n, col, mat = 0, anim = 0) {
    const a = this.vertex(p0[0], p0[1], p0[2], n[0], n[1], n[2], col, mat, anim);
    this.vertex(p1[0], p1[1], p1[2], n[0], n[1], n[2], col, mat, anim);
    this.vertex(p2[0], p2[1], p2[2], n[0], n[1], n[2], col, mat, anim);
    this.vertex(p3[0], p3[1], p3[2], n[0], n[1], n[2], col, mat, anim);
    this.i.push(a, a + 1, a + 2, a, a + 2, a + 3);
  }

  /** Quad whose normal is computed from its corners (for slopes such as roofs and fronds). */
  quadN(p0, p1, p2, p3, col, mat = 0, twoSided = false) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.quad(p0, p1, p2, p3, [nx, ny, nz], col, mat);
    if (twoSided) this.quad(p3, p2, p1, p0, [-nx, -ny, -nz], col, mat);
  }

  /** Flat horizontal rectangle at height y. */
  plane(x0, z0, x1, z1, y, col, mat = 0) {
    this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], col, mat);
  }

  /** Axis-aligned box given its min corner (x0,y0,z0) and max corner (x1,y1,z1). opts.top / opts.sides override colors. */
  box(x0, y0, z0, x1, y1, z1, col, mat = 0, opts = {}) {
    const anim = opts.anim || 0;
    const top = opts.top || col, topMat = opts.topMat ?? mat;
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], top, topMat, anim);
    if (!opts.noBottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], col, mat, anim);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], col, mat, anim);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], col, mat, anim);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], col, mat, anim);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], col, mat, anim);
  }

  /** Box centred on (cx, cz) with its base at y0. */
  cbox(cx, y0, cz, w, h, d, col, mat = 0, opts) {
    this.box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, col, mat, opts);
  }

  /** Vertical cylinder (or cone when r1 differs) with its base centre at (cx, y0, cz). */
  cylinder(cx, y0, cz, r0, r1, h, seg, col, mat = 0, capTop = true) {
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const nm = [(c0 + c1) / 2, (r0 - r1) / h * 0.5, (s0 + s1) / 2];
      this.quad([cx + c0 * r0, y0, cz + s0 * r0], [cx + c0 * r1, y0 + h, cz + s0 * r1], [cx + c1 * r1, y0 + h, cz + s1 * r1], [cx + c1 * r0, y0, cz + s1 * r0], nm, col, mat);
      if (capTop && r1 > 0.001) {
        const a = this.vertex(cx, y0 + h, cz, 0, 1, 0, col, mat, 0);
        this.vertex(cx + c1 * r1, y0 + h, cz + s1 * r1, 0, 1, 0, col, mat, 0);
        this.vertex(cx + c0 * r1, y0 + h, cz + s0 * r1, 0, 1, 0, col, mat, 0);
        this.i.push(a, a + 1, a + 2);
      }
    }
  }

  /** Cylinder lying along the local X axis (wheels). */
  wheel(cx, cy, cz, r, w, seg, col, mat = 0) {
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const y0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, y1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
      const ny = (Math.cos(a0) + Math.cos(a1)) / 2, nz = (Math.sin(a0) + Math.sin(a1)) / 2;
      this.quad([cx - w / 2, cy + y0, cz + z0], [cx - w / 2, cy + y1, cz + z1], [cx + w / 2, cy + y1, cz + z1], [cx + w / 2, cy + y0, cz + z0], [0, ny, nz], col, mat);
      for (const side of [-1, 1]) {
        const a = this.vertex(cx + side * w / 2, cy, cz, side, 0, 0, col, mat, 0);
        this.vertex(cx + side * w / 2, cy + y0, cz + z0, side, 0, 0, col, mat, 0);
        this.vertex(cx + side * w / 2, cy + y1, cz + z1, side, 0, 0, col, mat, 0);
        if (side > 0) this.i.push(a, a + 1, a + 2); else this.i.push(a, a + 2, a + 1);
      }
    }
  }

  /** Sloped quad strip used for wedge shapes such as windscreens and roofs. */
  wedge(x0, x1, yb, yt, zb, zt, col, mat) {
    const dz = zt - zb, dy = yt - yb, len = Math.hypot(dz, dy) || 1;
    const n = [0, Math.abs(dz) / len, -Math.sign(dz) * Math.abs(dy) / len];
    if (dz > 0) this.quad([x1, yb, zb], [x0, yb, zb], [x0, yt, zt], [x1, yt, zt], [0, n[1], -n[2]], col, mat);
    else this.quad([x0, yb, zb], [x1, yb, zb], [x1, yt, zt], [x0, yt, zt], [0, n[1], -n[2]], col, mat);
  }

  get vertexCount() { return this.v.length / VERTEX_FLOATS; }

  build() {
    return { vertices: new Float32Array(this.v), indices: new Uint32Array(this.i) };
  }
}
