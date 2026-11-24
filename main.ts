// Hand-in program for Solara Heat (make.fun bounty gta6-01). Node 22+, standard library only.
//
// The game is the static folder game/ (index.html, ES modules, one stylesheet; no build step, no library,
// no network request). This program copies game/ and screenshots/ into the output folder and writes the
// dossier the judge reads, using the kit's vendored make.fun library unchanged.
//
// Outside the grader, set MAKEFUN_OUTPUT_DIR:   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// To play locally:                                node serve.ts   (then open http://localhost:8080)

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The grader's caps, mirrored so a bad hand-in fails here with a clear message instead of later.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
};

function countTree(dir: string): { entries: number; bytes: number } {
  let entries = 0, bytes = 0;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    entries++;
    if (st.isDirectory()) { const sub = countTree(full); entries += sub.entries; bytes += sub.bytes; }
    else bytes += st.size;
  }
  return { entries, bytes };
}

const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');
if (!existsSync(join(gameDir, 'index.html'))) throw new Error('game/index.html is missing');

const tree = countTree(gameDir);
if (tree.entries > CAPS.game_max_files || tree.bytes > CAPS.game_max_bytes) {
  throw new Error(`game/ is too big: ${tree.entries} entries, ${tree.bytes} bytes`);
}
const shots = existsSync(shotsDir) ? readdirSync(shotsDir).filter((n) => !n.startsWith('.')) : [];
if (shots.length < 3 || shots.length > CAPS.screenshots.max) throw new Error(`need 3-4 screenshots, found ${shots.length}`);

mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
for (const name of shots) cpSync(join(shotsDir, name), join(outputDir, 'screenshots', name));

const dossier = buildDossier(outputDir, {
  text_max_bytes: CAPS.text_max_bytes,
  screenshots: CAPS.screenshots,
  game_max_files: CAPS.game_max_files,
  game_max_bytes: CAPS.game_max_bytes,
  game_path_max_bytes: CAPS.game_path_max_bytes,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`Solara Heat handed in: ${tree.entries} game entries (${(tree.bytes / 1024).toFixed(0)} KiB), ${shots.length} screenshots, dossier ${(dossier.length / 1024).toFixed(0)} KiB -> ${outputDir}`);
