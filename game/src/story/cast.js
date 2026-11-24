// Who is who in Port Solara: display names, roles, colours and the face recipe for each speaker's portrait.

export const CAST = {
  MARCO: { name: 'Marco Vela', role: 'Getaway driver', color: '#ffd24a',
    face: { skin: '#c98d62', hair: '#1b1410', style: 'slick', stubble: true, shirt: '#1fb5a8', jacket: '#2a2f3a', bg: ['#2a5a6a', '#0f2230'], scar: true } },
  LOU: { name: 'Lou Santi', role: "Chop-shop owner · Marco's aunt", color: '#ff6ac1',
    face: { skin: '#b97a52', hair: '#8a8a92', style: 'bun', shirt: '#ff6ac1', bg: ['#6a2a5a', '#2a0f24'], glasses: '#2a1a10', earring: true, lips: '#a0303a' } },
  TEO: { name: 'Teo Bravo', role: 'Fixer · Ocelot Lounge', color: '#4ae4ff',
    face: { skin: '#8a5a3a', hair: '#0e0b0a', style: 'curly', beard: '#0e0b0a', shirt: '#f4f0e6', jacket: '#4a2a6a', bg: ['#1f5a6a', '#0b2030'], chain: true } },
  'DET. MARR': { name: 'Det. Ilsa Marr', role: 'Solara PD detective', color: '#8c9cff',
    face: { skin: '#e8c0a0', hair: '#c06a2a', style: 'long', shirt: '#dfe4ee', jacket: '#2a3450', bg: ['#2a3a6a', '#0f1430'], badge: true, lips: '#b0505a' } },
  CRANE: { name: 'Victor Crane', role: 'Developer · Crane Holdings', color: '#ff5a5a',
    face: { skin: '#e6c4a8', hair: '#e8e4da', style: 'swept', shirt: '#f4f4f4', jacket: '#141418', tie: '#c02020', bg: ['#5a1a1a', '#200808'], glasses: '#c8a040' } },
  ROCCO: { name: 'Rocco Fiel', role: 'Gambler · owes the Ocelot', color: '#9fe3c8',
    face: { skin: '#d8a27a', hair: '#3a2414', style: 'buzz', beard: '#3a2414', shirt: '#9fe3c8', bg: ['#2a5a4a', '#0f2a20'], cap: '#e8322e' } },
  DISPATCH: { name: 'SPD Dispatch', role: 'Solara PD radio · channel 4', color: '#5a8cff',
    face: { skin: '#a8724c', hair: '#141018', style: 'bun', shirt: '#22304e', bg: ['#1a2a5a', '#080c20'], headset: true, lips: '#8a3a3a' } },
  NINA: { name: 'Nina "Wrench" Ortiz', role: 'Crew · mechanic', color: '#ffb03a',
    face: { skin: '#c48a5e', hair: '#2a1410', style: 'ponytail', shirt: '#3a6ac8', bg: ['#6a4a1a', '#2a1a08'], bandana: '#e8322e', grease: true } },
  DEX: { name: 'Dex "Static" Kahale', role: 'Crew · hacker', color: '#3dff8e',
    face: { skin: '#9a6a44', hair: '#101010', style: 'curly', shirt: '#1a1a22', bg: ['#1a5a3a', '#08200f'], glasses: '#3dff8e', headset: true } },
  BEA: { name: 'Bea "Brass" Moreno', role: 'Crew · enforcer', color: '#ff7a5a',
    face: { skin: '#d49a6e', hair: '#1a1010', style: 'buzz', shirt: '#2a2a2a', jacket: '#5a3a2a', bg: ['#6a2a1a', '#2a0f08'], earring: true, scar: true } },
  TIP: { name: 'Port Solara', role: 'Street tip', color: '#9fe3c8',
    face: { skin: '#9fe3c8', hair: '#9fe3c8', style: 'none', shirt: '#1fb5a8', bg: ['#1a4a4a', '#081818'], icon: 'phone' } },
  'PORT SOLARA': { name: 'Port Solara', role: 'The city', color: '#ffd24a',
    face: { skin: '#ffd24a', hair: '#ffd24a', style: 'none', shirt: '#ff6ac1', bg: ['#6a3a1a', '#200f08'], icon: 'sun' } },
};

/** Cast entry for a dialogue speaker, with a fallback for anyone unnamed. */
export function castFor(who) {
  return CAST[who] || { name: who, role: '', color: '#ffd24a', face: { skin: '#c08a60', hair: '#222', style: 'short', shirt: '#555', bg: ['#333', '#111'] } };
}
