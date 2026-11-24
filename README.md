# makefun-gta6-entry

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/wicakhendrik/makefun-gta6-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/wicakhendrik/makefun-gta6-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solara Heat** is an original open-world crime game that runs in desktop Chrome from plain static files.
It is set in **Port Solara**, a sun-soaked island city of neon hotels, glass towers, palm-lined beaches and
container docks. You play Marco Vela, a getaway driver who comes home after five years to find his aunt's
chop shop strangled by Victor Crane, the developer who is buying the city one burned-out block at a time.

Everything is made from code written for this game: a raw WebGL2 renderer (sun shadows, procedural
facades, animated ocean, day/night cycle, point lights for street lamps, sirens and explosions), procedural
city generation, low-poly cars and people, Web Audio sound effects and a procedural three-station car radio.
No libraries, no downloaded assets, no network requests.

![Police chase on Ocean Drive](screenshots/1-chase.jpg)

### What is in the game

- **A city to explore** on foot and by car: eight districts (Meridian, Midtown, Coral Strand, Las Brisas,
  Cinder Row, El Mercado, Saltmarsh Docks, Halcyon Park), Solara Beach and Sunfall Pier with its big wheel.
- **Traffic and pedestrians**: lane-following drivers who turn at junctions, brake, honk and panic;
  pedestrians who walk the sidewalks, cross at zebra crossings, stroll the beach and flee from gunfire.
- **Cars and bikes to steal and drive**: nine original car models (Kestrel Vanta, Solano Riviera, Marlin Bayside,
  Tamarind Cub, Orca Hauler, Gannet Ranchero, Brisa Cab, SPD Interceptor, Crane Regent) plus the Kite S600
  motorbike that leans into corners, with arcade handling, handbrake drifts, damage, smoke, fire and explosions.
  Pull drivers out of their seats.
- **Wanted level and SPD dispatch**: five stars of heat and witnesses. Every pursuit unit has a call sign and a
  tactic the dispatch board shows live: ramming, flanking (cutting in beside and ahead of your car), closing in,
  roadblocks (interceptors parked across the road a few junctions ahead, officers holding behind them),
  searching your last known position, and AIR ONE, the helicopter whose spotlight tracks you while it has line
  of sight. Officers deploy on foot, cuff you at one star and shoot from two. Break line of sight to lose them,
  jam their radio, or pay Lou for a respray.
- **Crew**: Nina "Wrench" Ortiz (Z, field repair), Dex "Static" Kahale (X, scanner jam that blinds dispatch for
  10 seconds) and Bea "Brass" Moreno (C, supply drop of ammo and armor) join as the story moves on, each with a
  cooldown.
- **Respect and rank**: missions, crew fights, escapes, races, fares and exports earn respect points through ten
  ranks from Nobody to Legend.
- **Story and missions**: six story missions with dialogue (stealing to order, a car chase, a dockside
  gunfight, a betrayal and a finale against Crane's limousine and bodyguards).
- **Activities**: two street races against AI drivers, Brisa Cab taxi fares with streak bonuses (press E in
  any cab), Lou's export list, twelve hidden Sun Tokens,
  the Bolt & Barrel gun shop, pickups for health, armor and ammo, and cash for every job.
- **Combat**: seven weapon slots: fists, Gaff Bat, Hornet 9 pistol, Wasp MP, Mako 12 shotgun, Sable AR rifle and
  the Pelican RL rocket launcher (rockets with smoke trails that blow up cars and the helicopter). Clips and
  reloads, hitscan bullets, head shots, tracers, muzzle flashes, drive-by shooting and blast damage.
- **HUD and menus**: mission tracker (giver portrait, stage x/y with a progress bar, current and next step,
  timer), SPD dispatch board, weapon slot bar with clip and reserve, dialogue box with procedurally painted
  character portraits, crew panel with ability cooldowns, rank bar, vehicle panel (speed, condition, class) with
  the radio's station and current song, labelled health and armor, rotating minimap with GPS route, full map,
  district names, title screen, pause menu, settings, stats. The HUD scales with the window.
- **Radio**: three procedural stations, each with a playlist of original songs (own melody and key per song)
  and a "now playing" card when the song or station changes.
- **The city around it**: a mainland skyline across the bay on three sides, neon on the Strand at night.
- **Saving**: autosave after missions and manual save at the Seabreeze Apartments safehouse or from the pause
  menu, stored in `localStorage`.

### Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Look and aim (click the game to capture the mouse) |
| Left click / right click | Shoot or punch / aim |
| Shift | Sprint |
| F or Enter | Steal, enter or leave a vehicle |
| Space | Handbrake |
| Q / E / mouse wheel / 1-7 | Switch weapon (slot number) |
| R | Reload |
| Z / X / C | Crew: field repair / scanner jam / supply drop |
| E | Interact: shops, races, garage, safehouse |
| H / N / B / G | Horn / next station / previous station / siren |
| M or Tab | Map |
| Esc or P | Pause |

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in desktop Chrome

# hand-in (copies game/ and screenshots/ and writes the dossier)
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

# re-take the screenshots from the game's own shot mode (headless Chrome)
node tools/shoot.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
