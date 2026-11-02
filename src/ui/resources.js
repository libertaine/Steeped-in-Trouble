// Presentation only. Quantities and mode lifetimes belong to the simulation.
import { CONFIG } from '../config.js';
import { PHASE } from '../core/state.js';
import { cupCondition } from '../gameplay/porcelain.js';
import { sugarCapacity } from '../gameplay/weapons.js';
import { strainerCapacity } from '../gameplay/upgrades.js';
import { grindInProgress } from '../gameplay/grind.js';
import { havocInProgress } from '../gameplay/chocolate.js';
import { runInProgress } from '../gameplay/teaRun.js';
import { pourInProgress } from '../gameplay/dailyPour.js';
import { breakoutInProgress } from '../gameplay/biscuitBreakout.js';
import { crossingInProgress, TRAFFIC_ROWS } from '../gameplay/crossingStreet.js';

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const svg = (body) => `<svg viewBox="0 0 48 52" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const cupIcon = svg('<path d="M8 15h28v16a14 14 0 0 1-28 0zM36 18h4a7 7 0 0 1 0 14h-4M5 47h35"/>');
const cube = (full) => svg(`<path fill="${full ? '#fff1c4' : 'none'}" d="m24 5 18 10v22L24 47 6 37V15z"/><path d="m6 15 18 10 18-10M24 25v22" stroke="#ab9e7b"/>`);
const mesh = svg('<path d="M7 17q17-14 34 0v8q-17 23-34 0zM24 36v13"/><path d="m11 16 22 15M18 13l20 13M9 24l16-11M15 30l18-17M22 34l18-15" stroke="#a9bacb" stroke-width="1"/>');
const seconds = (n) => `${Math.max(0, Math.ceil(n - 1e-6))}s`;
const stat = (label, value) => ({ label, value: String(value) });
const inventory = (kind, label, current, capacity, note = '') => ({ kind, label, current, capacity, note, value: `${current}/${capacity}` });

/** A fresh projection, never a second inventory. Existing helpers include pause. */
export function resourceView(s, text) {
  const g = grindInProgress(s), c = havocInProgress(s), r = runInProgress(s);
  const p = pourInProgress(s), b = breakoutInProgress(s), x = crossingInProgress(s);
  const phase = s.phase === PHASE.PAUSED ? s.pausedFrom : s.phase;
  const milk = inventory('milk', 'Milk', s.milkLeft, CONFIG.milk.perRound);
  const cap = sugarCapacity(s);
  const sugar = inventory('sugar', 'Sugar', s.sugarLeft, cap, s.sugarLeft > cap ? '+ bonus'
    : s.modifiers.sugarRegenInterval && s.sugarLeft < cap ? `Next ${seconds(s.sugarRegenTimer)}` : '');
  const normal = !g && !c && !r && !p && !b && !x;
  let items, progress = [s.kills, s.target], progressLabel = `Cup ${s.round} · Leaves`;
  let cue = [text.hudStatus, text.hudOmen, text.hudTea, text.hudAuto].filter(Boolean).join(' · ');
  if (g) {
    items = [milk, sugar, stat('Scalds', `${g.scalds}/${CONFIG.grind.scalds}`)];
    progress = [g.health, CONFIG.grind.health]; progressLabel = 'Machine health';
    cue = `${text.hudStatus} · ${g.stage === 'fight' ? `${s.phase === PHASE.PAUSED ? `${seconds(g.left)} · ` : ''}${g.valve.stage === 'open' ? 'Valve open: shoot' : 'Wait for open valve'}${g.attack?.stage === 'warn' ? ' · Dodge glowing lanes' : ''}` : text.roundTitle}`;
  } else if (c) {
    items = [stat('Perfect', c.tally.perfect), stat('Toasted', c.tally.toasted), stat('Time', seconds(c.left))];
    progress = null; cue = `${text.hudStatus} · Space / hold cup: flames · Use short bursts; avoid burning`;
  } else if (r) {
    items = [stat('Stumbles left', `${Math.max(0, CONFIG.teaRun.hits - r.hits)}/${CONFIG.teaRun.hits}`), stat('Pickups', `${r.coins} coins · ${r.packets} tea`), stat('Distance', `${Math.round(100 * Math.min(1, r.distance / r.finish))}%`)];
    progress = [r.distance, r.finish]; progressLabel = 'Route'; cue = `${text.hudStatus} · Jump obstacles; slide under cups`;
  } else if (p) {
    items = [stat('Deliveries', `${p.delivered}/${p.scheduled}`), stat('Papers', p.papers), stat('Time / aim', `${seconds(CONFIG.dailyPour.duration - p.clock)} · ${p.aim === 'near' ? 'Mailbox' : 'Porch'}`)];
    progress = [p.clock, CONFIG.dailyPour.duration]; progressLabel = 'Route'; cue = `${text.hudStatus} · Match marked subscribers; Space throws`;
  } else if (b) {
    items = [stat('Cubes', `${b.cubes}/${CONFIG.biscuitBreakout.cubes}`), stat('Biscuits', `${b.broken}/${b.total}`), stat('Time', seconds(CONFIG.biscuitBreakout.duration - b.clock))];
    progress = [b.broken, b.total]; progressLabel = 'Biscuits'; cue = `${text.hudStatus} · Catch cube with spoon; Space launches`;
  } else if (x) {
    items = [stat('Attempts', `${x.attempts}/${CONFIG.crossingStreet.attempts}`), stat('Lanes', `${x.credited.length}/${TRAFFIC_ROWS.length}`), stat('Time', seconds(CONFIG.crossingStreet.duration - x.clock))];
    progress = [x.credited.length, TRAFFIC_ROWS.length]; progressLabel = 'Crossing'; cue = `${text.hudStatus} · Arrow keys hop; median is safe`;
  } else {
    items = [milk, sugar, inventory('strainer', 'Leaf catches', s.strainerLeft, strainerCapacity(s.spoon), s.strainerLeft === 0 ? 'exhausted' : '')];
    if ([PHASE.SHORTAGE, PHASE.DAY, PHASE.ARCADE_OFFER].includes(phase)) {
      items = [stat('Tea Cash', s.teaCash), stat('Status', text.roundTitle), stat('Choice', phase === PHASE.SHORTAGE ? `Tin ${CONFIG.shortage.teaPrice} · run / skip free` : 'See choices below')];
      progress = null; cue = text.hudStatus;
    }
  }
  return { normal, title: g ? 'Espresso machine' : c ? 'Hot Chocolate Havoc' : text.roundTitle,
    condition: cupCondition(s.lives), margin: s.lives === 1 ? 'Next spill breaks' : `${s.lives} spills to break`,
    items, progress, progressLabel, cue, tea: normal ? text.teaName : '', score: `Score ${s.score}` };
}

function illustration(item) {
  const { kind, current: n, capacity: cap } = item;
  if (kind === 'milk') {
    const height = 28 * Math.min(1, Math.max(0, n / cap));
    return svg(`<defs><clipPath id="hud-jug"><path d="M12 14h21l4 29Q24 51 9 43z"/></clipPath></defs><rect x="7" y="${46 - height}" width="32" height="${height}" fill="#d4ecff" stroke="none" clip-path="url(#hud-jug)"/><path d="M12 14 7 8h26v6l4 29Q24 51 9 43zM36 17h5q9 12-3 18M12 5h20"/>`);
  }
  if (kind === 'sugar') return `<span class="resource-cubes" aria-hidden="true">${n > 4 ? `${cube(true)}×${n}` : Array.from({ length: Math.max(1, n) }, () => cube(n > 0)).join('')}</span>`;
  return `<span class="resource-strainer" aria-hidden="true">${mesh}<span class="catch-pips">${n > 8 ? `×${n}` : '<i></i>'.repeat(n)}</span></span>`;
}

export function createResources(doc) {
  const root = doc.getElementById('resourceStrip');
  if (!root) return { update() {}, handle() {} };
  const cache = new Map();
  const write = (id, value, html = false) => {
    if (cache.get(id) === value) return;
    cache.set(id, value);
    const el = doc.getElementById(id);
    el[html ? 'innerHTML' : 'textContent'] = value;
  };
  return {
    update(s, text) {
      const v = resourceView(s, text);
      if (root.dataset.normal !== String(v.normal)) root.dataset.normal = String(v.normal);
      if (root.dataset.condition !== v.condition.id) root.dataset.condition = v.condition.id;
      write('resourceCupIcon', v.normal ? cupIcon : '', true);
      write('resourceTitle', v.title);
      write('spillMargin', v.normal ? v.margin : 'Normal pot suspended');
      write('resourceProgressLabel', v.progress ? `${v.progressLabel} ${v.progress.map((n) => Math.round(n)).join('/')}` : '');
      const bar = doc.getElementById('resourceProgress');
      bar.hidden = !v.progress;
      if (v.progress) {
        bar.max = Math.max(1, v.progress[1]); bar.value = v.progress[0];
        bar.setAttribute('aria-label', v.progressLabel);
      }
      v.items.forEach((item, i) => {
        write(`resource${i}`, `${item.kind ? illustration(item) : ''}<span><span class="resource-label">${escape(item.label)}</span><b>${escape(item.value)}</b>${item.note ? `<small>${escape(item.note)}</small>` : ''}</span>`, true);
        const el = doc.getElementById(`resource${i}`);
        const label = item.kind ? `${item.label}: ${item.current} available, ${item.capacity} normal capacity${item.note ? `, ${item.note}` : ''}` : `${item.label}: ${item.value}`;
        if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
      });
      write('resourceGuidance', v.normal ? '' : v.cue.replace(`${text.hudStatus} · `, '').replace(text.hudStatus, ''));
      write('resourceScore', v.score);
    },
    handle(event) {
      const feedback = { milk: [0, 'Milk used'], sugar: [1, 'Sugar used'], strain: [2, 'Leaf caught'] }[event.type];
      if (!feedback) return;
      const el = doc.getElementById(`resource${feedback[0]}`);
      // Browser animation owns only a brief visual cue, never resource state.
      if (!doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.getAnimations?.().forEach((animation) => animation.cancel());
        el.animate?.([{ backgroundColor: '#587064' }, { backgroundColor: 'transparent' }], { duration: 220 });
      }
      write('resourceAnnouncement', feedback[1]);
    },
  };
}
