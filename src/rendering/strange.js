// Mushroom Tea's Strange Happenings: now and then the game itself misbehaves.
//
// Presentation only, like effects.js. Nothing here changes game state or
// draws from a gameplay generator. Each cup's chances come from a tiny
// generator of its own, derived from the pot's seed and the cup's number, so
// the same seed always brings the same happenings in the same cups, and a
// restored pot or a restart needs nothing saved.
//
// - Time Rewind: play stops for a moment while the last few seconds run
//   backwards (from a short recording of what was drawn: never the
//   simulation) and then catch up again. While it holds, the simulation is
//   not advanced at all, exactly as if paused, so nothing is lost or gained.
// - The Cup Is Breathing: the broth swells and settles. Only the liquid's
//   picture changes; every leaf, hitbox and the spoon stay where they are.
// - The Impostor Spoon: a translucent spoon follows the real one's recorded
//   path a second behind, with ideas of its own. It cannot touch anything.
//
// One at a time, at most one a cup, never in the first cup, and only while a
// Mushroom Tea cup is being played. The controller's clock is the cup's play
// time: it stops while paused, between cups, and behind every menu.
//
// Output: `view` (read by the renderer, tea painter and soundtrack), `shown()`
// (the state to draw: during a rewind, a recorded one), `holding` (main.js
// skips the simulation and the spoon's actions while true), and presentation
// events (drainEvents()) for effects and audio: strangeStart, strangeEnd,
// rewindReverse, rewindForward, strangeBreath, impostorAppear, impostorPuff,
// impostorVanish and strangeQuip.

import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { createRandom, toSeed } from '../core/random.js';
import { TAU, angleDifference } from '../gameplay/arena.js';

const S = CONFIG.strange;
const RW = S.rewind;
const BR = S.breathing;
const IM = S.impostor;
const RIM = CONFIG.arena.rimRadius;

export const STRANGE_SALT = 0x5747a9e5;
export const STRANGE_KINDS = Object.freeze(['rewind', 'breathing', 'impostor']);

/**
 * What the game says afterwards, if anything. `when` is the moment a line
 * belongs to. The first rewind anyone sees always gets the first line.
 */
export const STRANGE_LINES = Object.freeze({
  rewind: Object.freeze([
    { text: 'That wasn’t in the patch notes.', when: 'after' },
    { text: 'Did that really happen?', when: 'after' },
    { text: 'What was that?', when: 'after' },
    { text: 'We don’t talk about that.', when: 'after' },
  ]),
  breathing: Object.freeze([
    { text: 'Is anyone else seeing this?', when: 'during' },
    { text: 'The cup says it was nothing.', when: 'after' },
    { text: 'Please don’t feed the porcelain.', when: 'after' },
  ]),
  impostor: Object.freeze([
    { text: 'I don’t remember hiring you.', when: 'appear' },
    { text: 'There are two of us now?', when: 'appear' },
    { text: 'Management denies the second spoon.', when: 'vanish' },
  ]),
});

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

/** A cup's own little generator. Cup 0 decides when the first happening comes. */
export function cupRandom(seed, cup) {
  return createRandom(toSeed(toSeed(seed) ^ STRANGE_SALT ^ Math.imul(cup, 0x9e3779b1)));
}

