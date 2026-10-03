// Easter egg at the bottom of the settings panel: Mario and Luigi drawn with
// the original sprites and palette. Tap them and they jump to the "?" block.

import { RAW } from './data.js';

const W = 128;
const H = 80;
const GROUND = 62;
const BLOCK_Y = 18;

const pal = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  const c = (k) => { const v = RAW.PAL256[i * 3 + k] & 63; return (v << 2) | (v >> 4); };
  pal[i] = 0xFF000000 | (c(2) << 16) | (c(1) << 8) | c(0);
}
// coin colours are animated by the game; use their bright phase
pal[12] = 0xFF50E0F8; pal[13] = 0xFF58E0F0; pal[14] = 0xFF90FCFC;

function sprite(buf, data, w, h, X, Y, mirror = false) {
  const bpl = w >> 2;
  for (let y = 0; y < h; y++) {
    const py = Math.round(Y) + y;
    if (py < 0 || py >= H) continue;
    for (let x = 0; x < w; x++) {
      const sx = mirror ? w - 1 - x : x;
      const c = data[(sx & 3) * h * bpl + y * bpl + (sx >> 2)];
      const px = Math.round(X) + x;
      if (c && px >= 0 && px < W) buf[py * W + px] = pal[c];
    }
  }
}

export function initEaster(container) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.className = 'easter';
  canvas.title = '¿?';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const buf = new Uint32Array(img.data.buffer);

  const heroes = [
    { walk: RAW.LWMAR000, jump: RAW.LJMAR000, x: 30, y: GROUND - 28, vy: 0, delay: 0, mirror: true },
    { walk: RAW.LWLUI000, jump: RAW.LJLUI000, x: 78, y: GROUND - 28, vy: 0, delay: 0, mirror: false },
  ];
  let bump = 0;
  let coin = null;
  let running = false;
  let visible = false;

  function draw() {
    // sky gradient (sky type 10 of the game)
    for (let y = 0; y < H; y++) {
      const j = Math.min(15, (y * 16 / GROUND) | 0);
      const v = [27 - j, 43 - j, 63 - j].map((q) => Math.min(255, ((q << 2) | (q >> 4)) + 60));
      const c = 0xFF000000 | (v[2] << 16) | (v[1] << 8) | v[0];
      buf.fill(c, y * W, y * W + W);
    }
    for (let x = -4; x < W; x += 20) {
      sprite(buf, RAW.GREEN001, 20, 14, x, GROUND);
      sprite(buf, RAW.GREEN004, 20, 14, x, GROUND + 14);
    }
    if (coin) sprite(buf, RAW.COIN000, 20, 14, 54, coin.y);
    const lift = bump > 2 ? 4 - bump : bump; // block bumps up and back
    sprite(buf, bump > 0 ? RAW.QUEST001 : RAW.QUEST000, 20, 14, 54, BLOCK_Y - lift);
    for (const h of heroes) sprite(buf, h.vy !== 0 || h.y < GROUND - 28 ? h.jump : h.walk, 20, 28, h.x, h.y, h.mirror);
    ctx.putImageData(img, 0, 0);
  }

  function step() {
    let active = false;
    for (const h of heroes) {
      if (h.delay > 0) { h.delay--; active = true; continue; }
      if (h.vy !== 0 || h.y < GROUND - 28) {
        h.vy += 0.32;
        h.y += h.vy;
        if (h.y >= GROUND - 28) { h.y = GROUND - 28; h.vy = 0; }
        active = true;
      }
    }
    if (bump > 0) { bump -= 0.5; active = true; }
    if (coin) {
      coin.vy += 0.3;
      coin.y += coin.vy;
      if (coin.vy > 0 && coin.y >= BLOCK_Y) coin = null;
      active = true;
    }
    draw();
    if (active) requestAnimationFrame(step);
    else running = false;
  }

  canvas.addEventListener('click', () => {
    if (heroes.some((h) => h.vy !== 0 || h.delay > 0)) return;
    heroes[0].vy = -4.6;
    heroes[1].delay = 9;
    heroes[1].vy = -4.6;
    bump = 4;
    coin = { y: BLOCK_Y, vy: -3.2 };
    if (!running) {
      running = true;
      requestAnimationFrame(step);
    }
  });

  // first paint when it scrolls into view
  new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !visible) {
      visible = true;
      draw();
    }
  }).observe(canvas);
}
