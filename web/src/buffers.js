// Port of BUFFERS.PAS: shared constants, world map and game data.

import { Sound, NoSound } from './sound.js';

export const W = 20;
export const H = 14;
export const NH = 16;
export const NV = 13;

export const MaxWorldSize = 236;
// Room for longer maps than the original (Super Mario Bros. 8-1 has 373
// columns). Original levels are shorter than MaxWorldSize, so for them
// nothing changes. 600 columns still keep the screen below the background
// save stack in video memory.
export const WorldCols = 600;

export const EX = 1;
export const EY1 = 8;
export const EY2 = 3;

export const dirLeft = 0;
export const dirRight = 1;

export const mdSmall = 0;
export const mdLarge = 1;
export const mdFire = 2;

export const plMario = 0;
export const plLuigi = 1;

export const PlayerName = ['MARIO', 'LUIGI'];

export const dmNoDemo = 0;
export const dmDownInToPipe = 1;
export const dmUpOutOfPipe = 2;
export const dmUpInToPipe = 3;
export const dmDownOutOfPipe = 4;
export const dmDead = 5;

// Character sets used for collision detection
// #0..#13, '0'..'Z' (original) plus the extra terrains of the editor:
// sources $B2..$B5 and their tiles $91..$9D (terrain 2) and $A0..$AC (3)
export const canHoldYou = (c) => c <= 13 || (c >= 0x30 && c <= 0x5A)
  || (c >= 0x91 && c <= 0x9D) || (c >= 0xA0 && c <= 0xAC) || (c >= 0xB2 && c <= 0xB5);

// Extra terrains (not in the original game): two source codes each, like
// A/B, drawn with the wall set loaded from WallType2 / WallType3.
// Pipe codes (cell above the left half of a pipe mouth):
//  $E0..$E7 original ($E0 same area, $E1 other area, $E7 exit level)
//  $C0..$C7 go to zone 1..8 (editor levels)
//  $D1..$D7 warp: leave the level and skip N-1 levels (like SMB warp zones)
export const isPipeEntry = (c) => (c >= 0xE0 && c <= 0xE7) || (c >= 0xC0 && c <= 0xC7) || (c >= 0xD1 && c <= 0xD7);
// any pipe code a pipe can be found by (entries, $E8..$EF pairs/arrivals)
export const isPipeCode = (c) => (c >= 0xE0 && c <= 0xEF) || (c >= 0xC0 && c <= 0xC7) || (c >= 0xD1 && c <= 0xD7);

export const EXTRA_TERRAINS = [
  { codes: [0xB2, 0xB3], base: 0x90, set: 2 },
  { codes: [0xB4, 0xB5], base: 0x9F, set: 3 },
];
export const canStandOn = (c) => (c >= 14 && c <= 16) || (c >= 0x61 && c <= 0x66); // #14..#16, 'a'..'f'
export const isHidden = (c) => c === 0x24; // '$'

// --- World map: array [-EX .. MaxWorldSize - 1 + EX, -EY1 .. NV - 1 + EY2] of Char

const WX = WorldCols + 2 * EX;
const WY = NV + EY1 + EY2;
export const WORLD_SIZE = WX * WY;

// Both maps live in one "heap" like the original GetMem allocations, so that
// out-of-range accesses (no range checking in the original) stay harmless.
const heap = new Uint8Array(2 * WORLD_SIZE);

export class WorldBuffer {
  constructor(offset) {
    this.offset = offset;
    this.mem = heap.subarray(offset, offset + WORLD_SIZE);
  }
  index(x, y) {
    return this.offset + (x + EX) * WY + (y + EY1);
  }
  get(x, y) {
    const i = this.index(x, y);
    return i >= 0 && i < heap.length ? heap[i] : 0;
  }
  set(x, y, v) {
    const i = this.index(x, y);
    if (i >= 0 && i < heap.length) heap[i] = v;
  }
}

export const WorldMap = new WorldBuffer(0);
export const SaveWorldMap = new WorldBuffer(WORLD_SIZE);

