// Generates the app icons from the game's own sprites and palette.
//
//   node web/tools/icons.mjs
//
// The icon is a tiny scene drawn in game pixels (sky, grass ground, Mario)
// and enlarged with nearest-neighbour scaling, so it keeps the pixel look.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '..', 'icons');
const { RAW } = await import('../src/data.js');

const pal = RAW.PAL256;
const rgb = (i) => [pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2]].map((v) => ((v & 63) << 2) | ((v & 63) >> 4));

// Sprites are stored in the 4-plane VGA layout: plane k holds the pixels
// with x mod 4 = k, Height lines of Width/4 bytes each.
function planarPixel(data, w, h, x, y) {
  const bpl = w >> 2;
  return data[(x & 3) * h * bpl + y * bpl + (x >> 2)];
}

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 4);
  }
  set(x, y, [r, g, b]) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 4;
    this.px[o] = r; this.px[o + 1] = g; this.px[o + 2] = b; this.px[o + 3] = 255;
  }
  sprite(data, w, h, X, Y, { mirror = false, opaque = false } = {}) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const c = planarPixel(data, w, h, mirror ? w - 1 - x : x, y);
        if (c || opaque) this.set(X + x, Y + y, rgb(c));
      }
  }
  scaled(size) {
    const out = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const sx = Math.min(this.w - 1, Math.floor((x * this.w) / size));
        const sy = Math.min(this.h - 1, Math.floor((y * this.h) / size));
        const s = (sy * this.w + sx) * 4;
        out.set(this.px.subarray(s, s + 4), (y * size + x) * 4);
      }
    return out;
  }
}

// Sky gradient from the game's sky type 10 palette (27-j, 43-j, 63-j)
function scene(n, marioX, marioY, groundY) {
  const c = new Canvas(n, n);
  for (let y = 0; y < n; y++) {
    const j = Math.min(15, Math.floor((y * 16) / n));
    const v = [27 - j, 43 - j, 63 - j].map((v) => (v << 2) | (v >> 4));
    for (let x = 0; x < n; x++) c.set(x, y, v.map((k, i) => Math.min(255, k + 70 - [0, 20, 40][i])));
  }
  // grass ground: top rows of the green ground tile, repeated
  for (let x = -20; x < n; x += 20) c.sprite(RAW.GREEN001, 20, 14, x, groundY, { opaque: true });
  for (let x = -20; x < n; x += 20) c.sprite(RAW.GREEN001, 20, 14, x, groundY + 14, { opaque: true });
  // big Mario, walking to the right
  c.sprite(RAW.LWMAR000, 20, 28, marioX, marioY, { mirror: true });
  return c;
}

fs.mkdirSync(OUT, { recursive: true });
const write = (name, size, rgba) => {
  fs.writeFileSync(path.join(OUT, name), encodePNG(size, size, rgba));
  console.log('icons/' + name);
};

// Regular icon: 32x32 game pixels
const icon = scene(32, 6, 2, 29);
for (const size of [32, 180, 192, 512]) {
  const name = size === 180 ? 'apple-touch-icon.png' : size === 32 ? 'favicon-32.png' : `icon-${size}.png`;
  write(name, size, icon.scaled(size));
}

// Maskable icon: 40x40 game pixels, Mario inside the central safe zone
const mask = scene(40, 10, 5, 33);
write('icon-maskable-512.png', 512, mask.scaled(512));
