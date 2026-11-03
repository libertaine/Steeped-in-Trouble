// Draws The Mycelium Manager: a mushroom in a lanyard, with a clipboard, its
// roots, its memos and sticky notes, its meetings, and the cards before and
// after the fight. Like the rest of the renderer it reads state and never
// changes it.
//
// Each thing has its own shape as well as its own colour: roots are glowing
// threads with a bright node at the tip, memos are paper puffballs with a
// folded sheet inside, sticky notes are yellow squares pinned to the rim,
// and a meeting's invited lanes are hatched wedges with a calendar mark at
// the rim. Low graphics drops the glows; reduced motion drops the blinking.

import { CONFIG } from '../config.js';
import { LANE_STEP, TAU, laneAngle, toCanvasPoint as polar } from '../gameplay/arena.js';
import { MEETING_LINE, fury, invitedLanes } from '../gameplay/mycelium.js';

const { centerX: CX, centerY: CY, rimRadius: OUTER } = CONFIG.arena;
const M = CONFIG.manager;
const G = CONFIG.grind;
const GOLD = '#ffd45e';
const MONO = 'ui-monospace,monospace';
const ROOT = '#9be8c0'; // the roots' glow
const ROOT_CORE = '#e9fff3';
const FROST = '#dff2ff'; // a root held still by milk
const PAPER = '#f6f0de';
const INK = '#6b5a3a';
const NOTE = '#ffe066';
const INVITE = '#b77cff'; // a meeting's invited lanes
const CAP = '#8a5a7a';
const SPORE = '#8ef0dc';

/** The rematch twists, by name, for the cards. */
export const TWIST_NAMES = Object.freeze({ reorg: 'The Reorg', backToBack: 'Back-to-Back Meetings', synergy: 'Synergy' });

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (t) => t * t * (3 - 2 * t);

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ circle: Function, text: Function, highQuality: () => boolean }} tools the renderer's own helpers
 */
