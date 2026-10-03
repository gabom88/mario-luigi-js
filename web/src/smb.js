// "START SMB 1": the Super Mario Bros. (NES) levels of the Video Game Level
// Corpus, converted to the map format of Mike Wiering's engine.
//
// VGLC level: 14 text rows (top row always empty), one char per 16x16 tile.
// Engine map: 13 rows, stored column by column, bottom row first (the same
// format as the levels in WORLDS.PAS), terminated by #0.

import { SMB_TEXT } from './smbdata.js';
import { RAW } from './data.js';
import { NV, W, H } from './buffers.js';

// Order of play (VGLC has no castles or water levels)
export const SMB_LEVELS = [
  '1-1', '1-2', '1-3', '2-1', '3-1', '3-3', '4-1', '4-2',
  '5-1', '5-3', '6-1', '6-2', '6-3', '7-1', '8-1',
];

// Look of each level, taken from the options of the original levels
const THEME = {
  day: 'OPTIONS_6A', // blue sky, green ground, round hills
  hills: 'OPTIONS_5A', // light sky and mountains
  night: 'OPT_6A', // night sky
  underground: 'OPTIONS_1B', // brick walls, animated brick background
  treetop: 'OPTIONS_3A', // palm trees
  treetopNight: 'OPT_3A',
  plains: 'OPTIONS_1A', // brown ground, hills
  sunset: 'OPT_1A', // evening sky, mountains
  dusk: 'OPT_5A',
};

const LEVEL_THEME = {
  '1-1': 'day', '1-2': 'underground', '1-3': 'treetop', '2-1': 'hills',
  '3-1': 'night', '3-3': 'treetopNight', '4-1': 'day', '4-2': 'underground',
  '5-1': 'hills', '5-3': 'treetop', '6-1': 'night', '6-2': 'plains',
  '6-3': 'treetopNight', '7-1': 'sunset', '8-1': 'dusk',
};

const ch = (s) => s.charCodeAt(0);
const SP = 0x20;

// Engine codes
const GOOMBA = 0x80; // tpChibibo
const PIRANHA = 0x84; // tpVertPlant, comes out when Mario is not next to it
const KOOPA_GREEN = 0x88;
const KOOPA_RED = 0x89; // turns around at edges
const POWERUP = 0xE0; // above a '?': mushroom (small Mario) or flower
const EXIT = 0xE7; // above a pipe top: leaves the level

const TILE = {
  X: 'A', // ground and hard blocks: the wall builder gives them grass edges
  S: 'J', // breakable brick
  Q: '?', // question block with a coin
  '?': '?', // question block with a power-up
  '<': '0', '>': '1', '[': '2', ']': '3', // pipe
  o: '*', // coin
  B: 'I', b: 'I', // cannon (not in this engine): solid block
  '-': ' ',
};

const cache = {};

function convert(id) {
  const text = SMB_TEXT[id];
  const rows = text.slice(text.length - NV); // drop the empty top row
  const width = Math.max(...rows.map((r) => r.length));
  const world = Number(id[0]);
  const third = id[2] === '3';
  // g[row][col], row 0 = top
  const g = rows.map((r) => Array.from(r.padEnd(width, '-'), (c) => ch(TILE[c] ?? ' ')));
  const src = rows.map((r) => r.padEnd(width, '-'));

  // Floating platforms one tile thick (tree tops, bridges) would be drawn as
  // plain filler by the wall builder: use wooden planks for them.
  for (let r = 0; r < NV - 1; r++)
    for (let c = 0; c < width; c++)
      if (src[r][c] === 'X' && src[r + 1][c] !== 'X' && (r === 0 || src[r - 1][c] !== 'X')) g[r][c] = ch('W');

  let enemies = 0;
  for (let r = 0; r < NV; r++) {
    for (let c = 0; c < width; c++) {
      const s = src[r][c];
      if (s === 'E') {
        let code = GOOMBA;
        if (third && enemies % 3 === 1) code = KOOPA_RED;
        else if (world >= 2 && enemies % 4 === 3) code = KOOPA_GREEN;
        g[r][c] = code;
        enemies++;
      }
    }
  }
  // Power-ups: the engine reads the content of a '?' from the cell above
  for (let r = 1; r < NV; r++)
    for (let c = 0; c < width; c++)
      if (src[r][c] === '?' && g[r - 1][c] === SP) g[r - 1][c] = POWERUP;

  // The flag pole base: a lone block on the ground near the end
  for (let c = width - 8; c < width; c++) {
    const r = NV - 2;
    if (src[r][c] === 'X' && src[r - 1][c] === '-' && src[r][c - 1] === '-' && src[r][c + 1] !== 'X')
      g[r][c] = SP;
  }

  // Piranha plants in the pipes (from 1-2 on, as in Super Mario Bros.)
  if (id !== '1-1') {
    for (let r = 2; r < NV; r++)
      for (let c = 10; c < width - 10; c++)
        if (src[r][c] === '<' && g[r - 1][c] === SP && g[r - 2][c] === SP) g[r - 2][c] = PIRANHA;
  }

  // Exit pipe instead of the flag: stand on it and press down
  const c = width - 5;
  for (let r = 0; r < NV; r++) {
    g[r][c] = SP;
    g[r][c + 1] = SP;
  }
  g[NV - 4][c] = EXIT;
  g[NV - 4][c + 1] = EXIT;
  g[NV - 3][c] = ch('0');
  g[NV - 3][c + 1] = ch('1');
  g[NV - 2][c] = ch('2');
  g[NV - 2][c + 1] = ch('3');
  g[NV - 1][c] = ch('A');
  g[NV - 1][c + 1] = ch('A');

  // Column by column, bottom row first, then the #0 terminator
  const map = new Uint8Array(width * NV + 1);
  for (let x = 0; x < width; x++)
    for (let i = 1; i <= NV; i++) map[x * NV + i - 1] = g[NV - i][x];

  const opt = Uint8Array.from(RAW[THEME[LEVEL_THEME[id]]]);
  // Opt_5a asks for wall type 6, which does not exist (in the original the
  // ground kept whatever the previous level had loaded): use green ground.
  const WALL_TYPE1 = 5;
  if (opt[WALL_TYPE1] === 6) opt[WALL_TYPE1] = 0;
  const initX = 2 * W + 10;
  const initY = 10 * H;
  opt[0] = initX & 0xFF; opt[1] = initX >> 8;
  opt[2] = initY & 0xFF; opt[3] = initY >> 8;
  return { map, options: opt, width };
}

export function smbLevel(id) {
  if (!cache[id]) cache[id] = convert(id);
  return cache[id];
}
