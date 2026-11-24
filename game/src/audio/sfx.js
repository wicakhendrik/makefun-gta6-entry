// Synthesised sound effects with Web Audio: guns, engines, sirens, crashes, explosions, voices and UI cues.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.volume = { master: 0.8, sfx: 0.9, music: 0.6 };
    this.engineOn = false;
  }

  /** Create the context on the first user gesture (browsers require it). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(comp);
    this.musicBus = ctx.createGain(); this.musicBus.connect(comp);
    this.applyVolume();
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startLoops();
  }

  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = this.volume.master;
    this.sfxBus.gain.value = this.volume.sfx;
    this.musicBus.gain.value = this.volume.music;
  }

  /** Gain and stereo pan for a world position relative to the listener. */
  spatial(x, z, range = 120) {
    if (x === undefined) return { gain: 1, pan: 0 };
    const dx = x - this.listener.x, dz = z - this.listener.z;
    const d = Math.hypot(dx, dz);
    const gain = Math.max(0, 1 - d / range) ** 1.5;
    const rx = -Math.cos(this.listener.yaw), rz = Math.sin(this.listener.yaw);
    const pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0;
    return { gain, pan };
  }

  out(gain, pan) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.sfxBus); }
    else g.connect(this.sfxBus);
    return g;
  }

  noiseBurst(t, dur, filterType, freq, q, vol, dest, freqEnd) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  tone(t, type, f0, f1, dur, vol, dest, attack = 0.005) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(x, z, range, fn) {
    if (!this.ctx) return;
    const { gain, pan } = this.spatial(x, z, range);
    if (gain < 0.01) return;
    fn(this.ctx.currentTime, this.out(gain, pan));
  }

  gunshot(kind, x, z, isPlayer) {
    this.play(isPlayer ? undefined : x, z, 160, (t, out) => {
      const v = isPlayer ? 0.9 : 0.75;
      if (kind === 'shotgun') { this.noiseBurst(t, 0.45, 'lowpass', 2400, 0.7, v * 1.1, out, 300); this.tone(t, 'sine', 120, 40, 0.25, v, out); }
      else if (kind === 'rifle') { this.noiseBurst(t, 0.22, 'bandpass', 1800, 0.9, v, out, 500); this.tone(t, 'square', 180, 60, 0.08, v * 0.4, out); }
      else if (kind === 'smg') { this.noiseBurst(t, 0.12, 'bandpass', 2600, 1.1, v * 0.8, out, 900); }
      else { this.noiseBurst(t, 0.2, 'bandpass', 2000, 1, v, out, 600); this.tone(t, 'triangle', 220, 70, 0.1, v * 0.5, out); }
    });
  }

  dryFire() { this.play(undefined, 0, 1, (t, out) => this.tone(t, 'square', 1800, 1500, 0.03, 0.2, out)); }
  weaponSwitch() { this.play(undefined, 0, 1, (t, out) => { this.tone(t, 'square', 900, 700, 0.04, 0.12, out); this.tone(t + 0.06, 'square', 1200, 1000, 0.04, 0.1, out); }); }
  swing() { this.play(undefined, 0, 1, (t, out) => this.noiseBurst(t, 0.12, 'highpass', 1500, 0.5, 0.15, out, 4000)); }
  punch(x, z) { this.play(x, z, 40, (t, out) => { this.noiseBurst(t, 0.1, 'lowpass', 800, 1, 0.7, out); this.tone(t, 'sine', 150, 60, 0.12, 0.6, out); }); }
  thud(x, z) { this.play(x, z, 60, (t, out) => { this.tone(t, 'sine', 110, 45, 0.25, 0.9, out); this.noiseBurst(t, 0.15, 'lowpass', 600, 1, 0.6, out); }); }

  crash(power, x, z) {
    this.play(x, z, 90, (t, out) => {
      this.noiseBurst(t, 0.3 + power * 0.4, 'lowpass', 1800 + power * 2000, 0.8, 0.5 + power * 0.6, out, 200);
      this.tone(t, 'square', 260 + Math.random() * 120, 90, 0.25, 0.15 * power, out);
      this.tone(t + 0.04, 'sawtooth', 420 + Math.random() * 200, 150, 0.3, 0.1 * power, out);
    });
  }

  explosion(x, z) {
    this.play(x, z, 300, (t, out) => {
      this.noiseBurst(t, 1.8, 'lowpass', 1200, 0.7, 1.4, out, 60);
      this.tone(t, 'sine', 90, 25, 1.2, 1.2, out, 0.01);
      this.noiseBurst(t + 0.05, 0.6, 'bandpass', 3000, 0.5, 0.3, out, 400);
    });
  }

  horn(x, z, isPlayer) {
    this.play(isPlayer ? undefined : x, z, 100, (t, out) => {
      for (const f of [349, 440]) {
        const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.02); g.gain.setValueAtTime(0.12, t + 0.45); g.gain.linearRampToValueAtTime(0.0001, t + 0.5);
        const f2 = this.ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 1800;
        o.connect(f2); f2.connect(g); g.connect(out); o.start(t); o.stop(t + 0.55);
      }
    });
  }

  carAlarm(x, z) {
    this.play(x, z, 90, (t, out) => {
      for (let k = 0; k < 10; k++) this.tone(t + k * 0.3, 'square', k % 2 ? 900 : 700, k % 2 ? 900 : 700, 0.25, 0.12, out, 0.01);
    });
  }

  scream(x, z) {
    this.play(x, z, 70, (t, out) => {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      const base = 500 + Math.random() * 300;
      o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.5, t + 0.15); o.frequency.linearRampToValueAtTime(base * 0.8, t + 0.8);
      const vib = this.ctx.createOscillator(); vib.frequency.value = 7; const vg = this.ctx.createGain(); vg.gain.value = 25; vib.connect(vg); vg.connect(o.frequency);
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
      o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 0.9); vib.start(t); vib.stop(t + 0.9);
    });
  }

  ui(kind) {
    this.play(undefined, 0, 1, (t, out) => {
      if (kind === 'move') this.tone(t, 'triangle', 660, 660, 0.06, 0.15, out);
      else if (kind === 'select') { this.tone(t, 'triangle', 660, 660, 0.08, 0.2, out); this.tone(t + 0.07, 'triangle', 990, 990, 0.12, 0.2, out); }
      else if (kind === 'back') this.tone(t, 'triangle', 520, 330, 0.12, 0.18, out);
      else if (kind === 'cash') { [1046, 1318, 1568].forEach((f, k) => this.tone(t + k * 0.06, 'square', f, f, 0.12, 0.08, out)); }
      else if (kind === 'checkpoint') { this.tone(t, 'sine', 880, 880, 0.15, 0.3, out); this.tone(t + 0.1, 'sine', 1320, 1320, 0.2, 0.3, out); }
    });
  }

  missionPassed() {
    this.play(undefined, 0, 1, (t, out) => {
      const notes = [523, 659, 784, 1046, 784, 1046, 1318];
      notes.forEach((f, k) => { this.tone(t + k * 0.11, 'square', f, f, 0.25, 0.09, out); this.tone(t + k * 0.11, 'triangle', f / 2, f / 2, 0.3, 0.15, out); });
    });
  }

  missionFailed() {
    this.play(undefined, 0, 1, (t, out) => { [392, 330, 262, 196].forEach((f, k) => this.tone(t + k * 0.18, 'sawtooth', f, f * 0.98, 0.35, 0.08, out)); });
  }

  wantedUp() { this.play(undefined, 0, 1, (t, out) => { this.tone(t, 'square', 440, 440, 0.1, 0.1, out); this.tone(t + 0.12, 'square', 660, 660, 0.15, 0.1, out); }); }
  wantedLost() { this.play(undefined, 0, 1, (t, out) => { this.tone(t, 'triangle', 784, 784, 0.15, 0.15, out); this.tone(t + 0.15, 'triangle', 1046, 1046, 0.3, 0.15, out); }); }
  wasted() { this.play(undefined, 0, 1, (t, out) => { this.tone(t, 'sine', 220, 55, 2.0, 0.6, out, 0.02); this.noiseBurst(t, 1.5, 'lowpass', 400, 1, 0.3, out, 80); }); }

  /** Continuous sounds: engine note, siren wail and city ambience, steered every frame by update(). */
  startLoops() {
    const ctx = this.ctx;
    this.engOsc = ctx.createOscillator(); this.engOsc.type = 'sawtooth';
    this.engOsc2 = ctx.createOscillator(); this.engOsc2.type = 'square';
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 600;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engOsc.connect(this.engFilter); this.engOsc2.connect(this.engFilter); this.engFilter.connect(this.engGain); this.engGain.connect(this.sfxBus);
    this.engOsc.start(); this.engOsc2.start();

    this.sirenOsc = ctx.createOscillator(); this.sirenOsc.type = 'sawtooth';
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 2200;
    this.sirenGain = ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    this.sirenOsc.connect(sf); sf.connect(this.sirenGain);
    if (this.sirenPan) { this.sirenGain.connect(this.sirenPan); this.sirenPan.connect(this.sfxBus); } else this.sirenGain.connect(this.sfxBus);
    this.sirenOsc.start();

    const amb = ctx.createBufferSource(); amb.buffer = this.noise; amb.loop = true;
    const af = ctx.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 420;
    this.ambGain = ctx.createGain(); this.ambGain.gain.value = 0.05;
    amb.connect(af); af.connect(this.ambGain); this.ambGain.connect(this.sfxBus); amb.start();
  }

  update(game, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const p = game.player;
    this.listener = { x: game.camera.eye[0], z: game.camera.eye[2], yaw: game.camera.yaw };
    const v = p.vehicle;
    const playing = game.state === 'playing';
    if (v && playing && v.state === 'ok') {
      const rpm = 0.25 + (Math.abs(v.forwardSpeed) / v.spec.top) * 0.9 + Math.abs(v.input.throttle) * 0.15;
      const gearRpm = (rpm * 4) % 1 * 0.35 + rpm * 0.65;
      const base = v.spec.shape === 'van' ? 38 : v.spec.shape === 'sports' ? 62 : 48;
      this.engOsc.frequency.setTargetAtTime(base + gearRpm * base * 2.2, t, 0.05);
      this.engOsc2.frequency.setTargetAtTime((base + gearRpm * base * 2.2) * 0.5, t, 0.05);
      this.engFilter.frequency.setTargetAtTime(400 + gearRpm * 1600 + v.input.throttle * 300, t, 0.05);
      this.engGain.gain.setTargetAtTime(0.06 + Math.abs(v.input.throttle) * 0.05, t, 0.1);
    } else this.engGain.gain.setTargetAtTime(0, t, 0.1);

    // nearest siren
    let best = null, bd = 1e9;
    if (playing) for (const c of game.vehicles) if (c.sirenOn) { const d = Math.hypot(c.x - this.listener.x, c.z - this.listener.z); if (d < bd) { bd = d; best = c; } }
    if (best && bd < 220) {
      const wail = Math.sin(t * Math.PI * 0.9);
      const yelp = game.police.stars >= 3;
      const f = yelp ? 900 + Math.sign(Math.sin(t * 22)) * 250 : 750 + wail * 420;
      this.sirenOsc.frequency.setTargetAtTime(f, t, 0.03);
      const { gain, pan } = this.spatial(best.x, best.z, 220);
      this.sirenGain.gain.setTargetAtTime(gain * 0.12, t, 0.1);
      if (this.sirenPan) this.sirenPan.pan.setTargetAtTime(pan * 0.7, t, 0.1);
    } else this.sirenGain.gain.setTargetAtTime(0, t, 0.2);
    this.ambGain.gain.setTargetAtTime(playing ? 0.05 : 0.015, t, 0.5);
  }
}
