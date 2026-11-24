// Procedural character portraits for the HUD: faces painted with Canvas 2D from a small recipe, cached per size.

const cache = new Map();

/** Draw the portrait for a face recipe at (x, y) with the given size, painting it once and reusing the bitmap. */
export function drawPortrait(ctx, face, x, y, size, key) {
  const id = (key || JSON.stringify(face)) + '@' + size;
  let img = cache.get(id);
  if (!img) {
    img = document.createElement('canvas');
    const s = Math.ceil(size * 2);
    img.width = s; img.height = s;
    const c = img.getContext('2d');
    c.scale(s / 100, s / 100);
    paintFace(c, face);
    cache.set(id, img);
  }
  ctx.drawImage(img, x, y, size, size);
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function ellipse(c, x, y, rx, ry, fill) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
}

/** Paint a 100x100 face: background, shoulders, neck, head, hair, features and accessories. */
function paintFace(c, f) {
  // rounded backdrop with a gradient
  c.save();
  c.beginPath(); c.roundRect(0, 0, 100, 100, 16); c.clip();
  const bg = c.createLinearGradient(0, 0, 0, 100);
  bg.addColorStop(0, f.bg[0]); bg.addColorStop(1, f.bg[1]);
  c.fillStyle = bg; c.fillRect(0, 0, 100, 100);
  c.fillStyle = 'rgba(255,255,255,0.06)';
  for (let k = 0; k < 6; k++) c.fillRect(0, 12 + k * 16, 100, 3);
  if (f.icon) { paintIcon(c, f); c.restore(); return; }

  // shoulders and clothes
  c.fillStyle = f.jacket || f.shirt;
  c.beginPath(); c.moveTo(6, 100); c.quadraticCurveTo(10, 74, 34, 70); c.lineTo(66, 70); c.quadraticCurveTo(90, 74, 94, 100); c.fill();
  if (f.jacket) {
    c.fillStyle = f.shirt;
    c.beginPath(); c.moveTo(40, 70); c.lineTo(60, 70); c.lineTo(54, 100); c.lineTo(46, 100); c.fill();
    c.fillStyle = shade(f.jacket, 0.7);
    c.beginPath(); c.moveTo(38, 70); c.lineTo(46, 92); c.lineTo(42, 70); c.fill();
    c.beginPath(); c.moveTo(62, 70); c.lineTo(54, 92); c.lineTo(58, 70); c.fill();
  }
  if (f.tie) { c.fillStyle = f.tie; c.beginPath(); c.moveTo(48, 72); c.lineTo(52, 72); c.lineTo(54, 96); c.lineTo(50, 100); c.lineTo(46, 96); c.fill(); }
  if (f.chain) { c.strokeStyle = '#ffd24a'; c.lineWidth = 1.6; c.beginPath(); c.arc(50, 68, 12, 0.3, Math.PI - 0.3); c.stroke(); }
  if (f.badge) { c.fillStyle = '#ffd24a'; c.beginPath(); c.moveTo(28, 84); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 2.5 : 5.5; c.lineTo(28 + Math.cos(a) * r, 86 + Math.sin(a) * r); } c.fill(); }

  // neck and head
  c.fillStyle = shade(f.skin, 0.82); c.fillRect(42, 56, 16, 18);
  if (f.style === 'long' || f.style === 'ponytail') { ellipse(c, 50, 46, 25, 30, f.hair); }
  ellipse(c, 27.5, 44, 4, 6, shade(f.skin, 0.9));
  ellipse(c, 72.5, 44, 4, 6, shade(f.skin, 0.9));
  const head = c.createRadialGradient(44, 36, 4, 50, 42, 26);
  head.addColorStop(0, shade(f.skin, 1.12)); head.addColorStop(1, shade(f.skin, 0.88));
  c.beginPath(); c.ellipse(50, 42, 21, 25, 0, 0, Math.PI * 2); c.fillStyle = head; c.fill();
  if (f.earring) { ellipse(c, 27, 51, 1.6, 1.6, '#ffd24a'); ellipse(c, 73, 51, 1.6, 1.6, '#ffd24a'); }
  if (f.grease) { c.fillStyle = 'rgba(30,20,10,0.35)'; c.beginPath(); c.ellipse(60, 50, 5, 2, -0.4, 0, Math.PI * 2); c.fill(); }

  paintHair(c, f);

  // eyes and brows
  for (const ex of [41, 59]) {
    ellipse(c, ex, 41, 4.2, 2.6, '#f8f4ee');
    ellipse(c, ex + 0.5, 41.2, 2, 2.2, '#2a1a10');
    ellipse(c, ex + 1.1, 40.4, 0.7, 0.7, '#ffffff');
    c.fillStyle = shade(f.hair === '#9fe3c8' ? '#333333' : f.hair, 0.8);
    c.fillRect(ex - 5, 34.5 + (f.style === 'swept' ? 0.8 : 0), 10, 2.2);
  }
  // nose and mouth
  c.strokeStyle = shade(f.skin, 0.68); c.lineWidth = 1.6; c.lineCap = 'round';
  c.beginPath(); c.moveTo(50, 43); c.lineTo(48, 51); c.lineTo(51.5, 52); c.stroke();
  c.strokeStyle = f.lips || shade(f.skin, 0.55); c.lineWidth = f.lips ? 2.6 : 2;
  c.beginPath(); c.moveTo(44, 58); c.quadraticCurveTo(50, 60.5, 56, 58); c.stroke();
  if (f.beard) {
    c.fillStyle = f.beard;
    c.beginPath(); c.moveTo(30, 46); c.quadraticCurveTo(32, 68, 50, 69); c.quadraticCurveTo(68, 68, 70, 46); c.quadraticCurveTo(66, 60, 56, 61); c.quadraticCurveTo(50, 63, 44, 61); c.quadraticCurveTo(34, 60, 30, 46); c.fill();
    c.fillRect(43, 55, 14, 2);
  } else if (f.stubble) {
    c.fillStyle = 'rgba(20,14,10,0.28)';
    c.beginPath(); c.moveTo(32, 50); c.quadraticCurveTo(36, 67, 50, 67); c.quadraticCurveTo(64, 67, 68, 50); c.quadraticCurveTo(60, 62, 50, 62); c.quadraticCurveTo(40, 62, 32, 50); c.fill();
  }
  if (f.scar) { c.strokeStyle = 'rgba(120,40,40,0.8)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(62, 30); c.lineTo(66, 40); c.stroke(); }
  if (f.glasses) {
    c.strokeStyle = f.glasses; c.lineWidth = 2;
    c.beginPath(); c.roundRect(34, 37, 13, 9, 3); c.roundRect(53, 37, 13, 9, 3); c.moveTo(47, 40); c.lineTo(53, 40); c.stroke();
    if (f.glasses === '#3dff8e') { c.fillStyle = 'rgba(61,255,142,0.25)'; c.fillRect(34, 37, 13, 9); c.fillRect(53, 37, 13, 9); }
  }
  if (f.headset) {
    c.strokeStyle = '#1a1a1a'; c.lineWidth = 3;
    c.beginPath(); c.arc(50, 40, 25, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    ellipse(c, 26, 44, 4, 6, '#2a2a2a');
    c.lineWidth = 2; c.beginPath(); c.moveTo(26, 48); c.quadraticCurveTo(30, 60, 42, 60); c.stroke();
  }
  c.restore();
}

function paintHair(c, f) {
  c.fillStyle = f.hair;
  const s = f.style;
  if (s === 'bald' || s === 'none') return;
  if (s === 'buzz') { c.beginPath(); c.ellipse(50, 33, 21, 15, 0, Math.PI, Math.PI * 2); c.fill(); }
  else if (s === 'slick') {
    c.beginPath(); c.moveTo(28, 40); c.quadraticCurveTo(26, 14, 52, 14); c.quadraticCurveTo(76, 15, 72, 38); c.quadraticCurveTo(66, 26, 50, 26); c.quadraticCurveTo(36, 26, 28, 40); c.fill();
  } else if (s === 'swept') {
    c.beginPath(); c.moveTo(29, 38); c.quadraticCurveTo(30, 13, 56, 15); c.quadraticCurveTo(75, 18, 71, 36); c.quadraticCurveTo(60, 22, 42, 28); c.quadraticCurveTo(34, 31, 29, 38); c.fill();
  } else if (s === 'curly') {
    for (let k = 0; k < 11; k++) { const a = Math.PI + (k / 10) * Math.PI; ellipse(c, 50 + Math.cos(a) * 20, 34 + Math.sin(a) * 16, 7, 7, f.hair); }
  } else if (s === 'bun') {
    ellipse(c, 50, 13, 9, 7, f.hair);
    c.beginPath(); c.moveTo(29, 40); c.quadraticCurveTo(28, 16, 50, 17); c.quadraticCurveTo(72, 16, 71, 40); c.quadraticCurveTo(64, 26, 50, 25); c.quadraticCurveTo(36, 26, 29, 40); c.fill();
  } else if (s === 'long' || s === 'ponytail') {
    c.beginPath(); c.moveTo(28, 42); c.quadraticCurveTo(28, 15, 50, 16); c.quadraticCurveTo(72, 15, 72, 42); c.quadraticCurveTo(66, 24, 44, 28); c.quadraticCurveTo(34, 30, 28, 42); c.fill();
  } else { c.beginPath(); c.ellipse(50, 30, 21, 13, 0, Math.PI, Math.PI * 2); c.fill(); }
  if (f.cap) {
    c.fillStyle = f.cap;
    c.beginPath(); c.ellipse(50, 28, 23, 13, 0, Math.PI, Math.PI * 2); c.fill();
    c.fillRect(46, 26, 30, 4);
  }
  if (f.bandana) { c.fillStyle = f.bandana; c.fillRect(29, 26, 42, 5); c.beginPath(); c.moveTo(71, 27); c.lineTo(78, 24); c.lineTo(76, 33); c.fill(); }
}

function paintIcon(c, f) {
  c.fillStyle = f.skin;
  if (f.icon === 'sun') {
    ellipse(c, 50, 50, 18, 18, f.skin);
    c.strokeStyle = f.skin; c.lineWidth = 5; c.lineCap = 'round';
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.beginPath(); c.moveTo(50 + Math.cos(a) * 26, 50 + Math.sin(a) * 26); c.lineTo(50 + Math.cos(a) * 36, 50 + Math.sin(a) * 36); c.stroke(); }
  } else {
    c.beginPath(); c.roundRect(34, 18, 32, 64, 7); c.fill();
    c.fillStyle = f.bg[1]; c.fillRect(38, 26, 24, 42);
    ellipse(c, 50, 75, 3, 3, f.bg[1]);
  }
}
