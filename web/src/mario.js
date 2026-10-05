// Port of MARIO.PAS: main program, title menu, demo and level sequence.

import * as VGA from './vga256.js';
import {
  B, W, H, NH, NV, plMario, plLuigi, mdSmall, dirLeft, dirRight, newGameData, BeeperOn, BeeperOff,
} from './buffers.js';
import { PS, PlayWorld, setZones } from './play.js';
import {
  InitPlayerFigures, DrawPlayer, DrawFigure, playerX, playerY, ResetVersus,
} from './players.js';
import { E, InitEnemyFigures } from './enemies.js';
import { InitBackGr, DrawBackGrMap } from './backgr.js';
import * as KB from './keyboard.js';
import { K } from './keyboard.js';
import {
  Palette, P256, NewPalette, ClearPalette, LockPal, UnLockPal, FadeUp, FadeDown,
  OutPalette, BlinkPalette, ReadPalette,
} from './palettes.js';
import { SetFont, TextWidth, WriteText, CenterX, Bold, Shadow } from './txt.js';
import { RAW } from './data.js';
import { randomize, byte } from './pascal.js';
import { extras } from './extras.js';
import { SMB_LEVELS, smbLevel } from './smb.js';
import { listMyLevels, getMyLevel, playArgs, zonesFor } from './levels.js';

const NUM_LEV = 6;
const LAST_LEV = 2 * NUM_LEV - 1;
const MAX_SAVE = 3;
const WAIT_BEFORE_DEMO = 500;

const CONFIG_KEY = 'mario-luigi-config';

let GameNumber = -1;
let CurPlayer = 0;
let Passed = false;
let EndGame = false;

const cloneData = (d) => JSON.parse(JSON.stringify(d));

const Config = {
  Sound: true,
  SLine: true,
  Games: [],
  UseJS: true,
};

function NewData() {
  const d = B.Data;
  d.Lives[plMario] = 3;
  d.Lives[plLuigi] = 3;
  d.Coins[plMario] = 0;
  d.Coins[plLuigi] = 0;
  d.Score[plMario] = 0;
  d.Score[plLuigi] = 0;
  d.Progress[plMario] = 0;
  d.Progress[plLuigi] = 0;
  d.Mode[plMario] = mdSmall;
  d.Mode[plLuigi] = mdSmall;
}

function ReadConfig() {
  let ok = false;
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
    if (saved && Array.isArray(saved.Games) && saved.Games.length === MAX_SAVE) {
      Object.assign(Config, saved);
      ok = true;
    }
  } catch {
    ok = false;
  }
  if (!ok) {
    NewData();
    Config.Games = [];
    for (let i = 0; i < MAX_SAVE; i++) Config.Games.push(cloneData(B.Data));
    Config.SLine = true;
    Config.Sound = true;
    Config.UseJS = true;
    GameNumber = -1;
  }
  PS.Stat = Config.SLine;
  B.BeeperSound = Config.Sound;
}

// Options changed in the game (S: status line, Q: sound) are saved at once
PS.onSettingsChanged = () => WriteConfig();

function WriteConfig() {
  Config.SLine = PS.Stat;
  Config.Sound = B.BeeperSound;
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(Config));
  } catch {
    // storage unavailable (private mode): settings are not kept
  }
}

async function Demo() {
  NewData();
  B.Versus = false;
  E.Turbo = false;
  B.Data.Progress[plMario] = 5;
  KB.PlayMacro();
  extras.suppress = true; // no vibration while the demo plays
  await PlayWorld(' ', ' ', RAW.LEVEL_6A, RAW.OPTIONS_6A, RAW.OPTIONS_6A,
    RAW.LEVEL_6B, RAW.OPTIONS_6B, RAW.OPTIONS_6B, plMario);
  KB.StopMacro();
  extras.suppress = false;
}

const ST_NONE = 0;
const ST_MENU = 1; // game mode: 1 player, 2 players, 2 players versus
const ST_START = 2; // game save: no save, game select, erase
const ST_LOAD = 3; // the saved game slots
const ST_ERASE = 4;
const ST_OPTIONS = 5;
const ST_PACKAGE = 6; // what to play: original, SMB 1, level select
const ST_LEVELS = 7;

