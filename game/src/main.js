// Entry point: boot the game, show the title screen (or stage a screenshot scene) and run the frame loop.

import { Game } from './core/game.js';
import { runShot } from './core/shots.js';

function showFatal(err) {
  const box = document.createElement('div');
  box.className = 'fatal';
  box.textContent = 'Solara Heat could not start: ' + (err && err.message ? err.message : err);
  document.body.appendChild(box);
  console.error(err);
}

function boot() {
  const game = new Game(document.getElementById('world'), document.getElementById('hud'));
  window.solara = game;
  const shot = new URLSearchParams(location.search).get('shot');
  let readyIn = -1;
  if (shot && runShot(game, shot)) readyIn = 3;
  else game.toTitle();
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.max(0, (now - last) / 1000);
    last = now;
    game.frame(readyIn >= 0 ? 1 / 60 : dt);
    if (readyIn > 0 && --readyIn === 0) window.__shotReady = true;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

try { boot(); } catch (e) { showFatal(e); }
