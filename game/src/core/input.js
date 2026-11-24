// Keyboard and mouse state with per-frame edge detection and pointer lock for mouse look.

export class Input {
  constructor(target) {
    this.target = target;
    this.down = new Set();
    this.hits = new Set();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.buttons = [false, false, false];
    this.clicks = [false, false, false];
    this.locked = false;
    this.wantLock = false;
    this.sensitivity = 1;
    window.addEventListener('keydown', (e) => {
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.hits.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); this.buttons = [false, false, false]; });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    window.addEventListener('mousedown', (e) => {
      this.buttons[e.button] = true; this.clicks[e.button] = true;
      if (this.wantLock && !this.locked) this.requestLock();
    });
    window.addEventListener('mouseup', (e) => { this.buttons[e.button] = false; });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.target; });
  }

  requestLock() {
    try { const p = this.target.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not available */ }
  }

  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  isDown(code) { return this.down.has(code); }
  /** True only on the frame the key went down. */
  pressed(code) { return this.hits.has(code); }
  axis(neg, pos) { return (this.isDown(pos) ? 1 : 0) - (this.isDown(neg) ? 1 : 0); }

  /** Call once at the end of every frame. */
  endFrame() {
    this.hits.clear();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.clicks = [false, false, false];
  }
}