// LEVEL SELECT: every world stored in WORLDS.PAS, including the ones the
// normal game never starts directly (sub-areas, the "turbo" second round
// with its own options, and the map behind the title screen).
// Level 2 and 3 have empty sub-areas in the original source (no data).
const BASE_LEVELS = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ label: `LEVEL ${n}`, kind: 'level', n: n - 1, turbo: false })),
  ...[1, 4, 5, 6].map((n) => ({ label: `LEVEL ${n} AREA 2`, kind: 'area', n: n - 1 })),
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ label: `LEVEL ${n} TURBO`, kind: 'level', n: n - 1, turbo: true })),
  { label: 'TITLE MAP', kind: 'title', n: 0 },
  ...SMB_LEVELS.map((id, i) => ({ label: `SMB ${id}`, kind: 'smb', n: i })),
];

// Levels made with the editor ("Mis niveles") are added at the end
const plain = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  .replace(/[^ -~]/g, '').slice(0, 16);
function levelList() {
  return [
    ...BASE_LEVELS,
    ...listMyLevels().map((l) => ({ label: `+ ${plain(l.name)}`, kind: 'my', id: l.id, n: 0 })),
  ];
}
let LEVEL_LIST = BASE_LEVELS;

let SelectedWorld = null;

// 'original': the six levels of the game; 'smb': Super Mario Bros. levels
let GameMode = 'original';

// Package of a saved game (older saves only had the original levels)
// Title menu: while 2 PLAYERS VERSUS is chosen, player 2 (Luigi by
// default) walks in from behind the left wall and stands next to Mario;
// otherwise he walks back out.
const TITLE_WALK = 2; // pixels per frame
const TitleP2 = {
  x: 0, // 0: hidden behind the wall
  y: 0,
  target: 0,
  frame: 0,
  count: 0,
  dir: dirRight,
  back: [0, 0], // saved background, one per video page
};

function resetTitleP2() {
  TitleP2.x = 0;
  TitleP2.y = playerY(); // Mario of the title screen
  TitleP2.target = playerX() - W - 4;
  TitleP2.back = [0, 0];
}

function hideTitleP2() {
  const page = VGA.CurrentPage();
  VGA.PopBackGr(TitleP2.back[page]);
  TitleP2.back[page] = 0;
}

function showTitleP2(show) {
  const p = TitleP2;
  const target = show ? p.target : 0;
  if (p.x !== target) {
    const step = Math.sign(target - p.x) * Math.min(TITLE_WALK, Math.abs(target - p.x));
    p.x += step;
    p.dir = step > 0 ? dirRight : dirLeft;
    p.count = (p.count + 1) & 0xF;
    p.frame = byte(p.count < 8);
  } else {
    p.frame = 0;
    p.count = 0;
    p.dir = dirRight;
  }
  if (p.x <= 0) return;
  p.back[VGA.CurrentPage()] = VGA.PushBackGr(p.x, p.y, W + 4, 2 * H);
  DrawFigure(p.x, p.y, B.Character[plLuigi], p.frame, p.dir);
  // he comes out from behind the wall of the left edge
  if (p.x < W)
    for (let j = Math.trunc(p.y / H); j * H < p.y + 2 * H; j++) VGA.DrawImage(0, j * H, W, H, RAW.BLOCK000);
}

const slotPackage = (g) => (g.Package === 'smb' ? 'smb' : 'original');
const slotEmpty = (g) => g.Progress[plMario] === 0 && g.Progress[plLuigi] === 0;

// "GAME #1 · LEVEL 3 · 1P"; turbo (second round) shows a blinking '*'
function slotLabel(i) {
  const g = Config.Games[i - 1];
  let text = `GAME #${i} \x07 `;
  if (slotEmpty(g)) return { text: `${text}EMPTY`, turbo: false };
  const smb = slotPackage(g) === 'smb';
  const count = smb ? SMB_LEVELS.length : NUM_LEV;
  let j = Math.max(g.Progress[plMario], g.Progress[plLuigi]);
  const turbo = j >= count;
  if (turbo) j -= count;
  text += smb ? `SMB ${SMB_LEVELS[j] ?? '?'} ` : `LEVEL ${j + 1} `;
  text += turbo ? '* ' : '\x07 ';
  text += g.Versus ? 'VS' : `${g.NumPlayers}P`;
  return { text, turbo };
}

