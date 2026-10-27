// Cosmetic effects driven by simulation events: particles and the spill flash.
//
// Effects never modify game state and use their own random source, so they
// can be changed freely without affecting gameplay or seeded replays.

import { toCanvasPoint } from '../gameplay/arena.js';
import { CONFIG } from '../config.js';

export function createEffects({ random = Math.random } = {}) {
  const rnd = (min, max) => min + random() * (max - min);
  const fx = {
    particles: [],
    flash: 0, // seconds of spill flash remaining
  };

  function burst(count, radius, angle, color, life) {
    for (let i = 0; i < count; i++) {
      const p = toCanvasPoint(radius(), angle());
      const lifetime = typeof life === 'function' ? life() : life;
      fx.particles.push({
        x: p.x,
        y: p.y,
        vx: rnd(-36, 36),
        vy: rnd(-45, 18),
        time: lifetime,
        life: lifetime,
        color: typeof color === 'function' ? color(i) : color,
        size: rnd(1, 3.3),
      });
    }
  }

  const handlers = {
    roundStart() {
      fx.particles = [];
      fx.flash = 0;
    },
    kill({ radius, angle }) {
      burst(9, () => radius + rnd(-8, 8), () => angle + rnd(-0.07, 0.07),
        (i) => (i % 3 === 0 ? '#efe4b4' : '#b4dcc0'), () => rnd(0.25, 0.7));
    },
    escape({ angle }) {
      fx.flash = 0.5;
      burst(20, () => CONFIG.arena.rimRadius, () => angle + rnd(-0.1, 0.1), '#e6ad82', 0.7);
    },
    milk({ angle }) {
      burst(22, () => rnd(100, 245), () => angle + rnd(-0.38, 0.38), '#dceee8', () => rnd(0.3, 0.9));
    },
    drift({ radius, angle }) {
      burst(1, () => radius, () => angle, '#e5d9b0', 0.4);
    },
  };

  return {
    fx,
    handle(event) {
      handlers[event.type]?.(event);
    },
    update(dt) {
      fx.flash = Math.max(0, fx.flash - dt);
      const { particles } = fx;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.time -= dt;
        if (p.time <= 0) particles.splice(i, 1);
      }
    },
  };
}
