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
export const maxHeatFor = (mode = CONFIG.defaultMode) => (mode === 'chill' ? CONFIG.modes.chill.maxHeat : MAX_HEAT);
export const nextHeat = (heat, mode = CONFIG.defaultMode) => Math.min(maxHeatFor(mode), heat + 1);

export function difficultyAt(heat, mode = CONFIG.defaultMode) {
  if (mode === 'chill') {
    const m = CONFIG.modes.chill;
    const h = Math.max(0, Math.min(m.maxHeat, heat));
    const extra = Math.max(0, h - (D.length - 1));
    return {
      target: Math.min(m.maxTarget, CONFIG.rounds.baseTarget + Math.floor((h + 1) / 2) * CONFIG.rounds.targetPerRound),
      speed: Number((m.enemySpeedFactor * (1 + Math.min(0.08, extra * D.speedPerHeat * 0.5))).toFixed(6)),
      interval: Number((m.spawnIntervalFactor * (1 - Math.min(0.06, extra * D.spawnReductionPerHeat * 0.5))).toFixed(6)),
    };
  }
  const h = Math.max(0, Math.min(MAX_HEAT, heat));
  const extra = Math.max(0, h - (D.length - 1));
  return {
    target: Math.min(CONFIG.rounds.maxTarget, CONFIG.rounds.baseTarget + h * CONFIG.rounds.targetPerRound),
    speed: 1 + Math.min(D.maxSpeedBonus, extra * D.speedPerHeat),
    interval: 1 - Math.min(D.maxSpawnReduction, extra * D.spawnReductionPerHeat),
  };
}

/** Called only for normal cups, after the existing tea/fortune safety cap. */
export function withHeat(modifiers, heat, chapter, mode = CONFIG.defaultMode) {
  const d = difficultyAt(heat, mode);
  const maxOverall = mode === 'chill' ? CONFIG.modes.chill.maxOverallSpeed : D.maxOverallSpeed;
  return {
    ...modifiers,
    enemySpeedMultiplier: Math.min(maxOverall / chapter.enemySpeed, modifiers.enemySpeedMultiplier * d.speed),
    spawnIntervalMultiplier: modifiers.spawnIntervalMultiplier * d.interval,
  };
}

export const DAY_CAPTIONS = Object.freeze([
  'The spoon has submitted an overtime invoice.',
  'The tea has requested a less competent spoon.',
  'Tomorrow has already put the kettle on.',
  'The leaves are rehearsing their next escape.',
]);