async function Intro() {
  const Page = VGA.CurrentPage();
  let Status = ST_NONE;
  let OldStatus = ST_NONE;
  let Selected = 1;
  let NumOptions = 0;
  let MacroKey = 0;
  let IntroDone = false;
  let wd = 0;
  let xp = 0;
  let ht = 8;
  GameNumber = -1;
  let NextNumPlayers = B.Data.NumPlayers;
  let NextVersus = false;
  let LevelSel = 0;
  let LevelTop = 0;
  SelectedWorld = null;
  B.Versus = false;
  const Menu = ['', '', '', '', '', ''];
  const Blink = [false, false, false, false, false, false];
  const BG = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];

  // Esc / going up past the first option: back to the previous menu
  const back = () => {
    switch (Status) {
      case ST_START: case ST_OPTIONS: return ST_MENU;
      case ST_LOAD: case ST_ERASE: return ST_START;
      case ST_PACKAGE: return GameNumber === -1 ? ST_START : ST_LOAD;
      case ST_LEVELS: return ST_PACKAGE;
      default: return ST_MENU;
    }
  };

  const Up = () => {
    if (Selected === 1) {
      if (Status === ST_MENU) Selected = NumOptions;
      else MacroKey = KB.kbEsc;
    } else Selected--;
  };
  const Down = () => {
    if (Selected === NumOptions) {
      if (Status === ST_MENU) Selected = 1;
      else MacroKey = KB.kbEsc;
    } else Selected++;
  };

  const setMenu = (...items) => {
    Menu.fill('');
    Blink.fill(false);
    items.forEach((t, i) => { Menu[i + 1] = t; });
    NumOptions = items.length;
  };

  do {
    IntroDone = false;
    NewData();

    await PlayWorld('\0', '\0', RAW.INTRO_0, RAW.OPTIONS_0, RAW.OPTIONS_0,
      RAW.INTRO_0, RAW.OPTIONS_0, RAW.OPTIONS_0, plMario);
    InitBackGr(3, 0);

    OutPalette(0xA0, 35, 45, 50);
    OutPalette(0xA1, 45, 55, 60);

    OutPalette(0xEF, 30, 40, 30);
    OutPalette(0x18, 10, 15, 25);

    OutPalette(0x8D, 28, 38, 50);
    OutPalette(0x8F, 40, 50, 63);

    for (let i = 1; i <= 50; i++) BlinkPalette();

    for (let P = 0; P <= VGA.MAX_PAGE; P++) {
      for (let i = 1; i >= 0; i--)
        for (let j = 1; j >= 0; j--)
          for (let k = 1; k >= 0; k--) {
            VGA.DrawImage(38 + i + j, 29 + i + k, 108, 28, RAW.INTRO000);
            VGA.DrawImage(159 + i + j, 29 + i + k, 24, 28, RAW.INTRO001);
            VGA.DrawImage(198 + i + j, 29 + i + k, 84, 28, RAW.INTRO002);
          }

      DrawBackGrMap(10 * H + 6, 11 * H - 1, 54, 0xA0);
      DrawBackGrMap(10 * H + 6, 11 * H - 1, 55, 0xA1);
      DrawBackGrMap(10 * H + 6, 11 * H - 1, 53, 0xA1);
      for (let i = 0; i <= NH - 1; i++)
        for (let j = 0; j <= NV - 1; j++)
          if (i === 0 || i === NH - 1 || j === 0 || j === NV - 1)
            VGA.DrawImage(i * W, j * H, W, H, RAW.BLOCK000);
      DrawPlayer();
      await VGA.ShowPage();
    }
    UnLockPal();
    K.Key = 0;
    await FadeUp(64);
    VGA.ResetStack();

    for (const b of BG) b.fill(0);
    Menu.fill('');
    SetFont(0, Bold + Shadow);

    if (Status !== ST_OPTIONS) {
      OldStatus = ST_NONE;
      Status = ST_MENU;
      Selected = 1;
    }
    let Update = true;

    let Counter = 1;
    resetTitleP2();
    K.menuMode = true;
    do {
      if (Update || Status !== OldStatus) {
        if (Status !== OldStatus) Selected = 1;
        switch (Status) {
          case ST_MENU:
            setMenu('1 PLAYER', '2 PLAYERS', '2 PLAYERS VERSUS', 'OPTIONS', 'END');
            break;
          case ST_START:
            setMenu('NO SAVE', 'GAME SELECT', 'ERASE');
            break;
          case ST_LOAD:
          case ST_ERASE:
            setMenu(...[1, 2, 3].map((i) => slotLabel(i).text));
            for (let i = 1; i <= 3; i++) Blink[i] = slotLabel(i).turbo;
            break;
          case ST_PACKAGE:
            setMenu('ORIGINAL', 'SMB 1', 'LEVEL SELECT');
            break;
          case ST_LEVELS:
            if (Status !== OldStatus) {
              LevelSel = 0;
              LevelTop = 0;
              LEVEL_LIST = levelList();
            }
            if (LevelSel < LevelTop) LevelTop = LevelSel;
            if (LevelSel > LevelTop + 4) LevelTop = LevelSel - 4;
            setMenu(...[0, 1, 2, 3, 4].map((i) => LEVEL_LIST[LevelTop + i]?.label ?? ''));
            NumOptions = 5;
            Selected = LevelSel - LevelTop + 1;
            break;
          case ST_OPTIONS:
            setMenu(B.BeeperSound ? 'SOUND ON ' : 'SOUND OFF', PS.Stat ? 'STATUSLINE ON ' : 'STATUSLINE OFF');
            break;
        }
        wd = 0;
        xp = 0;
        const widest = Status === ST_LEVELS ? LEVEL_LIST.map((l) => l.label) : Menu.slice(1);
        for (const text of widest) {
          const j = TextWidth(text);
          if (j > wd) {
            wd = j;
            xp = Math.trunc(CenterX(text) / 4) * 4;
          }
          ht = 8;
        }
        OldStatus = Status;
        Update = false;
      }

      MacroKey = 0;
      switch (K.Key) {
        case KB.kbEsc:
          if (Status !== ST_MENU) Status = back();
          break;
        case KB.kbUpArrow:
          if (Status === ST_LEVELS) LevelSel = (LevelSel + LEVEL_LIST.length - 1) % LEVEL_LIST.length;
          else Up();
          break;
        case KB.kbDownArrow:
          if (Status === ST_LEVELS) LevelSel = (LevelSel + 1) % LEVEL_LIST.length;
          else Down();
          break;
        case KB.kbSP:
        case KB.kbEnter:
          switch (Status) {
            case ST_MENU:
              switch (Selected) {
                case 1:
                case 2:
                case 3:
                  // game mode; then the game save and what to play
                  NextNumPlayers = Selected === 2 ? 2 : 1;
                  NextVersus = Selected === 3;
                  Status = ST_START;
                  break;
                case 4: Status = ST_OPTIONS; break;
                case 5:
                  // A browser game cannot close: END opens the settings panel
                  PS.onEnd?.();
                  break;
              }
              break;
            case ST_START:
              switch (Selected) {
                case 1:
                  GameNumber = -1;
                  Status = ST_PACKAGE;
                  break;
                case 2: Status = ST_LOAD; break;
                case 3: Status = ST_ERASE; break;
              }
              break;
            case ST_LOAD: {
              GameNumber = Selected - 1;
              const g = Config.Games[GameNumber];
              if (slotEmpty(g)) Status = ST_PACKAGE; // new game in this slot
              else {
                // continue the saved game with the chosen game mode
                GameMode = slotPackage(g);
                IntroDone = true;
              }
              break;
            }
            case ST_ERASE:
              NewData();
              Config.Games[Selected - 1] = cloneData(B.Data);
              Config.Games[Selected - 1].NumPlayers = 1;
              GameNumber = -1;
              WriteConfig();
              break;
            case ST_PACKAGE:
              switch (Selected) {
                case 1:
                  GameMode = 'original';
                  IntroDone = true;
                  break;
                case 2:
                  GameMode = 'smb';
                  IntroDone = true;
                  break;
                case 3: Status = ST_LEVELS; break;
              }
              break;
            case ST_LEVELS:
              SelectedWorld = LEVEL_LIST[LevelSel];
              GameMode = SelectedWorld.kind === 'smb' ? 'smb' : 'original';
              IntroDone = true;
              break;
            case ST_OPTIONS:
              switch (Selected) {
                case 1:
                  if (B.BeeperSound) BeeperOff();
                  else BeeperOn();
                  break;
                case 2:
                  PS.Stat = !PS.Stat;
                  break;
              }
              WriteConfig();
              break;
          }
          break;
      }
      if (K.Key !== 0) {
        Counter = 0;
        K.Key = MacroKey;
        Update = true;
      }

      for (let k = 1; k <= 5; k++) if (BG[Page][k] !== 0) VGA.PopBackGr(BG[Page][k]);
      hideTitleP2();
      // also stays while choosing the game save and levels of VERSUS
      showTitleP2(Status === ST_MENU ? Selected === 3
        : NextVersus && Status !== ST_OPTIONS && Status !== ST_ERASE);

      for (let k = 1; k <= 5; k++) {
        if (Menu[k] !== '') {
          const i = xp;
          const j = 56 + 14 * k;
          BG[Page][k] = VGA.PushBackGr(50, j, 220, ht);
          if (k === Selected) WriteText(i - 12, j, '\x10', 5);
          const l = Blink[k] ? 14 + (Counter & 1) : 15;
          VGA.SetPalette(14, 63, 61, 31);
          WriteText(i + 8, j, Menu[k], l);
        }
      }
      if (Status === ST_LEVELS) { // scroll marks
        if (LevelTop > 0) WriteText(258, 56 + 14, '', 15);
        if (LevelTop + 5 < LEVEL_LIST.length) WriteText(258, 56 + 14 * 5, '', 15);
      }

      await VGA.ShowPage();
      BlinkPalette();
      VGA.ResetStack();

      Counter++;
    } while (!(IntroDone || Counter === WAIT_BEFORE_DEMO));
    K.menuMode = false;
    await FadeDown(64);

    if (!IntroDone) await Demo();
  } while (!IntroDone);

  if (GameNumber !== -1) Object.assign(B.Data, cloneData(Config.Games[GameNumber]));
  B.Data.NumPlayers = NextVersus ? 1 : NextNumPlayers;
  B.Versus = NextVersus;
}

