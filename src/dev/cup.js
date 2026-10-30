// Imported only by the DEV branch in main.js; Vite removes it from production.
//
// Playtesting shortcuts for The Cup Remembers: ?debug&cup=<mode>&seed=42.
// Each one plays the real simulation: leaves genuinely spill over the rim, the
// Golden Leaf is spawned by its own stream, and repairs are real steam hits.
// Only the waiting is skipped (no new leaves arrive, and a Golden Leaf can be
// called up at once instead of waiting for its 15% chance).
import { CONFIG } from '../config.js';
import { laneAngle } from '../gameplay/arena.js';
import { POT_KEY } from '../storage/localProgress.js';
import legacy from '../../tests/fixtures/pot-0.16.0.json';

export const CUP_MODES = Object.freeze(['healthy', 'cracked', 'critical', 'leaf', 'repair', 'seams', 'shatter']);
const TICK = 1 / 60;

function run(game, seconds) {
  for (let t = 0; t < seconds; t += TICK) game.update(TICK);
}

function hush(state) {
  Object.assign(state, { spawnTimer: 1000, current: null, enemies: [] });
  state.modifiers.laneDrift = false;
}

/** A genuine damaging escape down `lane`, then the cup's grace period passes. */
function spill(game, lane) {
  const s = game.state;
  hush(s);
  Object.assign(s, { strainerLeft: 0, graceTime: 0 });
  s.enemies.push({ angle: laneAngle(lane), radius: CONFIG.arena.rimRadius - 6, speed: 60, wiggle: 0, shifted: false,
    size: 10, alpha: 1 });
  const lives = s.lives;
  for (let i = 0; i < 60 && s.lives === lives; i++) game.update(TICK);
  if (s.phase === 'playing') run(game, CONFIG.grace.duration + 0.1);
}

/** Call up this cup's Golden Leaf now, from its own stream. */
function offerLeaf(game) {
  game.state.goldenLeafTimer = TICK / 2;
  game.update(TICK);
  return !!game.state.goldenLeaf;
}

/** Aim at the Golden Leaf and steam it. */
function steamLeaf(game) {
  const s = game.state;
  if (!s.goldenLeaf && !offerLeaf(game)) return false;
  s.angle = s.goldenLeaf.home;
  s.shotCooldown = 0;
  game.fireSteam();
  for (let i = 0; i < 90 && s.goldenLeaf; i++) game.update(TICK);
  return !s.goldenLeaf;
}

/** A fresh pot from this seed's generators, brewed straight into cup 1 with no leaves arriving. */
export function prepareCup(game, mode) {
  if (!CUP_MODES.includes(mode)) return false;
  game.state.phase = 'gameover';
  game.restart();
  hush(game.state);
  if (mode === 'healthy') return true;
  spill(game, 3);
  if (mode === 'cracked') return true;
  if (mode === 'repair') return steamLeaf(game);
  if (mode === 'seams') {
    // Three cracks mended in gold, at different places, and one still open.
    for (const lane of [11, 6]) {
      spill(game, lane);
      steamLeaf(game);
    }
    steamLeaf(game);
    spill(game, 14);
    return true;
  }
  spill(game, 11);
  if (mode === 'leaf') return offerLeaf(game);
  if (mode === 'critical') return true;
  spill(game, 7); // shatter
  return game.state.phase === 'gameover';
}

/**
 * ?cup=migrated: before the save is read, store an authentic 0.16.0 pot (a
 * critical cup with an upgrade pending), so Continue Your Pot migrates it.
 * This replaces any pot saved in this browser.
 */
export function seedLegacyPot(storage) {
  try {
    storage?.setItem(POT_KEY, JSON.stringify(legacy.checkpoints.critical));
    return true;
  } catch {
    return false;
  }
}
