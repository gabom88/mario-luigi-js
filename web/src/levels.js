// Level model shared by the game and the level editor.
//
// A level has one or two areas (like the original levels: the main area and
// the area reached through a pipe). An area is a grid of NV (13) rows by
// `width` columns of engine codes (bytes, same meaning as in WORLDS.PAS)
// plus its options (sky, walls, colours, start position...).
//
// cells[x * NV + y], y = 0 is the top row.

import { RAW } from './data.js';
import { NV, W, H, optionsFromBytes } from './buffers.js';
import { SMB_LEVELS, smbLevel } from './smb.js';

export { NV };

export const OPTION_FIELDS = [
  'SkyType', 'WallType1', 'WallType2', 'WallType3', 'PipeColor',
  'GroundColor1', 'GroundColor2', 'Horizon', 'BackGrType', 'BackGrColor1',
  'BackGrColor2', 'Stars', 'Clouds', 'Design', 'C2r', 'C2g', 'C2b',
  'C3r', 'C3g', 'C3b', 'BrickColor', 'WoodColor', 'XBlockColor',
];

export const MAX_WIDTH = 600;
export const MAX_ZONES = 8;
export const MIN_WIDTH = 17;

const SP = 0x20;

export function optionsToBytes(o) {
  const b = new Uint8Array(4 + OPTION_FIELDS.length);
  b[0] = o.InitX & 0xFF;
  b[1] = (o.InitX >> 8) & 0xFF;
  b[2] = o.InitY & 0xFF;
  b[3] = (o.InitY >> 8) & 0xFF;
  OPTION_FIELDS.forEach((n, i) => { b[4 + i] = (o[n] ?? 0) & 0xFF; });
  return b;
}

function cleanOptions(o) {
  const out = { InitX: o.InitX | 0, InitY: o.InitY | 0 };
  for (const n of OPTION_FIELDS) out[n] = (o[n] ?? 0) & 0xFF;
  return out;
}

// --- areas -------------------------------------------------------------------

export function newArea(width = 60, options = null) {
  const cells = new Uint8Array(width * NV).fill(SP);
  for (let x = 0; x < width; x++) {
    cells[x * NV + NV - 1] = 0x41; // 'A' ground
    cells[x * NV + NV - 2] = 0x41;
  }
  const opt = cleanOptions(options || optionsFromBytes(RAW.OPTIONS_6A));
  // terrains 2 and 3 of the editor: sand and brown by default
  if (!options) {
    opt.WallType2 = 1;
    opt.WallType3 = 3;
  }
  return { width, cells, options: opt };
}

// map: engine map bytes (column by column, bottom row first, #0 at the end)
export function areaFromEngine(map, opt) {
  let width = 0;
  while (width * NV < map.length && map[width * NV] !== 0 && width < MAX_WIDTH) width++;
  const cells = new Uint8Array(width * NV);
  for (let x = 0; x < width; x++)
    for (let i = 1; i <= NV; i++) cells[x * NV + (NV - i)] = map[x * NV + i - 1] || SP;
  return { width, cells, options: cleanOptions(optionsFromBytes(opt)) };
}

export function areaToEngine(area) {
  const map = new Uint8Array(area.width * NV + 1);
  for (let x = 0; x < area.width; x++)
    for (let i = 1; i <= NV; i++) map[x * NV + i - 1] = area.cells[x * NV + (NV - i)] || SP;
  return { map, options: optionsToBytes(area.options) };
}

export function cloneArea(a) {
  return { width: a.width, cells: a.cells.slice(), options: { ...a.options } };
}

export function cloneLevel(l) {
  return { name: l.name, areas: l.areas.map((a) => (a ? cloneArea(a) : null)) };
}

