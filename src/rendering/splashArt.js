// The title screen's centerpiece, painted as real low-resolution pixel art: a
// 256 x 160 picture in a fixed 16-colour palette, every pixel placed by code
// with no anti-aliasing, then scaled up by CSS with nearest-neighbour sampling
// (image-rendering: pixelated). A determined silver spoon in round glasses
// stands in a blue-and-white porcelain cup of amber tea and fires steam at the
// leaves climbing its rim. The art is procedural, so it ships as code.

export const SPLASH_WIDTH = 256;
export const SPLASH_HEIGHT = 160;

export const SPLASH_PALETTE = Object.freeze([
  '#050510', // 0 outline
  '#0e1030', // 1 night
  '#1c2156', // 2 night haze
  '#2a3fa8', // 3 cobalt
  '#5b7be0', // 4 light cobalt
  '#f4efe2', // 5 porcelain
  '#a9b4cc', // 6 porcelain shadow, silver
  '#6b7489', // 7 steel
  '#ffd23f', // 8 gold
  '#e8344e', // 9 red
  '#f29a2e', // 10 tea highlight
  '#b8561a', // 11 tea
  '#6b2a0e', // 12 strong tea, the table
  '#49b649', // 13 leaf
  '#1f6b30', // 14 leaf shadow
  '#9be7ff', // 15 steam
]);

const C = {
  ink: 0, night: 1, haze: 2, cobalt: 3, sky: 4, porcelain: 5, silver: 6, steel: 7,
  gold: 8, red: 9, teaLight: 10, tea: 11, teaDark: 12, leaf: 13, leafDark: 14, steam: 15,
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dither = (x, y, amount) => BAYER[(y & 3) * 4 + (x & 3)] < amount * 16;

// A 5 x 7 arcade font, just the letters the title screen needs.
const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
};

// Sprites: o outline, g leaf, d leaf shadow, w white, . clear.
const SPRITE_COLOURS = { o: C.ink, g: C.leaf, d: C.leafDark, w: C.porcelain };
const ANGRY_LEAF = [
  '....ooo....',
  '..oogggoo..',
  '.ogogggogo.',
  'ogwogggowdo',
  'oggggggggdo',
  'ogggooogddo',
  '.oggggggdo.',
  '..oogddoo..',
  '....od.....',
];
const DIZZY_LEAF = [
  '....ooo....',
  '..oogggoo..',
  '.ogogogogo.',
  'oggogggogdo',
  'ogogogogodo',
  'oggggggggdo',
  '.ogggogggo.',
  '..oogddoo..',
  '....od.....',
];

