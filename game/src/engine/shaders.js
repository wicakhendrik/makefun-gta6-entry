// GLSL sources: lit world shader (sun + shadows + point lights + procedural facades/water), depth, sky, particles.

export const MAX_LIGHTS = 12;

export const WORLD_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in float aMat;
layout(location=4) in float aAnim;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat4 uShadowMat;
uniform vec3 uTint;
uniform float uSwing;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vColor;
out vec4 vShadow;
flat out float vMat;
void main() {
  vec3 p = aPos;
  vec3 n = aNormal;
  if (aAnim != 0.0) {
    // limb swing for walking humans: legs pivot at the hip, arms at the shoulder
    float isArm = step(1.5, abs(aAnim));
    float pivot = mix(0.92, 1.42, isArm);
    float ang = uSwing * sign(aAnim) * mix(1.0, -0.8, isArm);
    float c = cos(ang), s = sin(ang);
    p.y -= pivot;
    p = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
    p.y += pivot;
    n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
  }
  vec4 w = uModel * vec4(p, 1.0);
  vWorld = w.xyz;
  vNormal = mat3(uModel) * n;
  vColor = aMat == 1.0 ? aColor * uTint : aColor;
  vMat = aMat;
  vShadow = uShadowMat * w;
  gl_Position = uViewProj * w;
}`;

export const WORLD_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;
in vec4 vShadow;
flat in float vMat;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uFogColor;
uniform vec3 uCamPos;
uniform float uFogDensity;
uniform float uNight;
uniform float uTime;
uniform float uFlash;
uniform sampler2DShadow uShadowMap;
uniform float uShadowTexel;
uniform vec4 uLightPos[${MAX_LIGHTS}];
uniform vec3 uLightColor[${MAX_LIGHTS}];
uniform int uLightCount;
out vec4 fragColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float shadowAt(vec3 n) {
  vec3 p = vShadow.xyz / vShadow.w;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = 0.0012 + 0.002 * (1.0 - abs(dot(n, uSunDir)));
  float t = uShadowTexel;
  float s = texture(uShadowMap, vec3(p.xy + vec2(-t, -t), p.z - bias));
  s += texture(uShadowMap, vec3(p.xy + vec2(t, -t), p.z - bias));
  s += texture(uShadowMap, vec3(p.xy + vec2(-t, t), p.z - bias));
  s += texture(uShadowMap, vec3(p.xy + vec2(t, t), p.z - bias));
  return s * 0.25;
}

vec3 skyReflect(vec3 r) {
  float h = clamp(r.y, 0.0, 1.0);
  vec3 c = mix(uFogColor, uSkyColor, pow(h, 0.6));
  c += uSunColor * pow(max(dot(r, uSunDir), 0.0), 60.0) * 1.5;
  return c;
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 base = vColor;
  vec3 V = normalize(uCamPos - vWorld);
  float d = length(uCamPos - vWorld);
  float spec = 0.0, emit = 0.0, gloss = 16.0, reflectAmt = 0.0;
  vec3 emitColor = vec3(0.0);
  float m = vMat;

  if (m == 6.0) { // asphalt grain and wear
    float g = noise(vWorld.xz * 1.7) * 0.5 + noise(vWorld.xz * 0.13) * 0.5;
    base *= 0.82 + 0.3 * g;
    spec = 0.08; gloss = 8.0;
  } else if (m == 9.0) { // sand ripples
    base *= 0.9 + 0.12 * noise(vWorld.xz * vec2(0.9, 3.1)) + 0.05 * noise(vWorld.xz * 9.0);
  } else if (m == 8.0) { // foliage variation
    base *= 0.75 + 0.5 * noise(vWorld.xz * 0.35 + vWorld.y);
  } else if (m == 0.0 && n.y > 0.9) {
    base *= 0.92 + 0.12 * noise(vWorld.xz * 0.8);
  }

  if (m == 3.0 || m == 10.0 || m == 11.0) {
    if (abs(n.y) < 0.5) {
      float u = abs(n.x) > 0.5 ? vWorld.z : vWorld.x;
      float v = vWorld.y;
      vec2 cellSize = m == 10.0 ? vec2(2.0, 3.6) : vec2(3.2, 3.6);
      vec2 cell = vec2(u, v) / cellSize;
      vec2 f = fract(cell);
      vec2 id = floor(cell) + floor(vWorld.xz * 0.02) * 17.0;
      float win;
      if (m == 10.0) win = step(0.06, f.x) * step(0.08, f.y);
      else if (m == 11.0) {
        win = step(0.38, f.y) * step(f.y, 0.74) * step(0.08, fract(u / 6.0));
        // white deco trim under every window band
        if (f.y > 0.3 && f.y < 0.36) base = mix(base, vec3(0.97, 0.96, 0.92), 0.9);
      }
      else win = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.85);
      if (v < 1.0) win = 0.0;
      if (win > 0.5) {
        vec3 glass = m == 10.0 ? vec3(0.16, 0.28, 0.36) : m == 11.0 ? vec3(0.18, 0.36, 0.42) : vec3(0.1, 0.13, 0.17);
        base = mix(base * 0.3, glass, 0.85);
        reflectAmt = m == 10.0 ? 0.55 : m == 11.0 ? 0.45 : 0.35;
        spec = 0.9; gloss = 80.0;
        float lit = step(0.68, hash(id + n.xz * 3.1)) * (0.55 + 0.45 * hash(id * 3.3));
        vec3 warm = mix(vec3(1.0, 0.78, 0.45), vec3(0.7, 0.85, 1.0), step(0.8, hash(id * 1.7)));
        emitColor = warm * lit * uNight * 1.15;
      }
    }
  }

  if (m == 4.0) { // ocean: animated normal, fresnel sky reflection
    vec2 p = vWorld.xz;
    float t = uTime;
    vec2 g = vec2(cos(p.x * 0.11 + t * 0.9) * 0.35 + cos(p.x * 0.31 - p.y * 0.2 + t * 1.7) * 0.15,
                  sin(p.y * 0.13 + t * 0.7) * 0.35 + sin(p.y * 0.37 + p.x * 0.17 + t * 1.3) * 0.15);
    g += (vec2(noise(p * 0.6 + t * 0.4), noise(p * 0.6 - t * 0.4)) - 0.5) * 0.5;
    n = normalize(vec3(g.x * 0.18, 1.0, g.y * 0.18));
    float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
    vec3 deep = vec3(0.02, 0.22, 0.30), shallow = vec3(0.05, 0.48, 0.52);
    base = mix(deep, shallow, clamp(noise(p * 0.02) * 0.6, 0.0, 1.0));
    reflectAmt = 0.25 + 0.7 * fres;
    spec = 2.5; gloss = 200.0;
  } else if (m == 5.0) { // glass
    reflectAmt = 0.6; spec = 1.5; gloss = 120.0;
    base = vec3(0.06, 0.09, 0.12);
  } else if (m == 1.0) { // car paint
    reflectAmt = 0.18; spec = 0.9; gloss = 60.0;
  } else if (m == 2.0) {
    emit = 1.0;
  } else if (m == 7.0) {
    emit = 1.0;
  }

  vec3 col;
  if (emit > 0.0) {
    float boost = m == 7.0 ? (0.55 + uNight * 1.6) : (0.85 + uNight * 0.9);
    col = base * boost;
  } else {
    float sh = shadowAt(n);
    float diff = max(dot(n, uSunDir), 0.0) * sh;
    vec3 amb = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
    vec3 light = uSunColor * diff + amb;
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= uLightCount) break;
      vec3 L = uLightPos[i].xyz - vWorld;
      float ld = length(L);
      float r = uLightPos[i].w;
      float att = clamp(1.0 - ld / r, 0.0, 1.0);
      att *= att;
      light += uLightColor[i] * att * (0.35 + 0.65 * max(dot(n, L / max(ld, 0.001)), 0.0));
    }
    col = base * light;
    vec3 H = normalize(uSunDir + V);
    col += uSunColor * spec * pow(max(dot(n, H), 0.0), gloss) * sh;
    if (reflectAmt > 0.0) col = mix(col, skyReflect(reflect(-V, n)), reflectAmt);
    col += emitColor;
  }

  // atmospheric haze, tinted toward the sun
  float fogAmt = 1.0 - exp(-pow(d * uFogDensity, 1.6));
  float sunAmt = pow(max(dot(-V, uSunDir), 0.0), 6.0);
  vec3 fogC = mix(uFogColor, uSunColor * 0.9 + uFogColor * 0.4, sunAmt * 0.5);
  col = mix(col, fogC, clamp(fogAmt, 0.0, 1.0));
  col += vec3(uFlash);
  fragColor = vec4(col, 1.0);
}`;