export function createManagerPainter(ctx, { circle, text, highQuality }) {
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  /** Rising in, standing, wilting when beaten, or vanishing in spores. */
  function presence(m) {
    if (m.stage === 'intro') {
      const u = clamp((m.time - 0.7) / 1.3, 0, 1);
      const pop = u < 1 ? smoothstep(u) * (1 + 0.15 * Math.sin(u * Math.PI)) : 1;
      return { scale: 0.25 + 0.75 * pop, alpha: clamp(u * 3, 0, 1), sink: 40 * (1 - smoothstep(u)), wilt: 0 };
    }
    if (m.stage === 'outro' && m.result === 'victory') {
      const u = clamp((m.time - 0.5) / 1, 0, 1);
      return { scale: 1 - 0.2 * u, alpha: 1 - smoothstep(u), sink: 50 * smoothstep(u), wilt: smoothstep(u) };
    }
    if (m.stage === 'outro') {
      const u = clamp(m.time / 0.9, 0, 1);
      return { scale: 1 - 0.6 * u, alpha: 1 - u, sink: -20 * u, wilt: 0 };
    }
    return { scale: 1, alpha: 1, sink: 0, wilt: 0 };
  }

  /** The meeting line: a faint dashed ring, brighter while an invitation is out. */
  function drawLine(m, time, reduced) {
    const warn = m.meeting?.stage === 'warn';
    ctx.save();
    ctx.setLineDash([4, 7]);
    ctx.lineDashOffset = reduced ? 0 : -time * 8;
    ctx.strokeStyle = warn ? INVITE : ROOT;
    ctx.lineWidth = warn ? 1.6 : 1;
    ctx.globalAlpha = warn ? 0.55 : 0.18;
    ctx.beginPath();
    ctx.arc(CX, CY, MEETING_LINE, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  /** Invited lanes: hatched violet wedges, a calendar mark where the ring will land. */
  function drawInvites(m, time, reduced) {
    const a = m.meeting;
    const lanes = invitedLanes(m);
    if (!a || !lanes.length) return;
    const u = a.stage === 'warn' ? clamp(a.time / a.length, 0, 1) : 1;
    const blink = reduced ? 0.85 : 0.6 + 0.4 * Math.sin(time * (8 + 20 * u));
    ctx.save();
    for (const lane of lanes) {
      const angle = laneAngle(lane);
      const from = angle - LANE_STEP * 0.42;
      const to = angle + LANE_STEP * 0.42;
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, OUTER - 3, from, to);
      ctx.arc(CX, CY, M.bodyRadius, to, from, true);
      ctx.closePath();
      ctx.globalAlpha = a.stage === 'warn' ? (0.1 + 0.18 * u) * blink : 0.35;
      ctx.fillStyle = INVITE;
      ctx.fill();
      // Hatching, so the wedge reads without its colour.
      ctx.clip();
      ctx.globalAlpha = (a.stage === 'warn' ? 0.35 : 0.5) * blink;
      ctx.strokeStyle = '#f0e2ff';
      ctx.lineWidth = 1.4;
      for (let r = M.bodyRadius + 10; r < OUTER; r += 14) {
        const p = polar(r, from);
        const q = polar(r + 14, to);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      ctx.restore();
      // A little calendar page at the rim: the lane is on the invite list.
      const c = polar(OUTER - 24, angle);
      ctx.globalAlpha = 0.6 + 0.4 * blink;
      ctx.fillStyle = '#f7f0ff';
      roundRect(c.x - 7, c.y - 7, 14, 14, 2);
      ctx.fill();
      ctx.fillStyle = INVITE;
      ctx.fillRect(c.x - 7, c.y - 7, 14, 4);
      ctx.fillStyle = '#4a2a6a';
      ctx.fillRect(c.x - 3, c.y - 1, 2, 2);
      ctx.fillRect(c.x + 1, c.y - 1, 2, 2);
      ctx.fillRect(c.x - 3, c.y + 3, 2, 2);
    }
    ctx.restore();
  }

  /** The meeting itself: a ring sweeping out over the invited lanes. */
  function drawRing(m) {
    const a = m.meeting;
    if (!a || a.stage !== 'burst') return;
    ctx.save();
    ctx.lineCap = 'round';
    circle(CX, CY, a.reach, INVITE, 2, false, 0.35);
    for (const lane of a.lanes) {
      const angle = laneAngle(lane);
      for (const [color, width, alpha] of [[INVITE, 12, 0.55], ['#f0e2ff', 3, 0.9]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(CX, CY, a.reach, angle - LANE_STEP * 0.45, angle + LANE_STEP * 0.45);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Roots: a thread from the Manager's base to a glowing tip; a sprout is a pulsing seed at the base. */
  function drawRoots(m, time, reduced) {
    const glow = highQuality();
    ctx.save();
    ctx.lineCap = 'round';
    for (const r of m.roots) {
      const angle = laneAngle(r.lane);
      if (r.stage === 'sprout') {
        const p = polar(M.bodyRadius + 6, angle);
        const pulse = reduced ? 0.8 : 0.5 + 0.5 * Math.sin(time * 14);
        circle(p.x, p.y, 5 + 4 * pulse, ROOT, 2, false, 0.4 + 0.5 * pulse);
        circle(p.x, p.y, 3, ROOT_CORE, 0, true, 0.9);
        continue;
      }
      const claimed = r.tip >= MEETING_LINE;
      const from = polar(M.bodyRadius, angle);
      const tip = polar(r.tip, angle);
      // A gentle wiggle along the thread, so it reads as alive (not in reduced motion).
      const bend = reduced ? 0 : Math.sin(time * 2 + r.lane) * 4;
      const mid = polar((M.bodyRadius + r.tip) / 2, angle + bend / Math.max(60, r.tip));
      if (glow) {
        ctx.shadowColor = r.frozen ? FROST : ROOT;
        ctx.shadowBlur = claimed ? 12 : 6;
      }
      for (const [color, width, alpha] of [[r.frozen ? FROST : ROOT, claimed ? 6 : 3.5, 0.75], [ROOT_CORE, claimed ? 2 : 1.2, 0.9]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      const pulse = reduced || r.frozen ? 1 : 0.75 + 0.25 * Math.sin(time * 6 + r.lane);
      circle(tip.x, tip.y, (claimed ? 7 : 5.5) * pulse, r.frozen ? FROST : ROOT, 0, true, 0.95);
      circle(tip.x, tip.y, 2.5, '#ffffff', 0, true, 1);
    }
    ctx.restore();
  }

  /** A memo: a round paper puffball with a folded sheet inside. */
  function drawMemo(memo, time, reduced) {
    const p = polar(memo.radius, memo.angle);
    const s = M.memoSize;
    const bob = reduced ? 0 : Math.sin(time * 4 + memo.id) * 1.5;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.fillStyle = PAPER;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, s, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // The sheet, with its corner folded and three lines of very important text.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-6, -7);
    ctx.lineTo(3, -7);
    ctx.lineTo(6, -4);
    ctx.lineTo(6, 7);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#9a8a66';
    ctx.lineWidth = 1;
    for (const y of [-2, 1, 4]) {
      ctx.beginPath();
      ctx.moveTo(-4, y);
      ctx.lineTo(4, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Sticky notes on the rim: yellow squares with a pin. */
  function drawNotes(m) {
    for (const lane of m.notes) {
      const angle = laneAngle(lane);
      const p = polar(OUTER - 6, angle);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle + Math.PI / 2 + ((lane % 3) - 1) * 0.12);
      ctx.fillStyle = NOTE;
      ctx.strokeStyle = '#a88a1a';
      ctx.lineWidth = 1.2;
      ctx.fillRect(-9, -9, 18, 18);
      ctx.strokeRect(-9, -9, 18, 18);
      ctx.fillStyle = '#d0403a';
      ctx.beginPath();
      ctx.arc(0, -6, 2.4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Spores on their way back down the lane to the Manager. */
  function drawPuffs(m) {
    for (const puff of m.puffs) {
      for (let k = 0; k < 4; k++) {
        const p = polar(puff.radius + k * 9, puff.angle + (k % 2 ? 0.02 : -0.02));
        circle(p.x, p.y, 4 - k * 0.6, SPORE, 0, true, 0.85 - k * 0.18);
      }
    }
  }

  /** The Manager: a mushroom cap, a stem in a shirt, a lanyard and a clipboard. */
  function drawManager(m, time, reduced) {
    const look = presence(m);
    if (look.alpha <= 0) return;
    const f = fury(m);
    const wobble = m.flinch > 0 && !reduced ? Math.sin(time * 60) * 3 : 0;
    ctx.save();
    ctx.globalAlpha = look.alpha;
    ctx.translate(CX + wobble, CY + look.sink);
    ctx.scale(look.scale, look.scale);
    ctx.rotate(look.wilt * 0.4);
    // Stem (with a collared shirt).
    ctx.fillStyle = '#efe6d4';
    ctx.strokeStyle = '#7a6a52';
    ctx.lineWidth = 2;
    roundRect(-26, -6, 52, 62, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d8e4f0';
    ctx.beginPath();
    ctx.moveTo(-14, -2);
    ctx.lineTo(0, 10);
    ctx.lineTo(14, -2);
    ctx.closePath();
    ctx.fill();
    // Tie.
    ctx.fillStyle = '#5a7ac8';
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(-5, 14);
    ctx.lineTo(0, 34);
    ctx.lineTo(5, 14);
    ctx.closePath();
    ctx.fill();
    // Lanyard and badge.
    ctx.strokeStyle = '#3a7adf';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, -4);
    ctx.lineTo(-10, 30);
    ctx.moveTo(18, -4);
    ctx.lineTo(-6, 30);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#3a7adf';
    ctx.lineWidth = 1.5;
    roundRect(-17, 30, 16, 12, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3a7adf';
    ctx.fillRect(-15, 32, 12, 3);
    // Clipboard, held up when a meeting is called.
    const raised = m.meeting?.stage === 'warn' ? 1 : 0;
    ctx.save();
    ctx.translate(34, 18 - 16 * raised);
    ctx.rotate(0.2 - 0.25 * raised);
    ctx.fillStyle = '#b07a42';
    roundRect(-12, -16, 24, 32, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-9, -11, 18, 24);
    ctx.fillStyle = '#9aa0a6';
    ctx.fillRect(-5, -18, 10, 5);
    ctx.strokeStyle = '#9a8a66';
    ctx.lineWidth = 1;
    for (const y of [-6, -2, 2, 6]) {
      ctx.beginPath();
      ctx.moveTo(-6, y);
      ctx.lineTo(6, y);
      ctx.stroke();
    }
    ctx.restore();
    // Cap, darker and redder as it gets annoyed.
    const cap = f > 0.5 ? '#9a4a62' : CAP;
    ctx.fillStyle = cap;
    ctx.strokeStyle = '#4a2a3a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, -14, 62, 40, 0, Math.PI, 0);
    ctx.quadraticCurveTo(40, -2, 0, -4);
    ctx.quadraticCurveTo(-40, -2, -62, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (const [x, y, r] of [[-30, -32, 8], [4, -44, 10], [32, -28, 7], [-8, -22, 5]]) circle(x, y, r, '#f4e8f0', 0, true, 0.9);
    // Face: spectacles, and eyebrows that disapprove more as it goes.
    ctx.strokeStyle = '#2a1a22';
    ctx.lineWidth = 1.8;
    for (const x of [-10, 10]) {
      ctx.beginPath();
      ctx.arc(x, 4, 6, 0, TAU);
      ctx.stroke();
      circle(x, 4, 2, '#2a1a22', 0, true, 1);
    }
    ctx.beginPath();
    ctx.moveTo(-4, 4);
    ctx.lineTo(4, 4);
    ctx.moveTo(-16, -5 + 3 * f);
    ctx.lineTo(-5, -5 - 2 * f);
    ctx.moveTo(16, -5 + 3 * f);
    ctx.lineTo(5, -5 - 2 * f);
    ctx.stroke();
    ctx.restore();
  }

  function drawReadouts(m, time) {
    if (m.stage !== 'fight') return;
    const appear = clamp(m.time / 0.6, 0, 1);
    const y = CY - 124;
    ctx.save();
    ctx.globalAlpha = appear;
    text('THE MYCELIUM MANAGER', CX, y - 13, 10, ROOT, 'center', MONO, 'bold ');
    ctx.fillStyle = '#10180fcc';
    roundRect(CX - 72, y - 5, 144, 10, 5);
    ctx.fill();
    const fill = ctx.createLinearGradient(CX - 70, 0, CX + 70, 0);
    fill.addColorStop(0, '#7affc4');
    fill.addColorStop(1, '#b77cff');
    ctx.fillStyle = m.flinch > 0.15 ? '#ffffff' : fill;
    roundRect(CX - 70, y - 3, 140 * (m.health / M.health), 6, 3);
    ctx.fill();
    ctx.strokeStyle = ROOT;
    ctx.lineWidth = 1;
    roundRect(CX - 72, y - 5, 144, 10, 5);
    ctx.stroke();
    ctx.restore();

    const left = m.left / G.duration;
    const hurry = m.left < 6;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = hurry ? '#ff7a4a' : ROOT;
    ctx.globalAlpha = appear * (hurry ? 0.55 + 0.35 * Math.sin(time * 10) : 0.45);
    ctx.beginPath();
    ctx.arc(CX, CY, OUTER + 33, -Math.PI / 2, -Math.PI / 2 + TAU * left);
    ctx.stroke();
    ctx.restore();

    // Scalds, as in The Daily Grind: three little cups, bottom left.
    const x0 = 50;
    const y0 = 714;
    ctx.save();
    ctx.globalAlpha = appear;
    text('SCALDS', x0 + 36, y0 - 28, 13, '#e8d8f4', 'center', MONO, 'bold ');
    for (let i = 0; i < G.scalds; i++) {
      const hit = i < m.scalds;
      ctx.save();
      ctx.translate(x0 + i * 36, y0);
      if (hit) ctx.rotate(0.5);
      ctx.fillStyle = hit ? '#ff7a4a' : '#f4efe6';
      ctx.strokeStyle = hit ? '#8a2a10' : '#9aa7ab';
      ctx.lineWidth = 1.8;
      roundRect(-10, -9, 20, 18, 4);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(11, 0, 5, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function card(y0, h, alpha, time, edge = ROOT) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.93;
    ctx.fillStyle = '#0f1a14';
    roundRect(CX - 222, y0, 444, h, 12);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.3;
    ctx.globalAlpha = alpha * (0.6 + 0.25 * Math.sin(time * 3));
    ctx.stroke();
    ctx.restore();
  }

  function drawTitle(appear, fade) {
    if (appear <= 0 || fade <= 0) return;
    const pop = 1 + 0.4 * (1 - smoothstep(appear));
    ctx.save();
    ctx.globalAlpha = appear * fade;
    ctx.translate(CX, CY + 132);
    ctx.scale(pop, pop);
    if (highQuality()) {
      ctx.shadowColor = INVITE;
      ctx.shadowBlur = 22;
    }
    text('THE MYCELIUM MANAGER', 0, 0, 32, '#e6fff0', 'center', 'Georgia,serif', 'bold ');
    ctx.restore();
  }

  function drawCards(m, time) {
    const t = m.time;
    if (m.stage === 'intro') {
      const words = clamp(Math.min((t - 0.15) / 0.4, (3.2 - t) / 0.4), 0, 1);
      if (words > 0) {
        card(CY - 252, 74, words, time);
        ctx.save();
        ctx.globalAlpha = words;
        text('THE CUP ANNOUNCES', CX, CY - 232, 12, ROOT, 'center', MONO);
        text(m.milestone ? '“Someone has booked the cup for a meeting.”' : `“${m.twists.map((id) => TWIST_NAMES[id]).join(' and ')}.”`,
          CX, CY - 202, 19, '#eafff2', 'center', 'Georgia,serif', 'italic ');
        ctx.restore();
      }
      const title = clamp((t - 2.1) / 0.25, 0, 1);
      drawTitle(title, 1);
      if (title > 0) {
        ctx.save();
        ctx.globalAlpha = clamp((t - 2.6) / 0.4, 0, 1);
        text('Cut the roots. Pop the memos. Skip the meetings.', CX, CY + 168, 16, '#dff5e8', 'center', 'Georgia,serif', 'italic ');
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.25 * Math.sin(time * 2.5);
      text('ENTER — SKIP', CX, CY + 200, 10, '#cfe8da', 'center', MONO);
      ctx.restore();
      return;
    }
    if (m.stage === 'fight') {
      drawTitle(clamp(t / 0.2, 0, 1), clamp((1.4 - t) / 0.4, 0, 1));
      return;
    }
    const s = m.summary;
    const a = clamp((t - 1.1) / 0.4, 0, 1);
    if (!s || a <= 0) return;
    const win = s.result === 'victory';
    const y0 = CY - 104;
    const h = win ? 214 : 178;
    card(y0, h, a, time, win ? (s.perfect ? GOLD : ROOT) : '#9a8aaa');
    ctx.save();
    ctx.globalAlpha = a;
    if (win) {
      text('MEETING ADJOURNED', CX, y0 + 20, 12, ROOT, 'center', MONO);
      text(`+${s.bonus}`, CX, y0 + 54, 34, s.perfect ? GOLD : '#eafff2', 'center', 'Georgia,serif', 'bold ');
      text('✶ A Golden Spoon for the next cup', CX, y0 + 86, 14, '#ffe9a0', 'center', MONO);
      if (s.perfect) {
        text('PERFECT ATTENDANCE — not a single scald.', CX, y0 + 112, 14, GOLD, 'center', 'Georgia,serif', 'bold italic ');
        text(s.cup ? 'A cup is restored.' : `Your cups are full, so +${G.fullCupPoints} instead.`, CX, y0 + 132, 13, '#ffe9a0', 'center', MONO);
      } else {
        text(`${s.memos} memos popped · ${s.roots} roots cut · ${s.scalds} scald${s.scalds === 1 ? '' : 's'}`,
          CX, y0 + 116, 13, '#dff5e8', 'center', MONO);
      }
      text(m.milestone ? 'The cup has gone fungal. A new chapter awaits…' : '“I’ll put a pin in it.”',
        CX, y0 + 160, 14, m.milestone ? '#ffe9a0' : '#dff5e8', 'center', 'Georgia,serif', 'italic ');
    } else {
      text(s.reason === 'time' ? 'IT HAS ANOTHER MEETING' : 'IT TAKES THIS OFFLINE', CX, y0 + 20, 12, '#d8c8e8', 'center', MONO);
      text('“Let’s take this offline.”', CX, y0 + 62, 22, '#eafff2', 'center', 'Georgia,serif', 'italic ');
      text(`It still had ${m.health} of ${M.health} left.`, CX, y0 + 104, 13, '#d8c8e8', 'center', MONO);
      text(m.milestone ? `It will be back after ${M.retryAfter} more cups. Your cups are safe.`
        : 'Your cups, your spoon, and the next fortune are safe.', CX, y0 + 134, 14, '#dff5e8', 'center', 'Georgia,serif', 'italic ');
    }
    ctx.globalAlpha = a * clamp((t - G.outroMin) / 0.4, 0, 1) * (0.65 + 0.35 * Math.sin(time * 2.5));
    text('ENTER — BACK TO THE TEA', CX, y0 + h - 22, 10, '#cfe8da', 'center', MONO);
    ctx.restore();
  }

  /** When it gets away: a cloud of spores where it stood. */
  function drawEscapeCloud(m) {
    if (m.stage !== 'outro' || m.result !== 'escaped') return;
    const u = clamp(m.time / 1.6, 0, 1);
    const a = Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u * 0.5);
    for (let k = 0; k < 9; k++) {
      const angle = (k / 9) * TAU + u;
      const r = 20 + 50 * smoothstep(u);
      circle(CX + Math.cos(angle) * r, CY - 10 + Math.sin(angle) * r * 0.7 - 30 * u, 24 + 18 * u,
        k % 2 ? '#9a7aaa' : SPORE, 0, true, 0.3 * a);
    }
  }

  return {
    /** Beneath the darts and the Manager: the meeting line, invitations, roots, notes, memos and spores. */
    drawField(m, time, reduced) {
      drawLine(m, time, reduced);
      drawInvites(m, time, reduced);
      drawRing(m);
      drawRoots(m, time, reduced);
      drawNotes(m);
      for (const memo of m.memos) drawMemo(memo, time, reduced);
      drawPuffs(m);
    },
    /** The Manager itself. */
    drawManager(m, time, reduced) {
      drawManager(m, time, reduced);
      drawEscapeCloud(m);
    },
    /** The health meter, clock, scalds, and the cards before and after. */
    drawOverlay(m, time) {
      drawReadouts(m, time);
      drawCards(m, time);
    },
  };
}