async function ShowPlayerName(Player) {
  ClearPalette();
  LockPal();
  VGA.ClearVGAMem();
  VGA.SetView(0, 0);
  const iH = 13;
  for (let i = 0; i <= VGA.MAX_PAGE; i++) {
    if (B.Character[Player] === plMario) {
      const iW = 116;
      VGA.DrawImage(160 - (iW >> 1), 85 - (iH >> 1), iW, iH, RAW.START000);
    } else {
      const iW = 108;
      VGA.DrawImage(160 - (iW >> 1), 85 - (iH >> 1), iW, iH, RAW.START001);
    }
    await VGA.ShowPage();
  }
  NewPalette(P256);
  UnLockPal();
  ReadPalette(Palette);
  for (let i = 1; i <= 100; i++) await VGA.ShowPage();
  ClearPalette();
  VGA.ClearVGAMem();
}

const LEVELS = [
  ['1', '1A', '1B'],
  ['2', '2A', '2B'],
  ['3', '3A', '3B'],
  ['4', '5A', '5B'],
  ['5', '6A', '6B'],
  ['6', '4A', '4B'],
];

// A Super Mario Bros. level (no second area: both maps are the same)
async function playSmb(n, player) {
  const id = SMB_LEVELS[n];
  const { map, options } = smbLevel(id);
  return PlayWorld(id[0], id[2], map, options, options, map, options, options, player);
}