export const DEPTH_FS = `#version 300 es
precision mediump float;
void main() {}`;

export const SKY_VS = `#version 300 es
out vec2 vNdc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  vNdc = p;
  gl_Position = vec4(p, 0.9999, 1.0);
}`;

export const SKY_FS = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform float uNight;
uniform float uTime;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec4 w = uInvViewProj * vec4(vNdc, 1.0, 1.0);
  vec3 d = normalize(w.xyz / w.w - uCamPos);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.45));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 24.0) * 0.4 + pow(sd, 4.0) * 0.12);
  if (d.y > 0.0) {
    vec2 p = d.xz / (d.y + 0.1) * 0.9 + vec2(uTime * 0.006, 0.0);
    float c = smoothstep(0.52, 0.85, fbm(p));
    vec3 cloud = mix(vec3(1.0, 0.95, 0.9) * (uSunColor * 0.5 + 0.55), vec3(0.15, 0.16, 0.25), uNight * 0.85);
    cloud += uSunColor * pow(sd, 6.0) * 0.6;
    col = mix(col, cloud, c * 0.75 * smoothstep(0.0, 0.18, d.y));
    float star = step(0.9975, hash(floor(d.xz / (d.y + 0.3) * 300.0)));
    col += vec3(star) * uNight * smoothstep(0.1, 0.4, d.y) * (1.0 - c);
  } else {
    col = mix(uHorizon, uHorizon * 0.5, clamp(-d.y * 4.0, 0.0, 1.0));
  }
  fragColor = vec4(col, 1.0);
}`;

export const PARTICLE_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aColor;
layout(location=2) in vec2 aUv;
uniform mat4 uViewProj;
out vec4 vColor;
out vec2 vUv;
void main() {
  vColor = aColor;
  vUv = aUv;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

export const PARTICLE_FS = `#version 300 es
precision mediump float;
in vec4 vColor;
in vec2 vUv;
out vec4 fragColor;
void main() {
  float mask = clamp(1.0 - dot(vUv, vUv), 0.0, 1.0);
  mask *= mask;
  fragColor = vec4(vColor.rgb * mask, vColor.a * mask);
}`;
