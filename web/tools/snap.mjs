// Headless test harness: runs the game in Node with scripted input and saves
// PNG screenshots of the emulated VGA display.
//
//   node web/tools/snap.mjs <script> [outdir]
//
// script: 'level1' | 'intro' | 'demo'

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [, , script = 'level1', outDir = 'snaps'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });

const target = new EventTarget();
globalThis.window = target;

const VGA = await import('../src/vga256.js');
const KB = await import('../src/keyboard.js');

VGA.setTurboClock(true);
KB.InitKeyBoard(target);

// --- PNG writer ------------------------------------------------------------
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function savePNG(file, w, h, rgba, scale = 2) {
  const W2 = w * scale, H2 = h * scale;
  const raw = Buffer.alloc((W2 * 4 + 1) * H2);
  for (let y = 0; y < H2; y++) {
    raw[y * (W2 * 4 + 1)] = 0;
    for (let x = 0; x < W2; x++) {
      const s = ((Math.floor(y / scale) * w) + Math.floor(x / scale)) * 4;
      const d = y * (W2 * 4 + 1) + 1 + x * 4;
      raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2]; raw[d + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W2, 0);
  ihdr.writeUInt32BE(H2, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

const frame = new Uint8Array(320 * 200 * 4);
const frame32 = new Uint32Array(frame.buffer);
function snap(name) {
  VGA.renderFrame(frame32);
  const file = path.join(outDir, `${name}.png`);
  savePNG(file, 320, 200, frame);
  console.log('saved', file, 'frame', VGA.getFrameCounter());
}

let done = false;
const errors = [];

// --- input -----------------------------------------------------------------
function key(code, down) {
  const e = new Event(down ? 'keydown' : 'keyup');
  Object.defineProperty(e, 'code', { value: code });
  Object.defineProperty(e, 'repeat', { value: false });
  target.dispatchEvent(e);
}

async function frames(n) {
  const start = VGA.getFrameCounter();
  while (VGA.getFrameCounter() < start + n && !done) await new Promise((r) => setTimeout(r, 0));
}

async function press(code, n = 2) {
  key(code, true);
  await frames(n);
  key(code, false);
  await frames(2);
}

// --- scripts ---------------------------------------------------------------
const { RAW } = await import('../src/data.js');
const { PlayWorld } = await import('../src/play.js');
const { InitPlayerFigures } = await import('../src/players.js');
const { InitEnemyFigures } = await import('../src/enemies.js');
const { B } = await import('../src/buffers.js');


async function runLevel(n) {
  const L = [['1A', '1B'], ['2A', '2B'], ['3A', '3B'], ['5A', '5B'], ['6A', '6B'], ['4A', '4B']][n];
  InitPlayerFigures();
  InitEnemyFigures();
  B.Data.Lives[0] = 3;
  if (process.env.LUIGI) B.Character[0] = 1;
  const r = await PlayWorld('x', String(n + 1), RAW[`LEVEL_${L[0]}`], RAW[`OPTIONS_${L[0]}`],
    RAW[`OPT_${L[0]}`], RAW[`LEVEL_${L[1]}`], RAW[`OPTIONS_${L[1]}`], RAW[`OPTIONS_${L[1]}`], 0);
  done = true;
  return r;
}

const scripts = {
  async level1() {
    const lvl = Number(process.env.LEVEL || 0);
    runLevel(lvl).catch((e) => { errors.push(e); done = true; });
    await frames(80);
    snap(`L${lvl + 1}-start`);
    if (process.env.ONLYSTART) { B.QuitGame = true; return; }
    key('KeyD', true);
    for (let i = 1; i <= 6; i++) {
      await frames(60);
      if (i % 2 === 0) await press('KeyM', 20);
      snap(`L${lvl + 1}-run${i}`);
    }
    key('KeyD', false);
    B.QuitGame = true;
  },
  async intro() {
    const { Main } = await import('../src/mario.js');
    Main().catch((e) => { errors.push(e); done = true; });
    await frames(150);
    snap('intro-menu');
    await press('Enter');
    await frames(10);
    snap('intro-start');
    await press('Enter');
    await frames(10);
    snap('intro-players');
    await press('Enter');
    await frames(60);
    snap('player-name');
    await frames(200);
    snap('level1-begin');
  },
  async levelselect() {
    const { Main } = await import('../src/mario.js');
    Main().catch((e) => { errors.push(e); done = true; });
    await frames(150);
    await press('ArrowDown');
    await frames(5);
    snap('menu-levelselect');
    await press('Enter');
    await frames(5);
    snap('levels-1');
    for (let i = 0; i < 7; i++) await press('ArrowDown');
    await frames(5);
    snap('levels-2');
    await press('Enter');
    await frames(300);
    snap('area2-play');
  },
  async demo() {
    const { Main } = await import('../src/mario.js');
    Main().catch((e) => { errors.push(e); done = true; });
    await frames(700);
    for (let i = 0; i < 8; i++) {
      await frames(100);
      snap(`demo-${i}`);
    }
  },
};

await scripts[script]();
if (errors.length) {
  console.error('ERRORS:', errors);
  process.exit(1);
}
process.exit(0);
