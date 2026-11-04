// A bounded cosmetic timeline. No game state, DOM, timers or gameplay RNG.
import { CONFIG } from '../config.js';
import { drawAnt } from './ambient.js';

export function createTextMischief({ random, tuning = CONFIG.textMischief }) {
  let phase = 'idle', idle = 0, elapsed = 0, tried = false, size = 3;
  const active = () => ['approach', 'lift', 'carry', 'absent'].includes(phase);
  function cancel() {
    if (active()) phase = 'restored';
    idle = 0;
    elapsed = 0;
  }
  function begin() {
    tried = true;
    size = random.next() < 0.5 ? 3 : 4;
    elapsed = 0;
    phase = 'approach';
  }
  return {
    reset() { phase = 'idle'; idle = 0; elapsed = 0; tried = false; },
    cancel,
    suspend() { if (active()) cancel(); },
    trigger() { if (!tried) { begin(); return true; } return false; },
    step(dt, { eligible, suspended = false, engaged = false }) {
      if (!eligible || engaged) { cancel(); return; }
      if (suspended) { if (active()) cancel(); return; }
      // Discard decorative catch-up, including test/debug callers with large deltas.
      dt = Math.max(0, Math.min(0.04, dt || 0));
      if (phase === 'idle' && !tried) {
        idle += dt;
        if (idle + 1e-8 >= tuning.idle) {
          tried = true;
          if (random.next() < tuning.chance) begin();
        }
      } else if (active()) {
        elapsed += dt;
        if (elapsed + 1e-8 >= tuning[phase]) {
          elapsed = 0;
          phase = { approach: 'lift', lift: 'carry', carry: 'absent', absent: 'restored' }[phase];
        }
      }
    },
    snapshot: () => ({ phase, idle, elapsed, tried, size }),
  };
}

/** Shared line and carrier coordinates, bounded by the clipped 64px lane. */
export function textFormation(state, geometry, tuning = CONFIG.textMischief) {
  const { width, textWidth } = geometry;
  const home = width / 2;
  const p = Math.min(1, state.elapsed / (tuning[state.phase] || 1));
  // A small hesitation part way out; no physics or accumulating path buffers.
  const travel = p < 0.35 ? p : p < 0.43 ? 0.35 : 0.35 + (p - 0.43) * 0.65 / 0.57;
  const x = home + (state.phase === 'carry' ? travel * (width - home + textWidth / 2 + 26) : 0);
  const lifted = state.phase === 'carry' ? 1 : state.phase === 'lift' ? p : 0;
  const y = tuning.laneHeight / 2 - lifted * 3;
  const angle = state.phase === 'carry' ? Math.sin(p * Math.PI * 4) * 0.018 : 0;
  const ants = [];
  for (let i = 0; i < state.size; i++) {
    const offset = (i / (state.size - 1) - 0.5) * (textWidth - 24);
    const targetX = home + offset;
    const startX = -14 - i * 22;
    const approaching = state.phase === 'approach';
    ants.push({ x: approaching ? startX + (targetX - startX) * p : x + offset,
      y: y + 11 + offset * Math.sin(angle),
      // One ant briefly disagrees just after pickup.
      heading: !approaching && i === 0 && state.phase === 'carry' && p < 0.16 ? Math.PI : -0.45,
      gait: state.elapsed * 22 + i * 2, moving: state.phase !== 'lift' });
  }
  return { x, y, angle, ants, carried: ['lift', 'carry', 'absent'].includes(state.phase) };
}

export function drawTextMischief(ctx, state, geometry, text, tuning = CONFIG.textMischief) {
  if (!['approach', 'lift', 'carry'].includes(state.phase)) return;
  const pose = textFormation(state, geometry, tuning);
  if (pose.carried) {
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.angle);
    ctx.font = geometry.font;
    ctx.fillStyle = geometry.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  for (const ant of pose.ants) drawAnt(ctx, ant);
}
