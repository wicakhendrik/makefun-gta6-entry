// Procedural radio: three original stations and a title theme, sequenced live with Web Audio synth voices.

import { makeRng } from '../engine/math.js';

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export const STATIONS = [
  { name: 'SUNWAVE 88.1', tag: 'Retro synth for night drives', bpm: 104, root: 57, scale: [0, 2, 3, 5, 7, 8, 10], prog: [[0, 3, 7], [-4, 0, 3], [-9, -5, -2], [-2, 2, 5]], style: 'synthwave', seed: 11 },
  { name: 'LOW TIDE 97.4', tag: 'Slow beats from the harbor', bpm: 78, root: 50, scale: [0, 3, 5, 7, 10], prog: [[0, 3, 7, 10], [5, 8, 12, 15], [-2, 2, 5, 9], [-5, -1, 2, 5]], style: 'lofi', seed: 23 },
  { name: 'BRISA FM 103.9', tag: 'Tropical heat, all day', bpm: 96, root: 55, scale: [0, 2, 4, 5, 7, 9, 11], prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], style: 'tropical', seed: 37 },
];
const TITLE = { name: 'Title', bpm: 92, root: 52, scale: [0, 2, 3, 5, 7, 8, 10], prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-7, -4, 0]], style: 'title', seed: 5 };

// Three songs per station: each one reseeds the melody generator, so a new title really is a new tune.
const SONGS = [
  [{ title: 'Neon Undertow', artist: 'Vela Static' }, { title: 'Midnight on Meridian', artist: 'The Glass Palms' }, { title: 'Chrome Sunrise', artist: 'Kitty Overdrive' }],
  [{ title: 'Harbor Lights, Slow', artist: 'Saltmarsh Kid' }, { title: 'Rain on Pier 9', artist: 'Mono Lagoon' }, { title: 'Night Shift Ferry', artist: 'Little Anchor' }],
  [{ title: 'Mango Thunder', artist: 'Los Coralitos' }, { title: 'Sunfall Sway', artist: 'DJ Pelicano' }, { title: 'Calle Caliente', artist: 'Brisa All-Stars' }],
];
STATIONS.forEach((st, k) => { st.songs = SONGS[k].map((s, n) => ({ ...s, seed: st.seed * 7 + n * 131 })); });
/** Steps per song: 24 bars of sixteenths. */
const SONG_STEPS = 384;

export class Radio {
  constructor(audio) {
    this.audio = audio;
    this.index = 0;
    this.current = null;
    this.step = 0;
    this.nextTime = 0;
    this.on = false;
    this.bus = null;
    this.patterns = new Map();
    this.onChange = null;
    this.onSong = null;
    this.song = STATIONS.map(() => 0);
    this.songStep = 0;
  }

  /** What the HUD shows: station, song and artist for the current dial position. */
  nowPlaying() {
    if (this.index < 0) return null;
    const st = STATIONS[this.index];
    const song = st.songs[this.song[this.index] % st.songs.length];
    return { station: st.name, tag: st.tag, title: song.title, artist: song.artist, progress: this.songStep / SONG_STEPS };
  }

  nextSong() {
    if (this.index < 0) return;
    this.song[this.index] = (this.song[this.index] + 1) % STATIONS[this.index].songs.length;
    this.songStep = 0;
    if (this.onSong) this.onSong(this.nowPlaying());
  }

  ensureBus() {
    const a = this.audio;
    if (!a.ctx || this.bus) return !!this.bus;
    this.bus = a.ctx.createGain();
    this.bus.gain.value = 0;
    this.filter = a.ctx.createBiquadFilter();
    this.filter.type = 'lowpass'; this.filter.frequency.value = 9000;
    this.bus.connect(this.filter); this.filter.connect(a.musicBus);
    return true;
  }

  /** Melody and bass lines generated once per station from its seed. */
  patternFor(st) {
    const k = st.songs ? this.song[STATIONS.indexOf(st)] % st.songs.length : 0;
    const key = st.songs ? st.songs[k] : st;
    if (this.patterns.has(key)) return this.patterns.get(key);
    const rng = makeRng(key.seed);
    const lead = [];
    for (let bar = 0; bar < 4; bar++) {
      const row = [];
      for (let s = 0; s < 16; s++) {
        const hit = st.style === 'lofi' ? rng() < 0.22 : st.style === 'tropical' ? (s % 4 !== 1 && rng() < 0.5) : rng() < 0.35;
        row.push(hit ? st.scale[rng.int(0, st.scale.length - 1)] + (rng() < 0.3 ? 12 : 0) : null);
      }
      lead.push(row);
    }
    const p = { lead };
    this.patterns.set(key, p);
    return p;
  }

  play(st) {
    if (!this.ensureBus()) return;
    const t = this.audio.ctx.currentTime;
    if (this.current !== st) { this.step = 0; this.nextTime = t + 0.05; }
    this.current = st;
    this.on = true;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(st === TITLE ? 0.55 : 0.5, t, 0.3);
  }

  stop() {
    if (!this.bus) return;
    this.on = false;
    this.bus.gain.setTargetAtTime(0, this.audio.ctx.currentTime, 0.25);
  }

  playTitle() { this.play(TITLE); }
  get stationName() { return this.current && this.current !== TITLE ? this.current.name : 'Radio Off'; }