export function newOptions() {
  return {
    InitX: 0, InitY: 0,
    SkyType: 0, WallType1: 0, WallType2: 0, WallType3: 0,
    PipeColor: 0, GroundColor1: 0, GroundColor2: 0, Horizon: 0,
    BackGrType: 0, BackGrColor1: 0, BackGrColor2: 0,
    Stars: 0, Clouds: 0, Design: 0,
    C2r: 0, C2g: 0, C2b: 0, C3r: 0, C3g: 0, C3b: 0,
    BrickColor: 0, WoodColor: 0, XBlockColor: 0,
    BuildWall: false, XSize: 0,
    WrapHills: false, // repeat the hill profile on maps longer than the original ones
  };
}

export function optionsFromBytes(b) {
  const g = (i) => b[i] ?? 0;
  const o = newOptions();
  o.InitX = g(0) | (g(1) << 8);
  o.InitY = g(2) | (g(3) << 8);
  const names = ['SkyType', 'WallType1', 'WallType2', 'WallType3', 'PipeColor',
    'GroundColor1', 'GroundColor2', 'Horizon', 'BackGrType', 'BackGrColor1',
    'BackGrColor2', 'Stars', 'Clouds', 'Design', 'C2r', 'C2g', 'C2b',
    'C3r', 'C3g', 'C3b', 'BrickColor', 'WoodColor', 'XBlockColor'];
  names.forEach((n, i) => { o[n] = g(4 + i); });
  return o;
}

export function newGameData() {
  return {
    NumPlayers: 1,
    Progress: [0, 0],
    Lives: [0, 0],
    Coins: [0, 0],
    Score: [0, 0],
    Mode: [0, 0],
  };
}

// Global game state (the variables of unit Buffers)
export const B = {
  QuitGame: false,
  BeeperSound: true,
  Player: 0,
  // VERSUS: both players on screen at once, sharing lives, coins and score
  Versus: false,
  // Character shown for each player slot (0 = Mario, 1 = Luigi)
  Character: [0, 1],
  Data: newGameData(),
  WorldNumber: '',
  LevelScore: 0,
  GameDone: false,
  Passed: false,
  Options: newOptions(),
  SaveOptions: newOptions(),
  XView: 0,
  YView: 0,
  LastXView: [0, 0],
  Demo: 0,
  Warp: 0, // levels to advance after a warp pipe ($D1..$D7)
  TextCounter: 0,
  LavaCounter: 0,
};

// Index of B.Data for lives, coins and score: shared by both players in VERSUS
export const dataSlot = () => (B.Versus ? 0 : B.Player);

// ReadWorld: Map is stored column by column (NV chars each, bottom row last),
// terminated by a #0.
export function ReadWorld(Map, Wb, Opt) {
  B.Options = optionsFromBytes(Opt);
  Wb.mem.fill(0x20);
  for (let i = -EX; i <= -1; i++)
    for (let j = -EY1; j <= NV - 1 + EY2; j++)
      Wb.set(i, j, 0x40); // '@'
  let X = 0;
  while ((Map[X * NV] ?? 0) !== 0 && X < WorldCols) {
    for (let i = 1; i <= NV; i++)
      Wb.set(X, NV - i, Map[X * NV + i - 1]);
    Wb.set(X, -EY1, 0);
    for (let i = 1; i <= EY2; i++)
      Wb.set(X, NV - 1 + i, Wb.get(X, NV - 1));
    X++;
  }
  B.Options.XSize = X;
  B.Options.WrapHills = X > MaxWorldSize;
  for (let i = X; i <= X + EX - 1; i++)
    for (let j = -EY1; j <= NV - 1 + EY2; j++)
      Wb.set(i, j, 0x40);
}

export function Swap() {
  const t = B.Options;
  B.Options = B.SaveOptions;
  B.SaveOptions = t;
  const tmp = WorldMap.mem.slice();
  WorldMap.mem.set(SaveWorldMap.mem);
  SaveWorldMap.mem.set(tmp);
}

export function BeeperOn() {
  B.BeeperSound = true;
  NoSound();
}

export function BeeperOff() {
  B.BeeperSound = false;
  NoSound();
}

export function Beep(Freq) {
  if (B.BeeperSound) {
    if (Freq === 0) NoSound();
    else Sound(Freq);
  }
}

export function InitLevelScore() {
  B.LevelScore = 0;
}

export function AddScore(N) {
  B.LevelScore += N;
}