async function playLevel(n, player) {
  const [num, a, b] = LEVELS[n];
  return PlayWorld('x', num, RAW[`LEVEL_${a}`], RAW[`OPTIONS_${a}`], RAW[`OPT_${a}`],
    RAW[`LEVEL_${b}`], RAW[`OPTIONS_${b}`], RAW[`OPTIONS_${b}`], player);
}

// Sub-area first (its exit pipe leads to the main area), the title map or
// a level made with the editor.
async function playSpecial(w, player) {
  if (w.kind === 'my') {
    const level = getMyLevel(w.id);
    if (!level) return false;
    setZones(zonesFor(level));
    return PlayWorld('x', 'E', ...playArgs(level), player);
  }
  if (w.kind === 'title') {
    return PlayWorld('x', '0', RAW.INTRO_0, RAW.OPTIONS_0, RAW.OPTIONS_0,
      RAW.INTRO_0, RAW.OPTIONS_0, RAW.OPTIONS_0, player);
  }
  const [num, a, b] = LEVELS[w.n];
  return PlayWorld('x', num, RAW[`LEVEL_${b}`], RAW[`OPTIONS_${b}`], RAW[`OPTIONS_${b}`],
    RAW[`LEVEL_${a}`], RAW[`OPTIONS_${a}`], RAW[`OPT_${a}`], player);
}

