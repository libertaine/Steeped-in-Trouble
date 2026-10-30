// Imported only into the existing ?debug + development gate. These fixtures
// drive real settlement/checkpoint paths; no fixture is shipped to production.
export function prepareRecord(sessions) {
  if (!sessions.practice) return false;
  const game = sessions.game, m = game.practiceMission();
  if (m.stage !== 'intro') return false;
  game.primaryAction();
  switch (game.practice) {
    case 'teaRun': m.obstacles = []; m.pickups = []; m.distance = m.finish - 1; m.coins = 8; break;
    case 'dailyPour': m.delivered = m.scheduled; break;
    case 'biscuitBreakout': m.broken = m.total; break;
    case 'crossingStreet': m.lanes.forEach((l) => { l.vehicles = []; }); m.spoon.row = 6; game.hop('up'); break;
  }
  for (let i = 0; i < 60 * 60; i++) game.update(1 / 60);
  sessions.settle();
  return !!m.summary;
}

export function prepareCheckpoint(sessions) {
  if (sessions.practice || sessions.collection) return false;
  const game = sessions.game, s = game.state;
  if (s.phase === 'ready') game.primaryAction();
  if (s.phase !== 'playing') return false;
  s.spawnTimer = 1000; s.current = null; s.modifiers.laneDrift = false; s.kills = s.target - 1;
  s.enemies = [{ angle: s.angle, radius: 180, speed: 0, wiggle: 0, shifted: false, size: 10, alpha: 1 }];
  s.shots = [{ angle: s.angle, radius: 180, speed: 0, sugar: false, veer: 0, golden: false }];
  game.update(1 / 120);
  return game.exportCheckpoint();
}
