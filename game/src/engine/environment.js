// Time of day: sun/moon direction, sky gradient, ambient light and haze, blended between hand-tuned keyframes.

import { hexColor, lerp, clamp } from './math.js';

const KEYS = [
  { h: 0, zenith: '#060a1e', horizon: '#1a1f3e', sun: '#26304c', sky: '#1a2240', ground: '#0b0c14', fog: '#121830', fd: 0.0022, night: 1 },
  { h: 5.2, zenith: '#151d48', horizon: '#9a5a6c', sun: '#4a2f48', sky: '#2f3156', ground: '#161218', fog: '#5a4664', fd: 0.0024, night: 0.75 },
  { h: 6.8, zenith: '#3a74c0', horizon: '#f6c49a', sun: '#ffcf98', sky: '#5f7ea6', ground: '#4c3e32', fog: '#e8c6aa', fd: 0.0019, night: 0 },
  { h: 12, zenith: '#2a74d6', horizon: '#bfe2f6', sun: '#fff1d6', sky: '#6f96c4', ground: '#5c5244', fog: '#c6e0f2', fd: 0.0014, night: 0 },
  { h: 16.4, zenith: '#2f6cc0', horizon: '#f2d8b2', sun: '#ffe2b4', sky: '#6a86ac', ground: '#5c4838', fog: '#e8d4b8', fd: 0.0016, night: 0 },
  { h: 18.2, zenith: '#34407e', horizon: '#ff8c5a', sun: '#ff9c52', sky: '#5e5488', ground: '#4e3430', fog: '#f29a76', fd: 0.0019, night: 0.12 },
  { h: 19.3, zenith: '#1a1e4a', horizon: '#c8507a', sun: '#8c3c64', sky: '#383666', ground: '#1e1620', fog: '#6e4470', fd: 0.0021, night: 0.65 },
  { h: 20.6, zenith: '#080c24', horizon: '#22204a', sun: '#2a3150', sky: '#1d2444', ground: '#0c0c16', fog: '#161a36', fd: 0.0022, night: 1 },
  { h: 24, zenith: '#060a1e', horizon: '#1a1f3e', sun: '#26304c', sky: '#1a2240', ground: '#0b0c14', fog: '#121830', fd: 0.0022, night: 1 },
];
const PARSED = KEYS.map((k) => ({
  h: k.h, fd: k.fd, night: k.night,
  zenith: hexColor(k.zenith), horizon: hexColor(k.horizon), sun: hexColor(k.sun),
  sky: hexColor(k.sky), ground: hexColor(k.ground), fog: hexColor(k.fog),
}));

const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Environment for an hour in [0, 24). Sun rises over the ocean in the east (+x) and sets west. */
export function environmentAt(hour) {
  hour = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < PARSED.length - 2 && PARSED[i + 1].h <= hour) i++;
  const a = PARSED[i], b = PARSED[i + 1];
  const t = clamp((hour - a.h) / (b.h - a.h), 0, 1);
  const env = {
    hour,
    zenith: mix3(a.zenith, b.zenith, t),
    horizon: mix3(a.horizon, b.horizon, t),
    sunColor: mix3(a.sun, b.sun, t),
    skyAmbient: mix3(a.sky, b.sky, t).map((v) => v * 0.62),
    groundAmbient: mix3(a.ground, b.ground, t).map((v) => v * 0.6),
    fogColor: mix3(a.fog, b.fog, t),
    fogDensity: lerp(a.fd, b.fd, t),
    night: lerp(a.night, b.night, t),
  };
  const dayT = (hour - 6.2) / (19.4 - 6.2);
  if (dayT > 0 && dayT < 1) {
    const el = Math.sin(dayT * Math.PI) * 1.15 + 0.03;
    const az = dayT * Math.PI;
    const ce = Math.cos(el);
    env.sunDir = norm([Math.cos(az) * ce, Math.max(Math.sin(el), 0.06), 0.35 * ce + 0.1]);
    env.sunVisible = true;
  } else {
    env.sunDir = norm([-0.35, 0.75, 0.45]); // moonlight
    env.sunVisible = false;
  }
  env.sunColor = env.sunColor.map((v) => v * (env.sunVisible ? 1.0 : 0.9));
  return env;
}

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function formatClock(hour) {
  const h = Math.floor(hour) % 24, m = Math.floor((hour % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