// Play test from the level editor: the level is replayed until it is
// passed, the lives run out or Esc is pressed.
async function runTest(level) {
  VGA.ClearVGAMem();
  InitPlayerFigures();
  InitEnemyFigures();
  NewData();
  const d = B.Data;
  d.NumPlayers = 1;
  d.Lives[plMario] = 5;
  d.Lives[plLuigi] = 0;
  E.Turbo = false;
  GameMode = 'original';
  randomize();
  const args = playArgs(level);
  for (;;) {
    await ShowPlayerName(plMario);
    setZones(zonesFor(level));
    const passed = await PlayWorld('x', 'E', ...args, plMario);
    if (passed || B.QuitGame || d.Lives[plMario] <= 0) break;
  }
  B.QuitGame = false;
}

export async function Main(testLevel = null) {
  KB.InitKeyBoard();
  B.Data.NumPlayers = 1;
  ReadConfig();

  KB.ResetKeyBoard();

  if (!VGA.InGraphicsMode) VGA.InitVGA();

  if (testLevel) {
    await runTest(testLevel);
    return;
  }

  do {
    VGA.ClearVGAMem();

    InitPlayerFigures();
    InitEnemyFigures();

    EndGame = false;
    await Intro();

    randomize();
    ResetVersus();

    const d = B.Data;
    // A special world of LEVEL SELECT (an area, the title map, an editor
    // level): every player plays it in turn
    let special = null;
    // the title map and editor levels are not part of a saved game
    let keepSave = GameNumber !== -1;
    if (SelectedWorld) {
      // LEVEL SELECT: start at the chosen level and continue with the
      // normal level order from there.
      d.Progress[plMario] = SelectedWorld.n + (SelectedWorld.turbo ? NUM_LEV : 0);
      d.Progress[plLuigi] = d.Progress[plMario];
      if (SelectedWorld.kind !== 'level' && SelectedWorld.kind !== 'smb') special = SelectedWorld;
      if (SelectedWorld.kind === 'title' || SelectedWorld.kind === 'my') keepSave = false;
      SelectedWorld = null;
    }
    const saveGame = () => {
      if (!keepSave) return;
      Config.Games[GameNumber] = { ...cloneData(d), Package: GameMode, Versus: B.Versus };
      WriteConfig();
    };
    if (d.NumPlayers === 2 || B.Versus) {
      if (d.Progress[plMario] > d.Progress[plLuigi]) d.Progress[plLuigi] = d.Progress[plMario];
      else d.Progress[plMario] = d.Progress[plLuigi];
    }
    d.Lives[plMario] = 3;
    d.Lives[plLuigi] = 3;
    d.Coins[plMario] = 0;
    d.Coins[plLuigi] = 0;
    d.Score[plMario] = 0;
    d.Score[plLuigi] = 0;
    d.Mode[plMario] = mdSmall;
    d.Mode[plLuigi] = mdSmall;

    do {
      if (d.NumPlayers === 1) d.Lives[plLuigi] = 0;
      for (CurPlayer = plMario; CurPlayer <= d.NumPlayers - 1; CurPlayer++) {
        if (!(EndGame || B.QuitGame) && d.Lives[CurPlayer] >= 1) {
          // SMB mode: after 8-1 the levels start again, faster (like the
          // second round of the original game)
          const smb = GameMode === 'smb';
          const count = smb ? SMB_LEVELS.length : NUM_LEV;
          E.Turbo = d.Progress[CurPlayer] >= count;
          if (d.Progress[CurPlayer] > 2 * count - 1) d.Progress[CurPlayer] = count;
          await ShowPlayerName(CurPlayer);
          const lev = d.Progress[CurPlayer] % count;
          if (special) {
            E.Turbo = false;
            Passed = await playSpecial(special, CurPlayer);
          } else if (smb) Passed = await playSmb(lev, CurPlayer);
          else if (lev >= 0 && lev < LEVELS.length) Passed = await playLevel(lev, CurPlayer);
          else EndGame = true;

          // a warp pipe ($D1..$D7) advances several levels at once
          if (Passed) d.Progress[CurPlayer] += Math.max(1, B.Warp || 1);
          B.Warp = 0;
          saveGame(); // keep the saved game up to date
          if (B.QuitGame) {
            EndGame = true;
            B.QuitGame = false;
          }
        }
      }
      if (special && (special.kind === 'title' || special.kind === 'my')) EndGame = true;
      special = null;
    } while (!(EndGame || B.QuitGame || d.Lives[plMario] + d.Lives[plLuigi] === 0));

    saveGame();
    WriteConfig();
    B.QuitGame = false;
  } while (true);
}

export { newGameData };
