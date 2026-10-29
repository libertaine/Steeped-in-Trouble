// Days control combat pressure; chapters, teas and adventures keep their own clocks.
import { CONFIG } from '../config.js';

const D = CONFIG.days;

export const dayOf = (round) => Math.floor((round - 1) / D.length) + 1;
export const cupOfDay = (round) => (round - 1) % D.length + 1;
export const endsDay = (round) => round % D.length === 0;

// Stop storing extra Heat once every component has saturated.
export const MAX_HEAT = Math.max(
  Math.ceil((CONFIG.rounds.maxTarget - CONFIG.rounds.baseTarget) / CONFIG.rounds.targetPerRound),
  D.length - 1 + Math.ceil(D.maxSpeedBonus / D.speedPerHeat),
  D.length - 1 + Math.ceil(D.maxSpawnReduction / D.spawnReductionPerHeat),
);
export const nextHeat = (heat) => Math.min(MAX_HEAT, heat + 1);

export function difficultyAt(heat) {
  const h = Math.max(0, Math.min(MAX_HEAT, heat));
  const extra = Math.max(0, h - (D.length - 1));
  return {
    target: Math.min(CONFIG.rounds.maxTarget, CONFIG.rounds.baseTarget + h * CONFIG.rounds.targetPerRound),
    speed: 1 + Math.min(D.maxSpeedBonus, extra * D.speedPerHeat),
    interval: 1 - Math.min(D.maxSpawnReduction, extra * D.spawnReductionPerHeat),
  };
}

/** Called only for normal cups, after the existing tea/fortune safety cap. */
export function withHeat(modifiers, heat, chapter) {
  const d = difficultyAt(heat);
  return {
    ...modifiers,
    enemySpeedMultiplier: Math.min(D.maxOverallSpeed / chapter.enemySpeed, modifiers.enemySpeedMultiplier * d.speed),
    spawnIntervalMultiplier: modifiers.spawnIntervalMultiplier * d.interval,
  };
}

export const DAY_CAPTIONS = Object.freeze([
  'The spoon has submitted an overtime invoice.',
  'The tea has requested a less competent spoon.',
  'Tomorrow has already put the kettle on.',
  'The leaves are rehearsing their next escape.',
]);