  enterVehicle(v) {
    if (v.spec.police) { this.index = -1; this.stop(); this.notify(); return; }
    if (this.index < 0) this.index = 0;
    this.play(STATIONS[this.index]);
    this.notify();
  }
  exitVehicle() { this.stop(); }
  next() { this.index = this.index + 1 >= STATIONS.length ? -1 : this.index + 1; this.tune(); }
  prev() { this.index = this.index - 1 < -1 ? STATIONS.length - 1 : this.index - 1; this.tune(); }
  tune() {
    if (this.index < 0) { this.stop(); this.current = null; } else this.play(STATIONS[this.index]);
    this.audio.ui('move');
    this.notify();
  }
  notify() { if (this.onChange) this.onChange(this.index < 0 ? { name: 'Radio Off', tag: '' } : STATIONS[this.index]); }

  /** Schedule notes slightly ahead of the audio clock. */
  update() {
    const a = this.audio;
    if (!a.ctx || !this.current || !this.bus) return;
    const ctx = a.ctx;
    const st = this.current;
    const stepDur = 60 / st.bpm / 4;
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.2) {
      if (this.on || this.bus.gain.value > 0.01) this.scheduleStep(st, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur * (st.style === 'lofi' && this.step % 2 === 0 ? 1.12 : st.style === 'lofi' ? 0.88 : 1);
      this.step = (this.step + 1) % 256;
      if (st !== TITLE && ++this.songStep >= SONG_STEPS) this.nextSong();
    }
  }

  scheduleStep(st, step, t, sd) {
    const s = step % 16, bar = Math.floor(step / 16) % 4;
    const chord = st.prog[bar];
    const root = st.root;
    const pat = this.patternFor(st);
    const bus = this.bus;
    const style = st.style;
    // drums
    if (style === 'synthwave' || style === 'title') {
      if (s % 4 === 0 && (style !== 'title' || s === 0 || s === 8)) this.kick(t, bus);
      if (s === 4 || s === 12) this.snare(t, bus, 0.35);
      if (s % 2 === 0 && style !== 'title') this.hat(t, bus, s % 4 === 2 ? 0.08 : 0.05);
    } else if (style === 'lofi') {
      if (s === 0 || s === 10) this.kick(t, bus, 0.8);
      if (s === 8) this.snare(t, bus, 0.25);
      this.hat(t, bus, s % 2 ? 0.03 : 0.05);
    } else {
      if (s % 4 === 0) this.kick(t, bus);
      if (s === 3 || s === 6 || s === 11 || s === 14) this.snare(t, bus, 0.2);
      if (s % 2 === 1) this.hat(t, bus, 0.05);
      if (s % 4 === 2) this.shaker(t, bus);
    }
    // bass
    const bassNote = root - 12 + chord[0];
    if (style === 'synthwave' && s % 2 === 0) this.bass(t, midi(bassNote + (s % 4 === 2 ? 12 : 0)), sd * 1.6, bus, 'sawtooth');
    if (style === 'title' && s % 4 === 0) this.bass(t, midi(bassNote), sd * 3.5, bus, 'sawtooth');
    if (style === 'lofi' && (s === 0 || s === 7 || s === 10)) this.bass(t, midi(bassNote - 12), sd * 4, bus, 'sine');
    if (style === 'tropical' && (s === 0 || s === 3 || s === 6 || s === 8 || s === 11 || s === 14)) this.bass(t, midi(bassNote + (s === 6 || s === 14 ? 7 : 0)), sd * 1.5, bus, 'triangle');
    // chords
    if (s === 0) {
      const notes = chord.map((c) => midi(root + c));
      this.pad(t, notes, sd * 16, bus, style);
    }
    if (style === 'tropical' && (s === 2 || s === 6 || s === 10 || s === 14)) for (const c of chord) this.pluck(t, midi(root + 12 + c), bus, 0.05);
    // melody
    const n = pat.lead[bar][s];
    if (n !== null && (style !== 'title' || step % 64 >= 32)) {
      const f = midi(root + 12 + n);
      if (style === 'tropical') this.pluck(t, f * 2, bus, 0.12);
      else if (style === 'lofi') this.keys(t, f, sd * 3, bus);
      else this.lead(t, f, sd * 1.8, bus, style === 'title' ? 0.05 : 0.07);
    }
    if (style === 'synthwave' || style === 'title') {
      // running arpeggio
      const arp = chord[s % chord.length];
      this.pluck(t, midi(root + 24 + arp), bus, style === 'title' ? 0.025 : 0.035);
    }
  }

  kick(t, dest, v = 1) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.32);
  }
  snare(t, dest, v) { this.audio.noiseBurst(t, 0.18, 'bandpass', 1900, 0.8, v, dest); this.audio.tone(t, 'triangle', 220, 160, 0.08, v * 0.5, dest); }
  hat(t, dest, v) { this.audio.noiseBurst(t, 0.04, 'highpass', 7000, 0.5, v, dest); }
  shaker(t, dest) { this.audio.noiseBurst(t, 0.07, 'highpass', 5000, 0.5, 0.04, dest); }

  bass(t, f, dur, dest, type) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  pad(t, freqs, dur, dest, style) {
    const ctx = this.audio.ctx;
    const g = ctx.createGain();
    const vol = style === 'lofi' ? 0.05 : 0.045;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.15); g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = style === 'lofi' ? 1200 : 2200;
    fl.connect(g); g.connect(dest);
    for (const f of freqs) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = style === 'lofi' ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        o.connect(fl); o.start(t); o.stop(t + dur + 0.05);
      }
    }
  }

  lead(t, f, dur, dest, vol) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 2600;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  pluck(t, f, dest, vol) { this.audio.tone(t, 'triangle', f, f, 0.18, vol, dest, 0.003); }
  keys(t, f, dur, dest) { this.audio.tone(t, 'sine', f, f, dur, 0.09, dest, 0.01); this.audio.tone(t, 'triangle', f * 2, f * 2, dur * 0.5, 0.03, dest, 0.01); }
}
