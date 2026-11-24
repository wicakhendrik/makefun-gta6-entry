// Frame renderer: queues mesh draws, renders the sun shadow map, the sky, the lit world and billboard particles.

import { createContext, createProgram, createMesh, drawMesh, createShadowTarget } from './gl.js';
import { WORLD_VS, WORLD_FS, DEPTH_FS, SKY_VS, SKY_FS, PARTICLE_VS, PARTICLE_FS, MAX_LIGHTS } from './shaders.js';
import { mat4, perspective, lookAt, multiply, invert, ortho } from './math.js';

const SHADOW_SIZE = 2048;
const SHADOW_HALF = 110;
const PARTICLE_FLOATS = 9;
const MAX_PARTICLE_VERTS = 24000;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = (this.gl = createContext(canvas));
    this.world = createProgram(gl, WORLD_VS, WORLD_FS);
    this.depth = createProgram(gl, WORLD_VS, DEPTH_FS);
    this.sky = createProgram(gl, SKY_VS, SKY_FS, []);
    this.particles = createProgram(gl, PARTICLE_VS, PARTICLE_FS, ['aPos', 'aColor', 'aUv']);
    this.shadow = createShadowTarget(gl, SHADOW_SIZE);
    this.skyVao = gl.createVertexArray();
    this.view = mat4(); this.proj = mat4(); this.viewProj = mat4(); this.invViewProj = mat4();
    this.lightView = mat4(); this.lightProj = mat4(); this.lightViewProj = mat4(); this.shadowMat = mat4();
    this.queue = [];
    this.pool = [];
    this.lights = [];
    this.lightPos = new Float32Array(MAX_LIGHTS * 4);
    this.lightCol = new Float32Array(MAX_LIGHTS * 3);
    this.camPos = [0, 10, 0];
    this.flash = 0;
    this.initParticles();
  }

  initParticles() {
    const gl = this.gl;
    this.pVao = gl.createVertexArray();
    gl.bindVertexArray(this.pVao);
    this.pVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pVbo);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_PARTICLE_VERTS * PARTICLE_FLOATS * 4, gl.DYNAMIC_DRAW);
    const stride = PARTICLE_FLOATS * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 28);
    gl.bindVertexArray(null);
    this.pData = new Float32Array(MAX_PARTICLE_VERTS * PARTICLE_FLOATS);
    this.pCount = 0;
  }

  upload(built) { return createMesh(this.gl, built.vertices, built.indices); }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.floor(this.canvas.clientWidth * dpr), h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  setCamera(eye, target, fov) {
    this.camPos = eye;
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    perspective(this.proj, fov, aspect, 0.3, 1400);
    lookAt(this.view, eye, target, [0, 1, 0]);
    multiply(this.viewProj, this.proj, this.view);
    invert(this.invViewProj, this.viewProj);
  }

  /** Fit the sun's orthographic shadow frustum around a focus point. */
  setShadowFocus(fx, fz, sunDir) {
    const snap = (SHADOW_HALF * 2) / SHADOW_SIZE * 4;
    const cx = Math.round(fx / snap) * snap, cz = Math.round(fz / snap) * snap;
    const eye = [cx + sunDir[0] * 400, sunDir[1] * 400, cz + sunDir[2] * 400];
    lookAt(this.lightView, eye, [cx, 0, cz], Math.abs(sunDir[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0]);
    ortho(this.lightProj, -SHADOW_HALF, SHADOW_HALF, -SHADOW_HALF, SHADOW_HALF, 10, 900);
    multiply(this.lightViewProj, this.lightProj, this.lightView);
    const bias = new Float32Array([0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0.5, 0.5, 0.5, 1]);
    multiply(this.shadowMat, bias, this.lightViewProj);
  }

  /** Queue a mesh for this frame. model is copied, so callers may reuse their matrix. */
  draw(mesh, model, tint = null, swing = 0, shadow = true) {
    let item = this.pool.pop();
    if (!item) item = { model: new Float32Array(16), tint: new Float32Array(3) };
    item.mesh = mesh;
    item.model.set(model);
    if (tint) item.tint.set(tint); else item.tint.fill(1);
    item.swing = swing;
    item.shadow = shadow;
    this.queue.push(item);
  }

  addLight(x, y, z, radius, r, g, b) {
    if (this.lights.length < MAX_LIGHTS) this.lights.push([x, y, z, radius, r, g, b]);
  }

  /** Billboard quad facing the camera. right/up are the camera basis vectors. */
  billboard(x, y, z, size, r, g, b, a, right, up) {
    if (this.pCount + 6 > MAX_PARTICLE_VERTS) return;
    const rx = right[0] * size, ry = right[1] * size, rz = right[2] * size;
    const ux = up[0] * size, uy = up[1] * size, uz = up[2] * size;
    this.pushParticleQuad(
      [x - rx - ux, y - ry - uy, z - rz - uz], [x + rx - ux, y + ry - uy, z + rz - uz],
      [x + rx + ux, y + ry + uy, z + rz + uz], [x - rx + ux, y - ry + uy, z - rz + uz], r, g, b, a, false);
  }

  /** Thin glowing streak from (ax..) to (bx..), used for tracers and light trails. */
  streak(ax, ay, az, bx, by, bz, width, r, g, b, a) {
    if (this.pCount + 6 > MAX_PARTICLE_VERTS) return;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const cx = this.camPos[0] - ax, cy = this.camPos[1] - ay, cz = this.camPos[2] - az;
    let sx = dy * cz - dz * cy, sy = dz * cx - dx * cz, sz = dx * cy - dy * cx;
    const l = Math.hypot(sx, sy, sz) || 1; sx *= width / l; sy *= width / l; sz *= width / l;
    this.pushParticleQuad([ax - sx, ay - sy, az - sz], [bx - sx, by - sy, bz - sz], [bx + sx, by + sy, bz + sz], [ax + sx, ay + sy, az + sz], r, g, b, a, true);
  }

  /** Flat quad lying on the ground (skid marks, light pools, blood). */
  groundQuad(x, z, y, hw, hl, yaw, r, g, b, a) {
    if (this.pCount + 6 > MAX_PARTICLE_VERTS) return;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const fx = s * hl, fz = c * hl, rx = c * hw, rz = -s * hw;
    this.pushParticleQuad([x - rx - fx, y, z - rz - fz], [x + rx - fx, y, z + rz - fz], [x + rx + fx, y, z + rz + fz], [x - rx + fx, y, z - rz + fz], r, g, b, a, false);
  }

  pushParticleQuad(p0, p1, p2, p3, r, g, b, a, line) {
    const d = this.pData;
    const uv = line ? [[0, -1], [0, -1], [0, 1], [0, 1]] : [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const corners = [p0, p1, p2, p0, p2, p3];
    const uvs = [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]];
    for (let k = 0; k < 6; k++) {
      const o = this.pCount * PARTICLE_FLOATS, p = corners[k];
      d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2];
      d[o + 3] = r; d[o + 4] = g; d[o + 5] = b; d[o + 6] = a;
      d[o + 7] = uvs[k][0]; d[o + 8] = uvs[k][1];
      this.pCount++;
    }
  }

  setWorldUniforms(prog, env, time) {
    const gl = this.gl, u = prog.u;
    gl.uniform3fv(u.uSunDir, env.sunDir);
    gl.uniform3fv(u.uSunColor, env.sunColor);
    gl.uniform3fv(u.uSkyColor, env.skyAmbient);
    gl.uniform3fv(u.uGroundColor, env.groundAmbient);
    gl.uniform3fv(u.uFogColor, env.fogColor);
    gl.uniform3fv(u.uCamPos, this.camPos);
    gl.uniform1f(u.uFogDensity, env.fogDensity);
    gl.uniform1f(u.uNight, env.night);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uFlash, this.flash);
    gl.uniform1f(u.uShadowTexel, 1 / SHADOW_SIZE);
    gl.uniformMatrix4fv(u.uShadowMat, false, this.shadowMat);
    const n = this.lights.length;
    for (let k = 0; k < n; k++) {
      const L = this.lights[k];
      this.lightPos.set([L[0], L[1], L[2], L[3]], k * 4);
      this.lightCol.set([L[4], L[5], L[6]], k * 3);
    }
    gl.uniform4fv(u.uLightPos, this.lightPos);
    gl.uniform3fv(u.uLightColor, this.lightCol);
    gl.uniform1i(u.uLightCount, n);
  }

  render(env, time) {
    const gl = this.gl;
    // 1. shadow map
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadow.fbo);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.5, 3);
    gl.useProgram(this.depth.program);
    gl.uniformMatrix4fv(this.depth.u.uViewProj, false, this.lightViewProj);
    for (const item of this.queue) {
      if (!item.shadow) continue;
      gl.uniformMatrix4fv(this.depth.u.uModel, false, item.model);
      gl.uniform1f(this.depth.u.uSwing, item.swing);
      drawMesh(gl, item.mesh);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // 2. sky
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(env.fogColor[0], env.fogColor[1], env.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.depthMask(false);
    gl.useProgram(this.sky.program);
    const su = this.sky.u;
    gl.uniformMatrix4fv(su.uInvViewProj, false, this.invViewProj);
    gl.uniform3fv(su.uCamPos, this.camPos);
    gl.uniform3fv(su.uSunDir, env.sunDir);
    gl.uniform3fv(su.uSunColor, env.sunColor);
    gl.uniform3fv(su.uZenith, env.zenith);
    gl.uniform3fv(su.uHorizon, env.horizon);
    gl.uniform1f(su.uNight, env.night);
    gl.uniform1f(su.uTime, time);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);

    // 3. lit world
    gl.useProgram(this.world.program);
    this.setWorldUniforms(this.world, env, time);
    gl.uniformMatrix4fv(this.world.u.uViewProj, false, this.viewProj);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadow.tex);
    gl.uniform1i(this.world.u.uShadowMap, 0);
    const u = this.world.u;
    for (const item of this.queue) {
      gl.uniformMatrix4fv(u.uModel, false, item.model);
      gl.uniform3fv(u.uTint, item.tint);
      gl.uniform1f(u.uSwing, item.swing);
      drawMesh(gl, item.mesh);
    }

    // 4. particles, premultiplied alpha (alpha 0 = additive glow)
    if (this.pCount > 0) {
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.useProgram(this.particles.program);
      gl.uniformMatrix4fv(this.particles.u.uViewProj, false, this.viewProj);
      gl.bindVertexArray(this.pVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pData, 0, this.pCount * PARTICLE_FLOATS);
      gl.drawArrays(gl.TRIANGLES, 0, this.pCount);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);

    // recycle
    for (const item of this.queue) this.pool.push(item);
    this.queue.length = 0;
    this.lights.length = 0;
    this.pCount = 0;
  }

  /** Project a world point to canvas CSS pixels (null when behind the camera). */
  project(x, y, z, cssW, cssH) {
    const m = this.viewProj;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0.1) return null;
    const px = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    const py = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    return [(px * 0.5 + 0.5) * cssW, (0.5 - py * 0.5) * cssH, w];
  }
}