function weighted(pairs, r) {
  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  let x = r * total;
  for (const [value, w] of pairs) {
    x -= w;
    if (x < 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

/**
 * The happenings planned for cups 1..cups, as an array indexed by cup
 * (null where there is none). Pure: the same seed always gives the same plan.
 * Every cup's generator draws the same five numbers whether or not it has a
 * happening, so changing a rule for one cup never reshuffles the others.
 */
export function strangeSchedule(seed, cups) {
  const plans = [null];
  const first = cupRandom(seed, 0);
  let next = S.firstCups[Math.min(S.firstCups.length - 1, Math.floor(first.next() * S.firstCups.length))];
  let last = null;
  for (let cup = 1; cup <= cups; cup++) {
    const rng = cupRandom(seed, cup);
    const pick = rng.next();
    const start = rng.range(S.startMin, S.startMax);
    const variant = rng.next();
    const quip = rng.next();
    const gap = rng.next();
    if (cup !== next) {
      plans.push(null);
      continue;
    }
    const kind = weighted(STRANGE_KINDS.filter((k) => k !== last).map((k) => [k, S.weights[k]]), pick);
    plans.push({ cup, kind, start, variant, quip });
    last = kind;
    next = cup + weighted(S.gaps, gap);
  }
  return plans;
}

/**
 * The rules for what is said. The first happening of each kind in a session
 * always says something (so it reads as deliberate, not as a fault), and the
 * first rewind's line is always the first. Later, a share pass in silence, and
 * no line comes round again until the others have been heard.
 */
export function createLineBook() {
  const seen = new Set();
  const used = Object.fromEntries(STRANGE_KINDS.map((kind) => [kind, new Set()]));
  const last = {};
  return {
    /** The line for a happening about to begin (null: silence), from one number in [0, 1). */
    choose(kind, quip) {
      const first = !seen.has(kind);
      seen.add(kind);
      const pool = STRANGE_LINES[kind];
      if (first && kind === 'rewind') return pool[0];
      if (!first && quip < S.silence) return null;
      let open = pool.filter((line) => !used[kind].has(line.text));
      if (!open.length) {
        used[kind].clear();
        open = pool.filter((line) => line.text !== last[kind]);
      }
      // The rest of the number spreads across the lines still to be heard.
      const u = first ? quip : (quip - S.silence) / (1 - S.silence);
      return open[Math.min(open.length - 1, Math.floor(clamp(u, 0, 0.999999) * open.length))];
    },
    /** A line was actually said. */
    said(kind, text) {
      used[kind].add(text);
      last[kind] = text;
    },
  };
}

/** One reusable history sample. */
function createSlot() {
  const pool = (n, make) => Array.from({ length: n }, make);
  return {
    t: 0, angle: 0, score: 0, kills: 0, steams: 0,
    enemies: [], shots: [], spores: [], residue: [],
    enemyPool: pool(RW.maxEnemies, () => ({
      kind: 'leaf', radius: 0, angle: 0, size: 0, wiggle: 0, giggle: 0, alpha: 1, karma: false, backwash: 0,
      dart: { stage: null }, wander: { stage: null, dir: 1 }, puff: { stage: 'waiting', time: 0, warn: 1 },
    })),
    shotPool: pool(RW.maxShots, () => ({ radius: 0, angle: 0, cream: false, veer: 0, golden: false, sugar: false, nova: false })),
    sporePool: pool(RW.maxSpores, () => ({ angle: 0, radius: 0, time: 0, duration: 1 })),
  };
}

function copyEnemy(to, e) {
  to.kind = e.kind;
  to.radius = e.radius;
  to.angle = e.angle;
  to.size = e.size;
  to.wiggle = e.wiggle ?? 0;
  to.giggle = e.giggle ?? 0;
  to.alpha = e.alpha ?? 1;
  to.karma = !!e.karma;
  to.backwash = e.backwash ?? 0;
  to.dart.stage = e.dart?.stage ?? null;
  to.wander.stage = e.wander?.stage ?? null;
  to.wander.dir = e.wander?.dir ?? 1;
  to.puff.stage = e.puff?.stage ?? 'waiting';
  to.puff.time = e.puff?.time ?? 0;
  to.puff.warn = e.puff?.warn ?? 1;
}

function copyShot(to, s) {
  to.radius = s.radius;
  to.angle = s.angle;
  to.cream = !!s.cream;
  to.veer = s.veer ?? 0;
  to.golden = !!s.golden;
  to.sugar = !!s.sugar;
  to.nova = !!s.nova;
}

/**
 * @param {{ reduced?: () => boolean, seed?: () => number, mode?: string | null }} [options]
 *   `reduced`: is motion reduced? `seed`: the current pot's seed. `mode` (testing):
 *   'off', 'often' (one every cup), or a kind (that one in the next Mushroom Tea cup, soon after it starts).
 */
export function createStrangeHappenings({ reduced = () => false, seed = () => 0, mode = null } = {}) {
  const events = [];
  const emit = (type, data = {}) => events.push({ type, ...data });

  let watched = null; // the state being watched: a new one (a restored pot, a practice) starts afresh
  let plans = [null];
  let planSeed = null;
  let forced = mode && STRANGE_KINDS.includes(mode) ? mode : null; // a kind still to be forced
  let clock = 0; // seconds of play in this cup
  let consumed = false; // this cup has had its happening (or its moment has passed)
  let cupForced = null; // { kind, start } forced into this cup
  let armedAt = null; // the rewind's moment has come; it waits for a leaf to fall
  let lastKill = -Infinity;
  let steams = 0; // steam shots seen this cup
  let active = null;

  // The recording: a ring of samples of what was drawn, made only during Mushroom Tea.
  let slots = null;
  let head = -1;
  let count = 0;
  let nextSample = 0;

  const lines = createLineBook(); // what has been said this session (the page's lifetime, not the pot's)

  let proxy = null; // a recorded state to draw, falling through to the live one for everything not recorded
  let proxied = null;

  const puffs = Array.from({ length: IM.puffs }, () => ({ live: false, angle: 0, age: 0 }));
  const rings = [];
  const view = {
    kind: null,
    holding: false,
    rewind: { stage: null, tint: 0, icon: null, back: 0 },
    breathing: { intensity: 0, breath: 0, rings },
    impostor: { angle: 0, opacity: 0, scale: 1, puffs, look: 1 },
  };

  function clearHistory() {
    head = -1;
    count = 0;
    nextSample = 0;
  }

  function resetCup() {
    finish(true);
    clock = 0;
    consumed = false;
    cupForced = null;
    armedAt = null;
    lastKill = -Infinity;
    steams = 0;
    clearHistory();
  }

  function planFor(cup) {
    const s = seed();
    if (s !== planSeed) {
      planSeed = s;
      plans = [null];
    }
    if (cup >= plans.length) plans = strangeSchedule(planSeed, Math.max(cup, plans.length * 2, 16));
    return plans[cup] ?? null;
  }

  function capture(state) {
    slots ??= Array.from({ length: Math.ceil(RW.history * RW.sampleRate) + 2 }, createSlot);
    head = (head + 1) % slots.length;
    count = Math.min(count + 1, slots.length);
    const slot = slots[head];
    slot.t = clock;
    slot.angle = state.angle;
    slot.score = state.score;
    slot.kills = state.kills;
    slot.steams = steams;
    slot.enemies.length = 0;
    for (let i = 0; i < state.enemies.length && i < RW.maxEnemies; i++) {
      copyEnemy(slot.enemyPool[i], state.enemies[i]);
      slot.enemies.push(slot.enemyPool[i]);
    }
    slot.shots.length = 0;
    for (let i = 0; i < state.shots.length && i < RW.maxShots; i++) {
      copyShot(slot.shotPool[i], state.shots[i]);
      slot.shots.push(slot.shotPool[i]);
    }
    slot.spores.length = 0;
    for (let i = 0; i < (state.spores?.length ?? 0) && i < RW.maxSpores; i++) {
      Object.assign(slot.sporePool[i], state.spores[i]);
      slot.spores.push(slot.sporePool[i]);
    }
    slot.residue.length = 0;
    const residue = state.residue ?? [];
    for (let i = Math.max(0, residue.length - RW.maxResidue); i < residue.length; i++) slot.residue.push(residue[i]);
  }

  /** Seconds of play the recording covers. */
  const recorded = () => (count ? clock - slots[(head - count + 1 + slots.length) % slots.length].t : 0);

  /** The newest sample no later than `t` seconds into the cup (the oldest, if `t` is before them all). */
  function sampleAt(t) {
    let k = 0;
    while (k < count - 1 && slots[(head - k + slots.length) % slots.length].t > t) k++;
    return slots[(head - k + slots.length) % slots.length];
  }

  /** The recorded spoon angle at `t`, between samples. */
  function angleAt(t) {
    let k = 0;
    while (k < count - 1 && slots[(head - k + slots.length) % slots.length].t > t) k++;
    const a = slots[(head - k + slots.length) % slots.length];
    if (k === 0 || a.t >= t) return a.angle;
    const b = slots[(head - k + 1 + slots.length) % slots.length];
    const u = clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
    return a.angle + angleDifference(b.angle, a.angle) * u;
  }

  /** Nothing starts while a leaf is about to reach the rim. */
  const calm = (state) => !state.enemies.some((e) => e.radius > RIM - S.rimClearance);

  function speak(kind, when) {
    const line = active?.line;
    if (!line || line.when !== when || active.spoke) return;
    active.spoke = true;
    lines.said(kind, line.text);
    emit('strangeQuip', { kind, text: line.text });
  }

  function begin(kind, plan, state) {
    consumed = true;
    armedAt = null;
    const variant = plan.variant ?? 0.5;
    active = { kind, time: 0, stage: null, line: lines.choose(kind, plan.quip ?? 0.5), spoke: false, variant, reduced: reduced() };
    view.kind = kind;
    if (kind === 'rewind') {
      active.stage = 'hiccup';
      view.holding = true;
      emit('strangeStart', { kind });
    } else if (kind === 'breathing') {
      active.breaths = -1;
      active.exhaled = -1;
      rings.length = 0;
      emit('strangeStart', { kind });
    } else {
      // The impostor's two moments of independence, then its exit.
      const calmOnly = active.reduced;
      const plansOf = calmOnly ? [['bow', 'mirror'], ['mirror', 'bow'], ['bow', 'bow']]
        : [['flourish', 'mirror'], ['mirror', 'flourish'], ['mirror', 'bow']];
      active.gestures = plansOf[Math.min(2, Math.floor(variant * 3))];
      active.exit = !calmOnly && (variant * 7) % 1 < 0.5 ? 'dash' : 'fade';
      active.dir = (variant * 13) % 1 < 0.5 ? 1 : -1;
      active.offset = 0;
      active.pivot = null;
      active.steams = sampleAt(clock - IM.delay).steams;
      active.vanishing = false;
      for (const p of puffs) p.live = false;
      view.impostor.angle = angleAt(clock - IM.delay);
      view.impostor.opacity = 0;
      emit('strangeStart', { kind });
      emit('impostorAppear', { angle: view.impostor.angle });
    }
    if (state) updateActive(0, state);
  }

  /** End whatever is happening. `quiet`: a cup ending or a pause cuts it short, without a word. */
  function finish(quiet = false) {
    if (!active) return;
    const { kind } = active;
    active = null;
    view.kind = null;
    view.holding = false;
    view.rewind.stage = null;
    view.rewind.tint = 0;
    view.rewind.icon = null;
    view.breathing.intensity = 0;
    rings.length = 0;
    view.impostor.opacity = 0;
    for (const p of puffs) p.live = false;
    emit('strangeEnd', { kind, aborted: quiet });
  }

  function updateRewind(dt) {
    const a = active;
    a.time += dt;
    const r = view.rewind;
    if (a.stage === 'hiccup') {
      r.tint = smoothstep(a.time / RW.hiccup);
      r.back = 0;
      if (a.time >= RW.hiccup) {
        a.time -= RW.hiccup;
        a.stage = a.reduced ? 'stills' : 'reverse';
        r.icon = 'rewind';
        emit('rewindReverse', { reduced: a.reduced });
      }
    }
    if (a.stage === 'reverse') {
      r.tint = 1;
      r.back = RW.back * smoothstep(a.time / RW.reverse);
      if (a.time >= RW.reverse) {
        a.time -= RW.reverse;
        a.stage = 'hold';
        r.icon = 'pause';
      }
    }
    if (a.stage === 'hold') {
      r.back = RW.back;
      if (a.time >= RW.hold) {
        a.time -= RW.hold;
        a.stage = 'forward';
        r.icon = 'forward';
        emit('rewindForward', {});
      }
    }
    if (a.stage === 'forward') {
      r.back = RW.back * (1 - smoothstep(a.time / RW.forward));
      if (a.time >= RW.forward) {
        a.time -= RW.forward;
        settle();
      }
    }
    if (a.stage === 'stills') {
      // Reduced motion: a few still frames, each further back, and no fast motion at all.
      const index = Math.min(RW.stills.length - 1, Math.floor(a.time / RW.still));
      r.tint = 1;
      r.back = RW.stills[index];
      if (a.time >= RW.still * RW.stills.length) {
        a.time -= RW.still * RW.stills.length;
        settle();
      }
    }
    if (a.stage === 'settle') {
      r.back = 0;
      r.tint = 1 - smoothstep(a.time / RW.settle);
      if (a.time >= RW.settle) finish();
    }
  }

  /** Back to the present: play resumes at once, and the tint clears over it. */
  function settle() {
    active.stage = 'settle';
    view.holding = false;
    view.rewind.icon = null;
    view.rewind.back = 0;
    speak('rewind', 'after');
  }

  function updateBreathing(dt) {
    const a = active;
    a.time += dt;
    const b = view.breathing;
    const t = a.time;
    b.intensity = smoothstep(Math.min(t / BR.fadeIn, (BR.duration - t) / BR.fadeOut));
    const phase = t / BR.breath;
    b.breath = 0.5 - 0.5 * Math.cos(TAU * phase);
    const breaths = Math.floor(phase);
    if (breaths > a.breaths && t < BR.duration - BR.breath * 0.5) {
      a.breaths = breaths;
      emit('strangeBreath', { inhale: true, intensity: b.intensity });
    }
    const exhaled = Math.floor(phase - 0.5);
    if (exhaled > a.exhaled) {
      a.exhaled = exhaled;
      if (exhaled >= 0) {
        emit('strangeBreath', { inhale: false, intensity: b.intensity });
        if (!a.reduced) rings.push(0);
      }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i] += dt / BR.ringTime;
      if (rings[i] >= 1) rings.splice(i, 1);
    }
    if (t >= BR.breath * 1.6) speak('breathing', 'during');
    if (t >= BR.duration) {
      speak('breathing', 'after');
      finish();
    }
  }

  function gestureAt(t) {
    for (let i = 0; i < active.gestures.length; i++) {
      const g = active.gestures[i];
      const length = g === 'flourish' ? IM.lap : g === 'mirror' ? IM.mirror : IM.bow;
      const u = (t - IM.gestures[i]) / length;
      if (u >= 0 && u < 1) return { g, u, index: i };
    }
    return null;
  }

  function updateImpostor(dt, state) {
    const a = active;
    a.time += dt;
    const t = a.time;
    const im = view.impostor;
    const delayed = clock - IM.delay;
    const recordedAngle = angleAt(delayed);
    const end = IM.duration - IM.vanish;
    let angle = recordedAngle;
    let scale = 1;
    let opacity = IM.opacity * smoothstep(t / IM.appear);
    let polite = true;
    const gesture = gestureAt(t);
    if (gesture?.g === 'flourish') {
      // One full lap, as if showing off.
      angle += a.dir * TAU * smoothstep(gesture.u);
      polite = false;
    } else if (gesture?.g === 'mirror') {
      // It walks the other way to the spoon's recorded steps, easing in and out.
      a.pivot ??= recordedAngle;
      const w = smoothstep(Math.min(gesture.u * IM.mirror / 0.3, (1 - gesture.u) * IM.mirror / 0.3));
      angle += 2 * angleDifference(a.pivot, recordedAngle) * w;
    } else if (gesture?.g === 'bow') {
      scale = 1 - 0.16 * Math.sin(Math.PI * gesture.u);
    }
    if (gesture?.g !== 'mirror') a.pivot = null;
    if (t >= end) {
      const u = clamp((t - end) / IM.vanish, 0, 1);
      if (!a.vanishing) {
        a.vanishing = true;
        speak('impostor', 'vanish');
        emit('impostorVanish', { angle: im.angle, exit: a.exit });
      }
      opacity = IM.opacity * (1 - smoothstep(u));
      if (a.exit === 'dash') {
        angle += a.dir * (TAU / 4) * u * u;
        polite = false;
      } else {
        scale *= 1 + 0.25 * u;
      }
    }
    // It keeps a polite distance from the real spoon, so the real one is never hidden.
    // It stays on whichever side it is already showing, rather than swinging through.
    const d = angleDifference(angle, state.angle);
    const side = Math.sign(angleDifference(angle + a.offset, state.angle) || d || a.dir);
    const want = polite && Math.abs(d) < IM.personalSpace ? side * IM.sidestep - d : 0;
    a.offset += (want - a.offset) * Math.min(1, dt * 10);
    im.angle = angle + a.offset;
    im.scale = scale;
    im.opacity = opacity;
    im.look = Math.sign(angleDifference(state.angle, im.angle)) || 1;
    if (t >= 2.2) speak('impostor', 'appear');
    // Pretend steam, wherever the recording fired: hollow rings that never touch a leaf.
    const fired = sampleAt(delayed).steams;
    if (fired > a.steams) {
      a.steams = fired;
      if (!a.vanishing && opacity > IM.opacity * 0.5) {
        const puff = puffs.find((p) => !p.live);
        if (puff) {
          puff.live = true;
          puff.angle = im.angle;
          puff.age = 0;
          emit('impostorPuff', { angle: im.angle });
        }
      }
    }
    for (const p of puffs) {
      if (!p.live) continue;
      p.age += dt;
      if (p.age >= IM.puffLife) p.live = false;
    }
    if (t >= IM.duration) finish();
  }

  function updateActive(dt, state) {
    if (active.kind === 'breathing') updateBreathing(dt);
    else if (active.kind === 'impostor') updateImpostor(dt, state);
  }

  /** The happening due in this cup, if any: forced, or planned. */
  function dueNow(state) {
    if (consumed || mode === 'off') return null;
    if (cupForced) return cupForced;
    if (forced) {
      cupForced = { kind: forced, start: 4, quip: 0.5, variant: 0.5, eager: true };
      forced = null;
      return cupForced;
    }
    if (mode === 'often') {
      const plan = planFor(state.round);
      cupForced = { kind: STRANGE_KINDS[(state.round - 1) % STRANGE_KINDS.length], start: plan?.start ?? S.startMin,
        quip: plan?.quip ?? 0.5, variant: plan?.variant ?? 0.5 };
      return cupForced;
    }
    return planFor(state.round);
  }

  function maybeBegin(state) {
    const plan = dueNow(state);
    if (!plan || clock < plan.start || !calm(state)) return;
    if (plan.kind === 'rewind') {
      if (recorded() < RW.back) return;
      armedAt ??= clock;
      // Best just after a leaf falls, so it can come back; it will not wait forever.
      const fresh = clock - lastKill < 1.2;
      if (!fresh && !plan.eager && clock - armedAt < RW.waitForKill) return;
    } else if (plan.kind === 'impostor' && recorded() < IM.delay) {
      return;
    }
    begin(plan.kind, plan, state);
  }

  const mushroom = (state) => state.tea === 'mushroom';

  return {
    view,
    /** While true, main.js leaves the simulation (and the spoon's actions) alone: time is standing still. */
    get holding() {
      return view.holding;
    },
    /** Samples in the recording (it never grows past a few seconds). */
    get recorded() {
      return count;
    },
    get active() {
      return active ? { kind: active.kind, stage: active.stage, time: active.time } : null;
    },
    /** The plans for the first `cups` cups of the current pot (for tests and tinkering). */
    schedule: (cups = 12) => strangeSchedule(seed(), cups).slice(1).map((p, i) => (p ? { ...p } : { cup: i + 1, kind: null })),
    /** Start a happening as soon as it can (testing): the current cup, if it is Mushroom Tea, or the next one. */
    force(kind) {
      if (!STRANGE_KINDS.includes(kind)) return false;
      finish(true);
      consumed = false;
      cupForced = { kind, start: clock, quip: 0.5, variant: 0.5, eager: true };
      armedAt = null;
      return true;
    },
    /** Game events, drained by main.js. */
    handle(event) {
      switch (event.type) {
        case 'matchStart':
        case 'roundStart':
          resetCup();
          break;
        case 'reading':
        case 'gameover':
          finish(true);
          break;
        case 'paused':
          // A rewind cannot be paused halfway; it simply stops, and play is where it was.
          if (active?.kind === 'rewind') finish(true);
          break;
        case 'kill':
          lastKill = clock;
          break;
        case 'steam':
          steams++;
          break;
      }
    },
    /**
     * Call once a frame, after the simulation.
     * @param {number} dt seconds since the previous frame
     * @param {object} state simulation state (read only)
     * @param {{ blocked?: boolean }} [options] blocked: a menu or dialog has stopped the game
     */
    update(dt, state, { blocked = false } = {}) {
      if (state !== watched) {
        watched = state;
        planSeed = null;
        resetCup();
      }
      if (state.phase !== PHASE.PLAYING) {
        // Paused: everything holds still. Anything else (a reading, a bonus round) ends it.
        if (state.phase !== PHASE.PAUSED) finish(true);
        return;
      }
      if (blocked) return;
      if (!mushroom(state)) {
        finish(true);
        return;
      }
      if (active?.kind === 'rewind' && active.stage !== 'settle') {
        updateRewind(dt);
        return;
      }
      clock += dt;
      if (clock >= nextSample) {
        capture(state);
        nextSample = Math.max(nextSample + 1 / RW.sampleRate, clock - 1 / RW.sampleRate);
      }
      if (active?.kind === 'rewind') updateRewind(dt);
      else if (active) updateActive(dt, state);
      else maybeBegin(state);
    },
    /**
     * What to draw: the live state, or during a rewind a recorded moment. A
     * recorded moment falls through to the live state for anything not
     * recorded (milk clouds, cubes, the porcelain), which simply holds still.
     */
    shown(state) {
      if (!view.holding || !count || view.rewind.back <= 0) return state;
      if (proxied !== state) {
        proxy = Object.create(state);
        proxied = state;
      }
      const slot = sampleAt(clock - view.rewind.back);
      proxy.angle = slot.angle;
      proxy.score = slot.score;
      proxy.kills = slot.kills;
      proxy.enemies = slot.enemies;
      proxy.shots = slot.shots;
      proxy.spores = slot.spores;
      proxy.residue = slot.residue;
      return proxy;
    },
    /** Remove and return the presentation events queued since the last call. */
    drainEvents() {
      return events.splice(0, events.length);
    },
  };
}