// Change the width of an area (columns are added or removed at the end)
export function resizeArea(area, width) {
  width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width | 0));
  if (width === area.width) return area;
  const cells = new Uint8Array(width * NV).fill(SP);
  const keep = Math.min(width, area.width);
  cells.set(area.cells.subarray(0, keep * NV));
  // extend the bottom rows of the last column
  for (let x = keep; x < width; x++)
    for (let y = 0; y < NV; y++) cells[x * NV + y] = y >= NV - 2 ? area.cells[(keep - 1) * NV + y] : SP;
  return { width, cells, options: area.options };
}

// --- built-in levels ---------------------------------------------------------

// Game order of the original levels (as in MARIO.PAS)
export const ORIGINAL_LEVELS = [
  { n: 1, a: '1A', b: '1B' },
  { n: 2, a: '2A', b: '2B' },
  { n: 3, a: '3A', b: '3B' },
  { n: 4, a: '5A', b: '5B' },
  { n: 5, a: '6A', b: '6B' },
  { n: 6, a: '4A', b: '4B' },
];

export function builtinList() {
  return [
    ...ORIGINAL_LEVELS.map((l) => ({ key: `orig:${l.n}`, name: `Original — Level ${l.n}` })),
    { key: 'title', name: 'Original — Mapa del título' },
    ...SMB_LEVELS.map((id) => ({ key: `smb:${id}`, name: `Super Mario Bros. — ${id}` })),
  ];
}

export function loadBuiltin(key) {
  if (key === 'title') {
    return { name: 'Mapa del título', areas: [areaFromEngine(RAW.INTRO_0, RAW.OPTIONS_0), null] };
  }
  if (key.startsWith('orig:')) {
    const l = ORIGINAL_LEVELS.find((o) => `orig:${o.n}` === key);
    const main = areaFromEngine(RAW[`LEVEL_${l.a}`], RAW[`OPTIONS_${l.a}`]);
    const sub = areaFromEngine(RAW[`LEVEL_${l.b}`], RAW[`OPTIONS_${l.b}`] || RAW[`OPTIONS_${l.a}`]);
    return { name: `Level ${l.n}`, areas: [main, sub.width > 0 ? sub : null] };
  }
  if (key.startsWith('smb:')) {
    const id = key.slice(4);
    const { map, options } = smbLevel(id);
    return { name: `SMB ${id}`, areas: [areaFromEngine(map, options), null] };
  }
  return null;
}

export function newLevel(name = 'Nuevo nivel') {
  const area = newArea(60);
  area.options.InitX = 2 * W + 10;
  area.options.InitY = 9 * H;
  return { name, areas: [area, null] };
}

// --- JSON ----------------------------------------------------------------------

export const FORMAT = 'mario-luigi-level';

// Rows are strings of character codes 0..255 (one char per cell, top row
// first), readable for the common blocks: 'A' ground, '?' question block...
export function serialize(level) {
  return {
    format: FORMAT,
    version: 1,
    name: level.name,
    areas: level.areas.map((a) => {
      if (!a) return null;
      const rows = [];
      for (let y = 0; y < NV; y++) {
        let s = '';
        for (let x = 0; x < a.width; x++) s += String.fromCharCode(a.cells[x * NV + y]);
        rows.push(s);
      }
      return { width: a.width, rows, options: { ...a.options } };
    }),
  };
}

export function deserialize(obj) {
  if (!obj || obj.format !== FORMAT || !Array.isArray(obj.areas) || !obj.areas[0])
    throw new Error('No es un nivel de Mario & Luigi.');
  const areas = obj.areas.slice(0, MAX_ZONES).map((a) => {
    if (!a) return null;
    const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, a.width | 0));
    if (!Array.isArray(a.rows) || a.rows.length !== NV) throw new Error('Filas incorrectas en el nivel.');
    const cells = new Uint8Array(width * NV).fill(SP);
    for (let y = 0; y < NV; y++)
      for (let x = 0; x < width; x++) cells[x * NV + y] = (a.rows[y].charCodeAt(x) & 0xFF) || SP;
    return { width, cells, options: cleanOptions(a.options || {}) };
  });
  if (areas.length < 2) areas.push(null);
  return { name: String(obj.name || 'Nivel').slice(0, 40), areas };
}

