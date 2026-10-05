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
    await press('Enter'); // 1 PLAYER
    await press('Enter'); // NO SAVE
    await press('ArrowDown');
    await press('ArrowDown');
    await frames(5);
    snap('menu-levelselect');
    await press('Enter'); // LEVEL SELECT
    await frames(5);
    snap('levels-1');
    for (let i = 0; i < 7; i++) await press('ArrowDown');
    await frames(5);
    snap('levels-2');
    await press('Enter');
    await frames(300);
    snap('area2-play');
  },
  // SMB=1-1 node tools/snap.mjs smb <dir>   (EXIT=1: start next to the exit pipe)
  async smb() {
    const id = process.env.SMB || '1-1';
    const { smbLevel } = await import('../src/smb.js');
    const { map, options } = smbLevel(id);
    const opt = options.slice();
    if (process.env.EXIT) {
      const w = map.length / 13 | 0;
      const x = (w - 5) * 20 + 10; // centred over the exit pipe
      opt[0] = x & 0xFF; opt[1] = x >> 8;
      opt[2] = (2 * 14) & 0xFF; opt[3] = 0;
    }
    InitPlayerFigures();
    InitEnemyFigures();
    B.Data.Lives[0] = 3;
    B.Versus = !!process.env.VERSUS; // VERSUS=1: two players
    let result = null;
    PlayWorld(id[0], id[2], map, opt, opt, map, opt, opt, 0)
      .then((r) => { result = r; done = true; })
      .catch((e) => { errors.push(e); done = true; });
    await frames(90);
    snap(`smb-${id}-start`);
    if (process.env.EXIT) {
      // Mario falls onto the exit pipe; press down to enter it
      await frames(40);
      key('KeyS', true);
      await frames(400);
      key('KeyS', false);
      console.log('EXIT RESULT', result, 'passed', B.Passed);
      return;
    }
    key('KeyD', true);
    for (let i = 1; i <= 3; i++) {
      await frames(70);
      await press('KeyM', 18);
      snap(`smb-${id}-run${i}`);
    }
    key('KeyD', false);
    B.QuitGame = true;
  },
  async smbmenu() {
    const { Main } = await import('../src/mario.js');
    const { PS } = await import('../src/play.js');
    Main().catch((e) => { errors.push(e); done = true; });
    await frames(150);
    await press('Enter'); // 1 PLAYER
    await press('Enter'); // NO SAVE
    await press('ArrowDown');
    await frames(5);
    snap('smbmenu-menu');
    PS.Stat = true;
    await press('Enter'); // SMB 1
    await frames(330);
    snap('smbmenu-level');
  },
  // A level saved with the editor appears at the end of LEVEL SELECT
  async mylevel() {
    const store = new Map();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    } });
    const L = await import('../src/levels.js');
    const lv = L.loadBuiltin('orig:1');
    lv.name = 'Mi nivel de prueba';
    for (let x = 4; x < 12; x++) lv.areas[0].cells[x * 13 + 6] = 0x2A; // a row of coins
    L.saveMyLevel(lv);
    const { Main } = await import('../src/mario.js');
    Main().catch((e) => { errors.push(e); done = true; });
    await frames(150);
    await press('Enter'); // 1 PLAYER
    await press('Enter'); // NO SAVE
    await press('ArrowDown');
    await press('ArrowDown');
    await press('Enter'); // LEVEL SELECT
    await press('ArrowUp'); // wraps to the last entry: the saved level
    await frames(5);
    snap('mylevel-list');
    await press('Enter');
    await frames(300);
    snap('mylevel-play');
  },
  // VERSUS from the title menu: player 1 (D, M) and player 2 (arrows, '.')
  // run at the same time; the camera follows both.
  async versus() {
    const { Main } = await import('../src/mario.js');
    const { VS } = await import('../src/players.js');
    const { PS } = await import('../src/play.js');
    Main().catch((e) => { errors.push(e); done = true; });
    await frames(150);
    await press('ArrowDown');
    await press('ArrowDown');
    await frames(5);
    snap('versus-menu');
    await press('Enter'); // 2 PLAYERS VERSUS
    await press('Enter'); // NO SAVE
    await frames(5);
    snap('versus-levels');
    PS.Stat = true;
    if (process.env.SMB) await press('ArrowDown');
    await press('Enter');
    await frames(330);
    snap('versus-start');
    const log = (t) => console.log(t, 'versus', B.Versus, 'XView', B.XView, 'lives', B.Data.Lives[0],
      'down', VS.down.join(','), 'score', B.Data.Score[0], 'coins', B.Data.Coins[0]);
    log('start');
    // only player 1 runs: player 2 is held at the left edge of the screen
    key('KeyD', true);
    for (let i = 1; i <= 3; i++) {
      await frames(60);
      if (i === 2) await press('KeyM', 20);
      snap(`versus-p1-${i}`);
      log(`p1 run ${i}`);
    }
    // now player 2 runs too
    key('ArrowRight', true);
    for (let i = 1; i <= 8; i++) {
      await frames(70);
      if (i % 2 === 0) {
        await press('Period', 20);
        await press('KeyM', 20);
      }
      snap(`versus-both-${i}`);
      log(`both run ${i}`);
    }
    key('KeyD', false);
    key('ArrowRight', false);
    B.QuitGame = true;
    await frames(200);
  },
  // VERSUS: player 2 dies alone (costs a life, reappears next to player 1)
  async versusdeath() {
    const { Main } = await import('../src/mario.js');
    const { VS, selectPlayer } = await import('../src/players.js');
    const { E } = await import('../src/enemies.js');
    const { PS } = await import('../src/play.js');
    Main().catch((e) => { errors.push(e); done = true; });
    await frames(150);
    await press('ArrowDown');
    await press('ArrowDown');
    await press('Enter'); // 2 PLAYERS VERSUS
    await press('Enter'); // NO SAVE
    PS.Stat = true;
    await press('Enter'); // ORIGINAL
    await frames(330);
    const log = (t) => console.log(t.padEnd(26), 'lives', B.Data.Lives[0], 'down', VS.down.join(','),
      'respawn', VS.respawn.join(','), 'GameDone', B.GameDone);
    const hit = (i) => { selectPlayer(i); E.cdHit = 1; selectPlayer(0); };
    key('KeyD', true);
    await frames(40);
    hit(1); // player 2 dies: a life is taken, it comes back
    await frames(30);
    snap('vd-dying');
    log('p2 dying');
    await frames(90);
    snap('vd-down');
    log('p2 down (3 -> 2)');
    await frames(120);
    snap('vd-respawn');
    log('p2 back');
    hit(0); // player 1 dies alone: 2 -> 1
    await frames(400);
    log('p1 back (2 -> 1)');
    hit(1); // last life: player 2 waits, the game goes on
    await frames(400);
    snap('vd-waiting');
    log('p2 waits (last life)');
    const { AddLife } = await import('../src/tmpobj.js');
    AddLife(); // a 1UP: player 2 comes back with it
    await frames(150);
    snap('vd-life');
    log('1UP: p2 back');
    await frames(150); // until it stops blinking (it cannot be hurt)
    hit(1); // waits again
    await frames(300);
    log('p2 waits again');
    hit(0); // and player 1 dies too: game over
    await frames(500);
    snap('vd-gameover');
    log('both down: game over');
    key('KeyD', false);
    B.QuitGame = true;
    await frames(200);
  },
  // VERSUS: player 1 goes down the pipe to area 2 of level 1 ($E1) and
  // player 2, far away, comes along
  async versuspipe() {
    const map = RAW.LEVEL_1A;
    let px = -1, py = -1;
    for (let x = 0; map[x * 13]; x++)
      for (let i = 2; i <= 13; i++) // pipe entry: '0' just below it
        if (map[x * 13 + i - 1] === 0xE1 && map[x * 13 + i - 2] === 0x30) { px = x; py = 13 - i; }
    console.log('pipe at', px, py);
    const opt = RAW.OPTIONS_1A.slice();
    const x = px * 20 + 10;
    opt[0] = x & 0xFF; opt[1] = x >> 8;
    opt[2] = (py - 2) * 14; opt[3] = 0;
    InitPlayerFigures();
    InitEnemyFigures();
    B.Data.Lives[0] = 3;
    B.Versus = true;
    const { VS, selectPlayer, playerX, playerY } = await import('../src/players.js');
    PlayWorld('x', '1', RAW.LEVEL_1A, opt, opt, RAW.LEVEL_1B, RAW.OPTIONS_1B, RAW.OPTIONS_1B, 0)
      .then(() => { done = true; })
      .catch((e) => { errors.push(e); done = true; });
    await frames(90);
    key('ArrowLeft', true); // player 2 walks away
    await frames(60);
    key('ArrowLeft', false);
    snap('vp-before');
    const pos = () => [0, 1].map((i) => { selectPlayer(i); return `${playerX()},${playerY()}`; }).join(' ');
    console.log('before', pos(), 'XView', B.XView);
    selectPlayer(0);
    key('KeyS', true);
    await frames(250);
    key('KeyS', false);
    await frames(150);
    snap('vp-after');
    console.log('after', pos(), 'XView', B.XView, 'down', VS.down.join(','));
    selectPlayer(0);
    B.QuitGame = true;
    await frames(100);
  },
  // Frames for the README gameplay GIF: START VERSUS with scripted input for
  // both players. PLAN="frame:code:down|up,..." overrides the default plan.
  // Frames go to <outdir>/rec-NNNN.png (320x200).
  async versusrec() {
    const { Main } = await import('../src/mario.js');
    Main().catch((e) => { errors.push(e); done = true; });
    await frames(150);
    let n = 0;
    const rec = () => {
      VGA.renderFrame(frame32);
      savePNG(path.join(outDir, `rec-${String(n++).padStart(4, '0')}.png`), 320, 200, frame, 1);
    };
    const recFrames = async (k) => {
      for (let i = 0; i < k && !done; i++) {
        await frames(1);
        if (VGA.getFrameCounter() % 3 === 0) rec();
      }
    };
    const tap = async (code) => {
      key(code, true);
      await recFrames(3);
      key(code, false);
      await recFrames(12);
    };
    await recFrames(20);
    await tap('ArrowDown');
    await tap('ArrowDown');
    await recFrames(80); // player 2 walks in next to Mario
    await tap('Enter'); // 2 PLAYERS VERSUS
    await recFrames(20);
    await tap('Enter'); // NO SAVE
    await recFrames(20);
    await tap('Enter'); // ORIGINAL
    await recFrames(320); // player name and level fade in
    const plan = (process.env.PLAN || '0:KeyD:1,30:ArrowRight:1').split(',').map((t) => {
      const [f, code, d] = t.split(':');
      return { f: Number(f), code, down: d === '1' };
    });
    const total = Number(process.env.LEN || 700);
    for (let f = 0; f < total && !done; f++) {
      for (const p of plan) if (p.f === f) key(p.code, p.down);
      await recFrames(1);
    }
    console.log('recorded', n, 'frames; lives', B.Data.Lives[0], 'XView', B.XView);
    B.QuitGame = true;
  },
  // Game save: 2 PLAYERS, GAME SELECT, empty slot 1, SMB 1; after the
  // first level the slot shows SMB and 2P. END opens the settings (hook).
  async savegame() {
    const store = new Map();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    } });
    const { Main } = await import('../src/mario.js');
    const { PS } = await import('../src/play.js');
    let ended = 0;
    PS.onEnd = () => { ended++; };
    Main().catch((e) => { errors.push(e); done = true; });
    await frames(150);
    for (let i = 0; i < 4; i++) await press('ArrowDown');
    await press('Enter'); // END
    await frames(5);
    console.log('END opened settings:', ended);
    await press('ArrowDown'); // wraps to 1 PLAYER
    await press('ArrowDown'); // 2 PLAYERS
    await press('Enter');
    await press('ArrowDown'); // GAME SELECT
    await press('Enter');
    await frames(5);
    snap('save-slots-empty');
    await press('Enter'); // slot 1 (empty) -> package
    await frames(5);
    snap('save-package');
    await press('ArrowDown');
    await press('Enter'); // SMB 1
    await frames(400);
    B.Data.Progress[0] = 2; // as if 1-1 and 1-2 were passed
    B.QuitGame = true;
    await frames(300);
    const g = JSON.parse(store.get('mario-luigi-config')).Games[0];
    console.log('slot 1:', g.Package, g.NumPlayers, g.Progress);
    await press('Enter'); // 1 PLAYER
    await press('ArrowDown');
    await press('Enter'); // GAME SELECT
    await frames(5);
    snap('save-slots-used');
  },
  // Title menu: player 2 walks in on 2 PLAYERS VERSUS and out again.
  // Frames go to <outdir>/title-NNNN.png (320x200), one every 2 frames.
  async titlep2() {
    const { Main } = await import('../src/mario.js');
    Main().catch((e) => { errors.push(e); done = true; });
    await frames(150);
    let n = 0;
    const rec = async (k) => {
      for (let i = 0; i < k; i++) {
        await frames(1);
        if (VGA.getFrameCounter() % 2 === 0) {
          VGA.renderFrame(frame32);
          savePNG(path.join(outDir, `title-${String(n++).padStart(4, '0')}.png`), 320, 200, frame, 1);
        }
      }
    };
    await rec(10);
    for (const code of ['ArrowDown', 'ArrowDown']) {
      key(code, true);
      await rec(3);
      key(code, false);
      await rec(10);
    }
    await rec(100); // walks in and stands next to Mario
    key('ArrowUp', true);
    await rec(3);
    key('ArrowUp', false);
    await rec(100); // walks out
    console.log('recorded', n);
  },
  // Screenshots of the title menus for the README (saved games and an
  // editor level are made up in a temporary localStorage)
  async readmeshots() {
    const store = new Map();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    } });
    const game = (progress, players, pack, versus) => ({
      NumPlayers: players, Progress: [progress, players === 2 ? progress : 0], Lives: [3, 3],
      Coins: [0, 0], Score: [0, 0], Mode: [0, 0], Package: pack, Versus: versus,
    });
    store.set('mario-luigi-config', JSON.stringify({
      Sound: true, SLine: true, UseJS: true,
      Games: [game(3, 1, 'original', false), game(4, 2, 'smb', false), game(8, 1, 'original', true)],
    }));
    const L = await import('../src/levels.js');
    const lv = L.loadBuiltin('orig:1');
    lv.name = 'Mi nivel';
    L.saveMyLevel(lv);
    const { Main } = await import('../src/mario.js');
    Main().catch((e) => { errors.push(e); done = true; });
    await frames(150);
    snap('readme-menu');
    await press('ArrowDown');
    await press('ArrowDown');
    await frames(90); // player 2 walks in
    snap('readme-menu-versus');
    await press('Enter'); // 2 PLAYERS VERSUS
    await frames(5);
    snap('readme-save');
    await press('ArrowDown');
    await press('Enter'); // GAME SELECT
    await frames(5);
    snap('readme-slots');
    await press('Escape');
    await press('Enter'); // NO SAVE
    await frames(5);
    snap('readme-package');
    await press('ArrowDown');
    await press('ArrowDown');
    await press('Enter'); // LEVEL SELECT
    await press('ArrowUp'); // wraps to the last entries: SMB and editor levels
    await press('ArrowUp');
    await frames(5);
    snap('readme-levels');
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
