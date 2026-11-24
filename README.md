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
- **Cars to steal and drive**: nine original models (Kestrel Vanta, Solano Riviera, Marlin Bayside,
  Tamarind Cub, Orca Hauler, Gannet Ranchero, Brisa Cab, SPD Interceptor, Crane Regent) with arcade handling,
  handbrake drifts, damage, smoke, fire and explosions. Pull drivers out of their seats.
- **Wanted level and police tactics**: five stars of heat and witnesses. Every pursuit car gets a call sign and
  a tactic, re-planned twice a second: ramming when close, flanking alongside to box you in, closing in over the
  road grid, or searching around your last sighting once they lose you. From two stars they set roadblocks of
  parked cruisers and armed officers across the road ahead of you; from three a helicopter hunts you with a
  spotlight cone that has to keep up with your car (outrun it to break contact); from four its gunner fires
  while the light is on you. A **dispatch panel** lists every unit with call sign, distance and tactic, the
  unit count, the stars and the police radio chatter. Break line of sight to lose them, or pay Lou for a respray.
- **Story and missions**: six story missions with dialogue (stealing to order, a car chase, a dockside
  gunfight, a betrayal and a finale against Crane's limousine and bodyguards).
- **Activities**: two street races against AI drivers, Brisa Cab taxi fares with streak bonuses (press E in
  any cab), Lou's export list, twelve hidden Sun Tokens,
  the Bolt & Barrel gun shop, pickups for health, armor and ammo, and cash for every job.
- **Combat**: seven weapon slots (fists, Palmwood bat, Hornet 9 pistol, Wasp MP, Mako 12 shotgun, Sable AR rifle,
  Comet RL rocket launcher) with clips and reloads, hitscan bullets, head shots, tracers, muzzle flashes, rockets
  with smoke trails and explosions, drive-by shooting from cars and blast damage.
- **Crew and respect**: call in Lou (Z: patch up your car), Teo (X: $500 to drop a wanted star) or Nyla
  (C: armor and ammo drop), each on a cooldown; respect points from missions, fights, wheels and fares raise your
  street rank from Street Rat to Island Boss.
- **HUD and menus**: rotating minimap with blips and roadblocks, full map, wanted stars, cash, police dispatch
  panel, weapon slot bar with clip and reserve, mission tracker (giver portrait, stage x/y bar, current and NEXT
  step, timer), dialogue with procedurally drawn character portraits whose lips move, crew cards with cooldowns,
  rank bar, labelled health and armor bars, vehicle panel (speed, gear, condition), radio panel with the station
  and current song, district names, title screen, pause menu, settings, stats.
- **Radio**: three procedural stations with three original songs each (for example "Neon Undertow" by Vela
  Static on SUNWAVE 88.1); each song reseeds the melody, and the HUD shows what is playing when it changes.
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
| Q / E / mouse wheel / 1-7 | Switch weapon (locked slots are padlocked) |
| R | Reload |
| Z / X / C | Crew: Lou repair, Teo bribe, Nyla supply drop |
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
