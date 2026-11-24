// Save games and settings in localStorage: progress, cash, arsenal, collectibles, records and stats.

const SAVE_KEY = 'solara-heat.save.v1';
const SETTINGS_KEY = 'solara-heat.settings.v1';

function storage() {
  try { return window.localStorage; } catch (e) { return null; }
}

export function writeSave(game) {
  const s = storage();
  if (!s) return false;
  const p = game.player;
  const data = {
    version: 1,
    savedAt: Date.now(),
    money: game.money,
    hour: game.hour,
    missions: [...game.missions.done],
    weapons: [...p.weapons],
    ammo: p.ammo,
    hp: Math.max(40, p.hp), armor: p.armor,
    pos: { x: p.x, z: p.z },
    exported: [...game.activities.exported],
    tokens: [...game.activities.tokens],
    bestTimes: game.activities.bestTimes,
    stats: game.stats,
  };
  try { s.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
}

export function readSave() {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(SAVE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && data.version === 1 ? data : null;
  } catch (e) { return null; }
}

export function applySave(game, data) {
  const p = game.player;
  game.money = data.money | 0;
  game.hour = data.hour ?? 17;
  game.missions.done = new Set(data.missions || []);
  p.weapons = new Set(data.weapons || []);
  p.ammo = data.ammo || {};
  p.hp = data.hp ?? 100; p.armor = data.armor ?? 0;
  if (data.pos) { p.x = data.pos.x; p.z = data.pos.z; }
  game.activities.exported = new Set(data.exported || []);
  game.activities.tokens = new Set(data.tokens || []);
  game.activities.bestTimes = data.bestTimes || {};
  Object.assign(game.stats, data.stats || {});
}

export function loadSettings() {
  const s = storage();
  const base = { master: 0.8, music: 0.6, sfx: 0.9, sensitivity: 1 };
  if (!s) return base;
  try { return { ...base, ...(JSON.parse(s.getItem(SETTINGS_KEY) || '{}')) }; } catch (e) { return base; }
}

export function saveSettings(settings) {
  const s = storage();
  if (s) try { s.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* storage full or blocked */ }
}
