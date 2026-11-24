// Car-versus-person contacts: shove people out of the way at low speed, run them down at high speed.

export function resolveVehicleHumanContacts(game) {
  for (const v of game.vehicles) {
    const sp = v.speed;
    const c = Math.cos(v.heading), s = Math.sin(v.heading);
    const hw = v.spec.wid / 2 + 0.35, hl = v.spec.len / 2 + 0.35;
    for (const h of game.humans) {
      if (h.vehicle || h.state === 'dead' && sp < 4) continue;
      const dx = h.x - v.x, dz = h.z - v.z;
      if (dx * dx + dz * dz > (hl + 1) * (hl + 1)) continue;
      // into the car's local frame
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) > hw || Math.abs(lz) > hl) continue;
      if (h.state === 'dead') continue;
      if (sp > 5.5 && h.state !== 'knocked') {
        const dmg = sp * 4.5;
        const driver = v.driver;
        h.knock(v.vx * 0.8 + (Math.random() - 0.5) * 3, v.vz * 0.8 + (Math.random() - 0.5) * 3, 3 + sp * 0.15, game);
        h.takeDamage(dmg, game, driver, 'vehicle');
        game.audio.thud(h.x, h.z);
        game.fx.blood(h.x, 1, h.z);
        v.vx *= 0.94; v.vz *= 0.94;
        if (driver && driver.isPlayer && h.role !== 'goon') game.police.crime('hitped');
        game.events.emit('runOver', h, v);
      } else {
        // push out of the box along the shortest axis
        const px = hw - Math.abs(lx), pz = hl - Math.abs(lz);
        let ox = 0, oz = 0;
        if (px < pz) ox = Math.sign(lx) * px; else oz = Math.sign(lz) * pz;
        h.x += ox * c + oz * s;
        h.z += -ox * s + oz * c;
      }
    }
  }
}