// --- Pascal export (same format as WORLDS.PAS) ---------------------------------

function pasDb(bytes) {
  const parts = [];
  let str = '';
  for (const b of bytes) {
    if (b >= 0x20 && b < 0x7F && b !== 0x27) str += String.fromCharCode(b);
    else {
      if (str) parts.push(`'${str}'`);
      str = '';
      parts.push(`$${b.toString(16).toUpperCase().padStart(2, '0')}`);
    }
  }
  if (str) parts.push(`'${str}'`);
  return `    db    ${parts.join(', ')}`;
}

export function toPascal(level, ident = 'Custom') {
  const names = ['a', 'b'];
  let out = `  { ${level.name} - exported by the Mario & Luigi JS level editor }\n\n`;
  level.areas.forEach((a, i) => {
    if (!a) return;
    const { map } = areaToEngine(a);
    out += `  procedure Level_${ident}${names[i]}; assembler;\n  asm\n`;
    for (let x = 0; x < a.width; x++) out += `${pasDb(map.subarray(x * NV, x * NV + NV))}\n`;
    out += '    db    0\n  end;\n\n';
    const o = a.options;
    out += `  procedure Options_${ident}${names[i]}; assembler;\n  asm\n`;
    out += `    dw    ${o.InitX}, ${o.InitY}    { InitX, InitY }\n`;
    const labels = ['SkyType', 'Walls', null, null, 'Pipes', 'GroundColor1', 'GroundColor2', 'Horizon',
      'BackGrType', 'BackGrColor1,2', null, 'Stars', 'Clouds', 'Design', 'Color 2', null, null,
      'Color 3', null, null, 'BrickColor', 'WoodColor', 'XBlockColor'];
    const v = OPTION_FIELDS.map((n) => o[n]);
    const groups = [[0], [1, 2, 3], [4], [5], [6], [7], [8], [9, 10], [11], [12], [13], [14, 15, 16],
      [17, 18, 19], [20], [21], [22]];
    for (const g of groups) out += `    db    ${g.map((k) => v[k]).join(', ').padEnd(18)} { ${labels[g[0]]} }\n`;
    out += '  end;\n\n';
  });
  return out;
}

// --- storage: my levels and the play test --------------------------------------

const MY_KEY = 'mario-luigi-levels';
const TEST_KEY = 'mario-luigi-playtest';

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// [{ id, name, updated, data }]
export function listMyLevels() {
  const list = readJSON(MY_KEY, []);
  return Array.isArray(list) ? list.filter((l) => l && l.id && l.data) : [];
}

export function getMyLevel(id) {
  const item = listMyLevels().find((l) => l.id === id);
  return item ? deserialize(item.data) : null;
}

export function saveMyLevel(level, id = null) {
  const list = listMyLevels();
  const item = {
    id: id || `lvl${Date.now().toString(36)}`,
    name: level.name,
    updated: Date.now(),
    data: serialize(level),
  };
  const i = list.findIndex((l) => l.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
  if (!writeJSON(MY_KEY, list)) throw new Error('No se pudo guardar (almacenamiento lleno o no disponible).');
  return item.id;
}

export function deleteMyLevel(id) {
  writeJSON(MY_KEY, listMyLevels().filter((l) => l.id !== id));
}

export function setPlaytest(level) {
  return writeJSON(TEST_KEY, serialize(level));
}

export function getPlaytest() {
  const d = readJSON(TEST_KEY, null);
  return d ? deserialize(d) : null;
}

// All zones in engine format (for setZones in play.js)
export function zonesFor(level) {
  const main = level.areas[0];
  return level.areas.map((a) => areaToEngine(a || main));
}

// Engine arguments for PlayWorld: [Map1, Opt1, Opt1b, Map2, Opt2, Opt2b]
export function playArgs(level) {
  const main = areaToEngine(level.areas[0]);
  const sub = level.areas[1] ? areaToEngine(level.areas[1]) : main;
  return [main.map, main.options, main.options, sub.map, sub.options, sub.options];
}
