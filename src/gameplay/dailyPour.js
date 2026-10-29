// The paper has a fixed world-space landing point at release, never a homing
// target. Only its arrival can deliver it. Route data and all jokes live here;
// drawing consumes no randomness. Fixed 120 Hz ticks match the Tea Run.
import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { awardInterlude } from './arcadeInterludes.js';

const P = CONFIG.dailyPour;
export const HEADLINES = Object.freeze([
  'LOCAL SPOON CAUSES COMMOTION', 'TEA SHORTAGE ENTERS THIRD WEEK',
  'NEIGHBORHOOD DENIES KNOWING SPOON', 'DOG EATS NEWS, DEMANDS MORE',
]);

export function planRoute(rng) {
  return Array.from({ length: P.houses }, (_, i) => {
    const subscriber = i !== 3 && i !== 7;
    const aim = i < 2 ? 'near' : rng.next() < 0.5 ? 'near' : 'far';
    return {
      id: i, x: P.speed * (P.firstAt + i * P.houseInterval) + P.targets[aim].ahead,
      subscriber, aim, radius: i < 2 ? 55 : 36, color: rng.int(4), roof: rng.int(2),
      dog: i === 3, gnome: i === 6, delivered: false, passed: false,
      deliveredAt: null, windowAt: null, dogAt: null,
    };
  });
}

export function createDailyPour(rng) {
  const houses = planRoute(rng);
  const scheduled = houses.filter((h) => h.subscriber).length;
  return {
    stage: 'intro', time: 0, clock: 0, age: 0, accumulator: 0, distance: 0,
    aim: 'near', cooldown: 0, papers: scheduled + P.sparePapers, scheduled,
    houses, flights: [], delivered: 0, misses: 0, windows: 0, dogs: 0,
    feedback: null, summary: null, headline: HEADLINES[rng.int(HEADLINES.length)],
  };
}

export function pourInProgress(state) {
  return (state.phase === PHASE.DAILY_POUR || (state.phase === PHASE.PAUSED && state.pausedFrom === PHASE.DAILY_POUR))
    ? state.dailyPour : null;
}

export function startPour(mission) {
  if (mission.stage !== 'intro') return false;
  mission.stage = 'play';
  mission.time = 0;
  return true;
}

export function aimPour(mission, aim) {
  if (mission?.stage !== 'play') return false;
  mission.aim = aim === 'near' || aim === 'far' ? aim : mission.aim === 'near' ? 'far' : 'near';
  return true;
}

export function throwPaper({ state, emit }) {
  const m = state.dailyPour;
  if (m?.stage !== 'play' || m.cooldown > 1e-9 || m.papers <= 0) return false;
  const target = P.targets[m.aim];
  m.flights.push({ start: m.distance, x: m.distance + target.ahead, aim: m.aim,
    elapsed: 0, duration: target.flight, landed: false, outcome: null });
  m.papers--;
  m.cooldown = P.cooldown;
  emit('paperThrow');
  return true;
}

function feedback(m, text) { m.feedback = { text, at: m.age }; }

function land({ emit }, m, paper) {
  paper.landed = true;
  const house = m.houses.find((h) => Math.abs(h.x - paper.x) <= h.radius);
  if (house?.dog && paper.aim === 'near') {
    house.dogAt = m.age;
    m.dogs++;
    paper.outcome = 'dog';
    feedback(m, 'DOG EATS NEWS, DEMANDS MORE');
    emit('paperDog');
  } else if (house && !house.subscriber && paper.aim === 'far') {
    house.windowAt = m.age;
    m.windows++;
    paper.outcome = 'window';
    feedback(m, "THAT’S NOT MY SUBSCRIPTION!");
    emit('paperWindow');
  } else if (house?.subscriber && !house.delivered && house.aim === paper.aim) {
    house.delivered = true;
    house.deliveredAt = m.age;
    m.delivered++;
    paper.outcome = 'delivery';
    feedback(m, `SPECIAL DELIVERY! ${m.delivered}/${m.scheduled}`);
    emit('paperDelivery');
  } else {
    m.misses++;
    paper.outcome = 'miss';
    feedback(m, 'SIDEWALK NOW FULLY INFORMED.');
    emit('paperMiss');
  }
}

function finish(sim, m) {
  const success = m.delivered >= Math.ceil(m.scheduled * P.successRatio);
  const perfect = m.delivered === m.scheduled && !m.misses && !m.windows && !m.dogs;
  const summary = {
    delivered: m.delivered, scheduled: m.scheduled, success, perfect,
    points: m.delivered * P.deliveryPoints + (perfect ? P.perfectBonus : 0),
    cash: success ? P.successCash : 0,
    title: perfect ? 'DELIVERY OF THE CENTURY!' : success ? 'THE NEWS HAS SPREAD.' : 'YOUR CONTRACT HAS BEEN REVIEWED.',
  };
  if (awardInterlude(sim.state, m, summary)) sim.emit('pourFinish', summary);
  m.stage = 'outro';
  m.time = 0;
}

export function updateDailyPour(sim, dt) {
  const m = sim.state.dailyPour;
  m.accumulator += dt;
  const tick = 1 / 120;
  while (m.accumulator >= tick - 1e-10) {
    m.accumulator = Math.max(0, m.accumulator - tick);
    m.time += tick;
    m.age += tick;
    if (m.stage === 'intro') {
      if (m.time >= P.introTime - 1e-9) { startPour(m); sim.emit('pourGo'); }
      continue;
    }
    if (m.stage !== 'play') continue;
    m.clock = Math.min(P.duration, m.clock + tick);
    if (m.clock >= P.duration - 1e-9) m.clock = P.duration;
    m.distance = P.speed * m.clock;
    m.cooldown = Math.max(0, m.cooldown - tick);
    for (const paper of m.flights) {
      paper.elapsed += tick;
      if (!paper.landed && paper.elapsed >= paper.duration - 1e-9) land(sim, m, paper);
    }
    m.flights = m.flights.filter((p) => p.elapsed < p.duration + 0.8);
    for (const h of m.houses) {
      if (!h.passed && h.x < m.distance - 90) {
        h.passed = true;
        if (h.subscriber && !h.delivered) {
          feedback(m, 'MISSED SUBSCRIBER. THE KETTLE WILL HEAR OF THIS.');
          sim.emit('paperPassed', { id: h.id });
        }
      }
    }
    // Settle every last paper before displaying results, even one released at the finish line.
    if (m.clock >= P.duration - 1e-9 && !m.flights.some((p) => !p.landed)) finish(sim, m);
  }
}