/** A 256 x 160 indexed picture: pixels[y * width + x] is an index into SPLASH_PALETTE. */
export function paintSplash() {
  const W = SPLASH_WIDTH, H = SPLASH_HEIGHT;
  const pixels = new Uint8Array(W * H);
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const set = (x, y, c) => { if (inside(x, y)) pixels[y * W + x] = c; };
  const get = (x, y) => (inside(x, y) ? pixels[y * W + x] : -1);
  const ellipse = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

  // Fill everything in a box that passes `test`, with a one-pixel outline around it.
  function shape(x0, y0, x1, y1, test, colour, outline = C.ink) {
    for (let y = y0 - 1; y <= y1 + 1; y++) {
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        if (test(x, y)) set(x, y, typeof colour === 'function' ? colour(x, y) : colour);
        else if (outline !== null && (test(x - 1, y) || test(x + 1, y) || test(x, y - 1) || test(x, y + 1))) set(x, y, outline);
      }
    }
  }

  function sprite(rows, x0, y0, { flip = false, scale = 1 } = {}) {
    rows.forEach((row, y) => [...row].forEach((ch, i) => {
      if (ch === '.') return;
      const x = flip ? row.length - 1 - i : i;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) set(x0 + x * scale + sx, y0 + y * scale + sy, SPRITE_COLOURS[ch]);
      }
    }));
  }

  const textWidth = (str, scale) => str.length * 6 * scale - scale;
  function text(str, x0, y0, scale, colour) {
    [...str].forEach((ch, n) => {
      const glyph = GLYPHS[ch];
      if (!glyph) return;
      glyph.forEach((row, gy) => [...row].forEach((bit, gx) => {
        if (bit !== '1') return;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) set(x0 + (n * 6 + gx) * scale + sx, y0 + gy * scale + sy, colour(gy));
        }
      }));
    });
  }

  // The night sky, hazing toward the horizon in an ordered dither.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) set(x, y, y > 64 && dither(x, y, (y - 64) / 80) ? C.haze : C.night);
  }
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(random() * W), y = 30 + Math.floor(random() * 84);
    set(x, y, random() < 0.2 ? C.steam : C.sky);
  }
  for (const [x, y] of [[22, 60], [230, 92], [200, 34], [34, 104]]) {
    set(x, y, C.porcelain);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) set(x + dx, y + dy, C.gold);
  }

  // Marquee: the title in chunky letters, gold fading to orange, with a hard red and black drop.
  const title = 'STEEPED IN TROUBLE';
  const tx = Math.floor((W - textWidth(title, 2)) / 2), ty = 5;
  text(title, tx + 2, ty + 2, 2, () => C.ink);
  text(title, tx + 1, ty + 1, 2, () => C.red);
  text(title, tx, ty, 2, (row) => (row < 4 ? C.gold : C.teaLight));
  for (let x = tx; x < tx + textWidth(title, 2); x++) {
    set(x, ty + 19, C.red);
    if (x % 4 < 2) set(x, ty + 21, C.gold);
  }

  // The table, and the cup's shadow on it.
  for (let y = 144; y < H; y++) {
    for (let x = 0; x < W; x++) set(x, y, y === 144 ? C.teaLight : y === 145 ? C.tea : C.teaDark);
  }
  for (let x = 0; x < W; x += 37) for (let y = 146; y < H; y++) set(x + (y & 1), y, C.ink);
  const shadow = ellipse(128, 147, 84, 3);
  for (let y = 144; y <= 150; y++) for (let x = 40; x <= 216; x++) if (shadow(x, y) && dither(x, y, 0.6)) set(x, y, C.ink);

  // The saucer, with a cobalt band.
  const saucer = ellipse(128, 137, 86, 10), saucerWell = ellipse(128, 136, 78, 7);
  shape(42, 127, 214, 147, saucer, (x, y) => (!saucerWell(x, y) ? C.cobalt : y > 137 ? C.silver : C.porcelain));

  // The foot and the handle sit behind the bowl.
  const foot = (x, y) => y >= 131 && y <= 138 && Math.abs(x - 128) <= 22 + (y - 131) / 2;
  shape(102, 130, 154, 139, foot, (x, y) => (y === 137 ? C.cobalt : x > 141 ? C.silver : C.porcelain));
  const outer = ellipse(190, 108, 15, 13), hole = ellipse(190, 108, 8, 6);
  shape(175, 95, 205, 121, (x, y) => x >= 178 && outer(x, y) && !hole(x, y), (x, y) => (y > 112 || x > 200 ? C.silver : C.porcelain));

  // The bowl of the cup: porcelain lit from the left, with a cobalt wave and flowers.
  const RIM_Y = 92, RIM_X = 61;
  const halfWidth = (y) => RIM_X * (1 - 0.46 * ((y - RIM_Y) / 42) ** 2);
  const bowl = (x, y) => y >= RIM_Y && y <= RIM_Y + 42 && Math.abs(x - 128) <= halfWidth(y);
  const rim = ellipse(128, RIM_Y, RIM_X, 14);
  shape(66, 77, 190, 135, (x, y) => bowl(x, y) || rim(x, y), (x, y) => {
    const across = (x - 128) / halfWidth(Math.max(y, RIM_Y));
    const bulge = Math.sqrt(Math.max(0, 1 - across * across));
    const wave = Math.round(RIM_Y + 11 + 4 * bulge + 1.5 * Math.sin(x * 0.55));
    if (y === wave || y === wave + 1) return C.cobalt;
    const flowerY = Math.round(RIM_Y + 26 + 3 * bulge);
    const flowerX = ((x - 128) % 14 + 14) % 14;
    if (Math.abs(across) < 0.85 && ((flowerX === 7 && Math.abs(y - flowerY) <= 1) || (Math.abs(flowerX - 7) === 1 && y === flowerY))) {
      return flowerX === 7 && y === flowerY ? C.sky : C.cobalt;
    }
    if (y === Math.round(RIM_Y + 37 + 2 * bulge)) return C.cobalt;
    if (across > 0.62 || (across > 0.42 && dither(x, y, 0.5))) return C.silver;
    return C.porcelain;
  });

  // The rim, the inside wall, and the tea with its swirl.
  const lip = ellipse(128, RIM_Y, RIM_X - 1, 13), band = ellipse(128, RIM_Y, RIM_X - 4, 11), tea = ellipse(128, RIM_Y + 1, 54, 9);
  for (let y = RIM_Y - 14; y <= RIM_Y + 14; y++) {
    for (let x = 66; x <= 190; x++) {
      if (!lip(x, y)) continue;
      if (tea(x, y)) set(x, y, y < RIM_Y - 4 ? C.teaDark : C.tea);
      else if (!band(x, y)) set(x, y, C.porcelain);
      else set(x, y, y < RIM_Y ? C.silver : C.cobalt);
    }
  }
  for (let a = 0; a < Math.PI * 5; a += 0.02) {
    const r = a / (Math.PI * 5);
    const x = Math.round(128 + 48 * r * Math.cos(a)), y = Math.round(RIM_Y + 1 + 8 * r * Math.sin(a));
    if (get(x, y) === C.tea || get(x, y) === C.teaDark) set(x, y, C.teaLight);
  }

  // Leaves bob in the tea and scale the rim; more drop in from the night.
  sprite(ANGRY_LEAF, 90, 85);
  sprite(ANGRY_LEAF, 152, 84, { flip: true });
  sprite(ANGRY_LEAF, 48, 70, { scale: 2 });
  sprite(ANGRY_LEAF, 186, 66, { flip: true, scale: 2 });
  sprite(ANGRY_LEAF, 208, 34, { flip: true, scale: 2 });
  sprite(ANGRY_LEAF, 14, 108, { scale: 2 });

  // A blast of steam from the spoon, and the leaf it just hit.
  for (const [cx, cy, r] of [[105, 46, 5], [93, 45, 4], [82, 44, 4], [72, 43, 3], [64, 42, 2]]) {
    const puff = ellipse(cx, cy, r + 0.4, r * 0.85 + 0.4);
    shape(cx - r, cy - r, cx + r, cy + r, puff, (x, y) => (x < cx && y < cy ? C.porcelain : C.steam), C.cobalt);
  }
  sprite(DIZZY_LEAF, 34, 32, { scale: 2 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    for (let d = 14; d <= 17; d++) set(Math.round(45 + d * Math.cos(a)), Math.round(41 + d * 0.85 * Math.sin(a)), d === 17 ? C.porcelain : C.gold);
  }

  // The hero: a silver spoon, handle down in the tea, bowl up, glasses on.
  shape(124, 66, 132, RIM_Y + 1, (x, y) => x >= 125 && x <= 131 && y >= 68 && y <= RIM_Y + 1,
    (x) => (x === 126 ? C.porcelain : x >= 130 ? C.steel : C.silver));
  const ripple = ellipse(128, RIM_Y + 2, 10, 2.4), rippleIn = ellipse(128, RIM_Y + 2, 8, 1.4);
  for (let y = RIM_Y - 2; y <= RIM_Y + 5; y++) {
    for (let x = 116; x <= 140; x++) {
      if (ripple(x, y) && !rippleIn(x, y) && (get(x, y) === C.tea || get(x, y) === C.teaDark)) set(x, y, C.teaLight);
    }
  }
  const head = ellipse(128, 52, 14, 18);
  shape(113, 33, 143, 71, head, (x, y) => {
    const light = -0.6 * (x - 128) / 14 - 0.8 * (y - 52) / 18;
    if (light > 0.55 || (light > 0.4 && dither(x, y, 0.5))) return C.porcelain;
    return light > -0.35 ? C.silver : C.steel;
  });
  for (const [x, y] of [[119, 40], [120, 39], [120, 40], [121, 39], [119, 41]]) set(x, y, C.porcelain);

  // Glasses, determined brows, gritted teeth, and a bead of sweat.
  for (const lx of [117, 132]) {
    for (let y = 48; y <= 53; y++) {
      for (let x = lx; x <= lx + 6; x++) {
        const edge = y === 48 || y === 53 || x === lx || x === lx + 6;
        set(x, y, edge ? C.ink : C.steam);
      }
    }
    set(lx + 1, 51, C.ink); set(lx + 2, 51, C.ink); set(lx + 1, 50, C.ink);
  }
  for (let x = 124; x <= 131; x++) set(x, 50, C.ink);
  for (const [x, y] of [[116, 44], [117, 44], [118, 45], [119, 45], [120, 46], [121, 46], [122, 47]]) {
    set(x, y, C.ink); set(256 - x, y, C.ink);
  }
  for (let y = 59; y <= 63; y++) {
    for (let x = 121; x <= 135; x++) {
      const edge = y === 59 || y === 63 || x === 121 || x === 135;
      set(x, y, edge || ((x - 121) % 4 === 0 && y !== 61) ? C.ink : C.porcelain);
    }
  }
  for (const [x, y] of [[147, 40], [146, 41], [147, 41], [148, 41], [147, 42]]) set(x, y, C.steam);

  // Under the cup: the attract-mode line.
  const motto = 'DEFEND THE RIM';
  const mx = Math.floor((W - textWidth(motto, 1)) / 2);
  text(motto, mx + 1, 151, 1, () => C.ink);
  text(motto, mx, 150, 1, () => C.gold);

  return { width: W, height: H, pixels };
}

/**
 * Paint the splash picture onto a canvas at its native resolution.
 * @param {HTMLCanvasElement} canvas
 * @returns {boolean} true if it was drawn
 */
export function drawArcadeCenterpiece(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') return false;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const { width, height, pixels } = paintSplash();
  canvas.width = width;
  canvas.height = height;
  ctx.imageSmoothingEnabled = false;
  const image = ctx.createImageData(width, height);
  const rgb = SPLASH_PALETTE.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  pixels.forEach((index, i) => {
    image.data.set(rgb[index], i * 4);
    image.data[i * 4 + 3] = 255;
  });
  ctx.putImageData(image, 0, 0);
  return true;
}
