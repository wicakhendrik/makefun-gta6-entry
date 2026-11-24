// The story of Marco Vela vs. Victor Crane: contacts, dialogue and the six main missions, built from mission steps.

import { POI, PARK_LANE, CITY_MAX, blockCenter } from '../world/city.js';
import { lanePoint, headingOfDir } from '../world/roads.js';
import { Steps } from './missions.js';

export const CONTACTS = {
  lou: { name: 'Lou Santi', poi: 'garage', color: [1, 0.42, 0.75], role: 'Chop-shop owner, Marco\'s aunt' },
  teo: { name: 'Teo Bravo', poi: 'lounge', color: [0.3, 0.9, 1], role: 'Fixer at the Ocelot Lounge' },
  marr: { name: 'Det. Ilsa Marr', poi: 'precinct', color: [0.55, 0.62, 1], role: 'Solara PD detective' },
};

const say = (who, text) => ({ who, text });
const MARCO = 'MARCO', LOU = 'LOU', TEO = 'TEO', MARR = 'DET. MARR';

export const STORY = [
  {
    id: 'homecoming', title: 'Homecoming', giver: 'lou', reward: 500, unlock: ['pistol'], unlockText: 'Hornet 9 pistol',
    build: () => [
      Steps.talk([
        say(LOU, 'Marco Vela. Five years and not one postcard. Look at you.'),
        say(MARCO, 'Missed you too, Tía. Heard the shop is in trouble.'),
        say(LOU, 'Crane Holdings bought the whole block. Rent tripled. I need cars to strip, and fast.'),
        say(LOU, 'Show me you still have the hands. Bring me a ride — any ride.'),
      ]),
      Steps.stealAny('Steal a car. Walk up to one and press F.'),
      Steps.goTo(POI.garage, "Drive it to Lou's Body & Soul in Cinder Row.", { inVehicle: true, radius: 6 }),
    ],
    outro: [say(LOU, "Still got it. Take my old Hornet 9 — Crane's people don't ask nicely.")],
  },
  {
    id: 'special_order', title: 'Special Order', giver: 'lou', requires: ['homecoming'], reward: 1500,
    build: (g) => {
      let vanta = null;
      return [
        Steps.talk([
          say(LOU, 'A buyer wants a Kestrel Vanta. Red. Crane\'s nephew parks one on Ocean Drive like he owns the street.'),
          say(MARCO, 'He kind of does.'),
          say(LOU, 'Not tonight. It\'s alarmed, so expect company.'),
        ]),
        Steps.run((g2, a) => {
          vanta = g2.missions.own(g2.spawnVehicle('vanta', CITY_MAX + PARK_LANE, 430, Math.PI, '#e8322e'));
          vanta.parked = true; vanta.persistentMission = true;
        }),
        Steps.enterVehicle(() => vanta, 'Steal the red Kestrel Vanta on Ocean Drive.'),
        Steps.setWanted(2),
        Steps.loseWanted('The alarm tripped. Lose the cops.'),
        Steps.deliver(() => vanta, POI.garage, 'Deliver the Vanta to the garage.'),
      ];
    },
    outro: [say(LOU, 'Barely a scratch. The buyer will pay double. You\'re a natural, mijo.')],
  },
  {
    id: 'debt_collector', title: 'Debt Collector', giver: 'teo', requires: ['homecoming'], reward: 2000,
    build: (g) => {
      let car = null, rocco = null, bag = null;
      const [sx, sz] = lanePoint(1, 9, 0, 30);
      return [
        Steps.talk([
          say(TEO, 'Marco! The prodigal driver. Sit, sit. I have work.'),
          say(TEO, 'Rocco Fiel owes the Ocelot twenty grand. He cruises El Mercado in a mint Solano Riviera.'),
          say(TEO, 'He will run. Stop that car and take what he owes.'),
        ]),
        Steps.run((g2) => {
          car = g2.missions.own(g2.spawnVehicle('riviera', sx, sz, headingOfDir(0), '#9fe3c8'));
          rocco = g2.missions.own(g2.spawnHuman('goon', sx, sz, { weapon: 'fist' }));
          rocco.vehicle = car; rocco.state = 'driving'; car.driver = rocco;
          car.ai = { kind: 'parked' };
        }),
        {
          text: 'Find Rocco in El Mercado.',
          target: () => (car ? { x: car.x, z: car.z, entity: car } : null),
          update: (g2) => (Math.hypot(car.x - g2.player.x, car.z - g2.player.z) < 45 ? 'done' : null),
        },
        Steps.run((g2) => {
          car.ai = { kind: 'flee', i: 1, j: 9, d: 0, next: 0, cruise: 23 };
          g2.hud.queueDialogue([say('ROCCO', 'Teo sent you? Tell him to come himself!')]);
        }),
        Steps.destroyVehicle(() => car, "Stop Rocco's Riviera — ram it or shoot it!", { stopAt: 380, escapeDist: 380 }),
        Steps.run((g2) => {
          if (rocco.vehicle) {
            const [dx, dz] = car.doorPoint();
            rocco.vehicle = null; car.driver = null; rocco.x = dx; rocco.z = dz; rocco.state = 'walk';
            if (!g2.humans.includes(rocco)) g2.humans.push(rocco);
          }
          car.ai = null;
          rocco.ai = { mode: 'runaway' };
          g2.hud.queueDialogue([say('ROCCO', 'Okay, okay! Not the face!')]);
        }),
        Steps.killAll(() => [rocco], 'Take Rocco down.'),
        Steps.run((g2) => { bag = { x: rocco.x, z: rocco.z }; g2.activities.dropBag(bag.x, bag.z); }),
        { text: 'Grab the cash.', target: () => bag, update: (g2) => (Math.hypot(bag.x - g2.player.x, bag.z - g2.player.z) < 2.5 ? (g2.activities.takeBag(), 'done') : null) },
        Steps.goTo(POI.lounge, 'Bring the money to Teo at the Ocelot Lounge.'),
      ];
    },
    outro: [say(TEO, 'Twenty grand, with interest. You are going to fit right back in, hermano.')],
  },
  {
    id: 'pier9', title: 'Pier 9', giver: 'teo', requires: ['debt_collector', 'special_order'], reward: 3000, unlock: ['smg'], unlockText: 'Wasp MP unlocked',
    build: (g) => {
      const goons = [];
      const ledger = { x: POI.warehouse.x + 2, z: POI.warehouse.z + 4 };
      return [
        Steps.talk([
          say(TEO, 'Word is Crane keeps a ledger. Every bribe, every cop, every fire on the Strand.'),
          say(TEO, 'It sits in a warehouse at Pier 9, guarded by his crew. Go loud or go home.'),
        ]),
        Steps.run((g2) => {
          g2.player.ammo.pistol = Math.max(g2.player.ammo.pistol || 0, 60);
          const offs = [[-22, -2], [-12, 3], [-3, -6], [8, 2], [16, -4], [24, 3], [0, 2]];
          for (const [ox, oz] of offs) {
            const h = g2.missions.own(g2.spawnHuman('goon', POI.warehouse.x + ox, POI.warehouse.z + oz, { weapon: goons.length % 3 === 0 ? 'smg' : 'pistol' }));
            h.ai = { mode: 'idle', alertRange: 40, range: 12 + Math.random() * 8 };
            goons.push(h);
          }
        }),
        Steps.goTo(POI.warehouse, 'Go to the Pier 9 warehouse in Saltmarsh Docks.', { radius: 45 }),
        Steps.killAll(() => goons, "Take out Crane's crew."),
        Steps.goTo(ledger, 'Grab the ledger.', { radius: 2.5 }),
        Steps.setWanted(2),
        Steps.loseWanted('Somebody called it in. Lose the cops.'),
        Steps.goTo(POI.lounge, 'Bring the ledger to Teo.'),
      ];
    },
    outro: [
      say(TEO, 'Names. Dates. Payments. Half the precinct is in here.'),
      say(TEO, 'A detective called — Ilsa Marr. She says she can put Crane away. Go see her at the precinct.'),
    ],
  },
  {
    id: 'clean_hands', title: 'Clean Hands', giver: 'marr', requires: ['pier9'], reward: 2500, unlock: ['shotgun'], unlockText: 'Mako 12 shotgun',
    build: (g) => {
      const ambush = [];
      const meet = { x: blockCenter(5), z: blockCenter(7) + 6 };
      return [
        Steps.talk([
          say(MARR, 'Detective Ilsa Marr. Teo says you have something that belongs to Victor Crane.'),
          say(MARR, 'Take it to my partner at the Halcyon Park fountain. Ninety seconds — Crane has eyes on this building.'),
        ]),
        Steps.timer(90, 'Too slow. The meeting is off.'),
        Steps.goTo(meet, 'Get to the Halcyon Park fountain.', { radius: 6 }),
        Steps.clearTimer(),
        Steps.run((g2) => {
          const ring = [[-26, -20], [24, -22], [-30, 18], [28, 20], [0, 30], [-8, -32]];
          for (const [ox, oz] of ring) {
            const h = g2.missions.own(g2.spawnHuman('goon', meet.x + ox, meet.z + oz, { weapon: ambush.length % 2 ? 'smg' : 'pistol' }));
            h.ai = { mode: 'fight', range: 14 };
            ambush.push(h);
          }
        }),
        Steps.talk([
          say(MARR, '(radio) Sorry, Marco. Crane pays better than the city ever did.'),
          say(MARCO, 'Should have known. Never trust a cop who meets in a park.'),
        ]),
        Steps.setWanted(3),
        Steps.killAll(() => ambush, 'Survive the ambush.'),
        Steps.loseWanted('Marr put out a warrant. Lose the cops.'),
      ];
    },
    outro: [say(TEO, '(phone) Marr sold you out? Then we stop playing nice. Lou has a plan — go see her.')],
  },
  {
    id: 'crane_falls', title: 'Crane Falls', giver: 'lou', requires: ['clean_hands'], reward: 10000, unlock: ['rifle'], unlockText: 'Sable AR rifle',
    build: (g) => {
      let limo = null, crane = null;
      const guards = [];
      const escorts = [];
      return [
        Steps.talk([
          say(LOU, 'Crane is leaving the city tonight. His Regent goes from the tower straight to his yacht.'),
          say(TEO, 'Two escort cars, armed. If he reaches the docks, he is gone for good.'),
          say(MARCO, 'Then he does not reach the docks.'),
        ]),
        Steps.goTo(POI.tower, 'Get to Crane Tower in Meridian.', { radius: 70 }),
        Steps.run((g2) => {
          const [lx, lz] = lanePoint(6, 5, 0, 30);
          limo = g2.missions.own(g2.spawnVehicle('regent', lx, lz, headingOfDir(0)));
          crane = g2.missions.own(g2.spawnHuman('boss', lx, lz, { weapon: 'pistol' }));
          crane.vehicle = limo; crane.state = 'driving'; limo.driver = crane;
          limo.ai = { kind: 'flee', i: 6, j: 5, d: 0, next: 0, cruise: 21 };
          for (const along of [14, 46]) {
            const [ex, ez] = lanePoint(6, 5, 0, along);
            const car = g2.missions.own(g2.spawnVehicle('bayside', ex, ez, headingOfDir(0), '#18181c'));
            const driver = g2.missions.own(g2.spawnHuman('goon', ex, ez, { weapon: 'smg' }));
            driver.vehicle = car; driver.state = 'driving'; car.driver = driver;
            const gunner = g2.spawnHuman('goon', ex, ez, { weapon: 'smg', detached: true });
            gunner.vehicle = car;
            car.ai = { kind: 'attack', i: 6, j: 5, d: 0, next: 0, gunner };
            escorts.push(car);
          }
          g2.hud.queueDialogue([say('CRANE', '(radio) Vela? You are a mechanic. Go fix something.')]);
        }),
        Steps.destroyVehicle(() => limo, "Stop Crane's Regent limousine!", { stopAt: 900, escapeDist: 420 }),
        Steps.run((g2) => {
          if (crane.vehicle) {
            const [dx, dz] = limo.doorPoint();
            crane.vehicle = null; limo.driver = null; crane.x = dx; crane.z = dz; crane.state = 'walk';
            if (!g2.humans.includes(crane)) g2.humans.push(crane);
          }
          limo.ai = null;
          crane.ai = { mode: 'runaway' };
          for (let k = 0; k < 3; k++) {
            const h = g2.missions.own(g2.spawnHuman('goon', crane.x + (k - 1) * 3, crane.z + 3, { weapon: 'smg' }));
            h.ai = { mode: 'fight', range: 12 };
            guards.push(h);
          }
          g2.hud.queueDialogue([say('CRANE', 'Kill him! I paid for this city!')]);
        }),
        Steps.killAll(() => [crane, ...guards], 'Finish Victor Crane.'),
        Steps.talk([
          say(MARCO, 'That one was for the Strand.'),
          say(LOU, 'It\'s over, mijo. Port Solara can breathe again.'),
        ]),
      ];
    },
    outro: [say(TEO, 'Crane Tower is for sale, and I know a buyer. Welcome home, Marco.')],
  },
];
