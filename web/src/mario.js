// Port of MARIO.PAS: main program, title menu, demo and level sequence.

import * as VGA from './vga256.js';
import {
  B, W, H, NH, NV, plMario, plLuigi, mdSmall, newGameData, BeeperOn, BeeperOff,
} from './buffers.js';
import { PS, PlayWorld, setZones } from './play.js';
import { InitPlayerFigures, DrawPlayer } from './players.js';
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
import { randomize } from './pascal.js';
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
const ST_MENU = 1;
const ST_START = 2;
const ST_LOAD = 3;
const ST_ERASE = 4;
const ST_OPTIONS = 5;
const ST_NUMPLAYERS = 6;
const ST_SMBPLAYERS = 8; // number of players for START SMB 1
const ST_LEVELS = 7;
const ST_VERSUS = 9; // VERSUS: choose the original or the SMB levels

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

async function Intro() {
  const Page = VGA.CurrentPage();
  let Status = ST_NONE;
  let OldStatus = ST_NONE;
  let LastStatus = ST_NONE;
  let Selected = 1;
  let NumOptions = 0;
  let MacroKey = 0;
  let IntroDone = false;
  let wd = 0;
  let xp = 0;
  let ht = 8;
  GameNumber = -1;
  let NextNumPlayers = B.Data.NumPlayers;
  let LevelSel = 0;
  let LevelTop = 0;
  SelectedWorld = null;
  const Menu = ['', '', '', '', '', '', ''];
  const BG = [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]];
  B.Versus = false;
  let NextVersus = false;

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
      LastStatus = ST_NONE;
      Status = ST_MENU;
      Selected = 1;
    }
    let Update = true;

    let Counter = 1;
    K.menuMode = true;
    do {
      if (Update || Status !== OldStatus) {
        if (Status !== OldStatus) Selected = 1;
        switch (Status) {
          case ST_MENU:
            Menu[1] = 'START ORIGINAL';
            Menu[2] = 'START SMB 1';
            Menu[3] = 'START VERSUS';
            Menu[4] = 'LEVEL SELECT';
            Menu[5] = 'OPTIONS';
            Menu[6] = 'END';
            NumOptions = 6;
            LastStatus = ST_MENU;
            break;
          case ST_SMBPLAYERS:
            Menu[1] = 'ONE PLAYER';
            Menu[2] = 'TWO PLAYERS';
            Menu[3] = '';
            Menu[4] = '';
            Menu[5] = '';
            Menu[6] = '';
            if (Status !== OldStatus) Selected = B.Data.NumPlayers;
            NumOptions = 2;
            LastStatus = ST_MENU;
            break;
          case ST_LEVELS:
            if (Status !== OldStatus) {
              LevelSel = 0;
              LevelTop = 0;
              LEVEL_LIST = levelList();
            }
            if (LevelSel < LevelTop) LevelTop = LevelSel;
            if (LevelSel > LevelTop + 4) LevelTop = LevelSel - 4;
            for (let i = 1; i <= 5; i++) Menu[i] = LEVEL_LIST[LevelTop + i - 1]?.label ?? '';
            Menu[6] = '';
            Selected = LevelSel - LevelTop + 1;
            NumOptions = 5;
            LastStatus = ST_MENU;
            break;
          case ST_OPTIONS:
            Menu[1] = B.BeeperSound ? 'SOUND ON ' : 'SOUND OFF';
            Menu[2] = PS.Stat ? 'STATUSLINE ON ' : 'STATUSLINE OFF';
            Menu[3] = '';
            Menu[4] = '';
            Menu[5] = '';
            Menu[6] = '';
            NumOptions = 2;
            LastStatus = ST_MENU;
            break;
          case ST_START:
            Menu[1] = 'NO SAVE';
            Menu[2] = 'GAME SELECT';
            Menu[3] = 'ERASE';
            Menu[4] = '';
            Menu[5] = '';
            Menu[6] = '';
            NumOptions = 3;
            LastStatus = ST_MENU;
            break;
          case ST_NUMPLAYERS:
            Menu[1] = 'ONE PLAYER';
            Menu[2] = 'TWO PLAYERS';
            Menu[3] = '';
            Menu[4] = '';
            Menu[5] = '';
            Menu[6] = '';
            if (Status !== OldStatus) Selected = B.Data.NumPlayers;
            NumOptions = 2;
            LastStatus = ST_START;
            break;
          case ST_LOAD:
          case ST_ERASE:
            for (let i = 1; i <= 3; i++) {
              Menu[i] = `GAME #${i} \x07 `;
              const g = Config.Games[i - 1];
              if (g.Progress[plMario] === 0 && g.Progress[plLuigi] === 0) Menu[i] += 'EMPTY';
              else {
                let j = g.Progress[plMario];
                const k = g.Progress[CurPlayer] >= NUM_LEV ? 1 : 0;
                if (k > 0) j -= NUM_LEV;
                if (g.Progress[plLuigi] > j) {
                  j = g.Progress[plLuigi];
                  g.Progress[plMario] = j;
                }
                Menu[i] += `LEVEL ${String.fromCharCode(j + 0x30 + 1)} `;
                Menu[i] += k === 0 ? '\x07 ' : '* ';
                Menu[i] += `${g.NumPlayers}P`;
              }
            }
            Menu[4] = '';
            Menu[5] = '';
            Menu[6] = '';
            NumOptions = 3;
            LastStatus = ST_START;
            break;
          case ST_VERSUS:
            Menu[1] = 'ORIGINAL LEVELS';
            Menu[2] = 'SMB 1 LEVELS';
            Menu[3] = '';
            Menu[4] = '';
            Menu[5] = '';
            Menu[6] = '';
            NumOptions = 2;
            LastStatus = ST_MENU;
            break;
        }
        wd = 0;
        xp = 0;
        const widest = Status === ST_LEVELS ? LEVEL_LIST.map((l) => l.label) : Menu.slice(1, 7);
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
          if (Status === ST_MENU) {
            IntroDone = true;
            B.QuitGame = true;
          } else Status = LastStatus;
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
                case 1: Status = ST_START; break;
                case 2: Status = ST_SMBPLAYERS; break;
                case 3: Status = ST_VERSUS; break;
                case 4: Status = ST_LEVELS; break;
                case 5: Status = ST_OPTIONS; break;
                case 6:
                  IntroDone = true;
                  B.QuitGame = true;
                  break;
              }
              break;
            case ST_START:
              switch (Selected) {
                case 1: Status = ST_NUMPLAYERS; break;
                case 2: Status = ST_LOAD; break;
                case 3: Status = ST_ERASE; break;
              }
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
            case ST_NUMPLAYERS:
              NextNumPlayers = Selected;
              GameMode = 'original';
              IntroDone = true;
              break;
            case ST_SMBPLAYERS:
              NextNumPlayers = Selected;
              GameMode = 'smb';
              GameNumber = -1;
              IntroDone = true;
              break;
            case ST_VERSUS:
              NextNumPlayers = 1;
              NextVersus = true;
              GameMode = Selected === 2 ? 'smb' : 'original';
              GameNumber = -1;
              IntroDone = true;
              break;
            case ST_LEVELS:
              SelectedWorld = LEVEL_LIST[LevelSel];
              GameMode = SelectedWorld.kind === 'smb' ? 'smb' : 'original';
              GameNumber = -1;
              NextNumPlayers = 1;
              IntroDone = true;
              break;
            case ST_LOAD:
              GameNumber = Selected - 1;
              GameMode = 'original';
              Config.Games[GameNumber].NumPlayers = 1;
              {
                const g = Config.Games[GameNumber];
                if (g.Progress[plMario] === 0 && g.Progress[plLuigi] === 0) Status = ST_NUMPLAYERS;
                else {
                  IntroDone = true;
                  NextNumPlayers = g.NumPlayers;
                }
              }
              break;
            case ST_ERASE:
              NewData();
              Config.Games[Selected - 1] = cloneData(B.Data);
              Config.Games[Selected - 1].NumPlayers = 1;
              GameNumber = -1;
              break;
          }
          break;
      }
      if (K.Key !== 0) {
        Counter = 0;
        K.Key = MacroKey;
        Update = true;
      }

      for (let k = 1; k <= 6; k++) if (BG[Page][k] !== 0) VGA.PopBackGr(BG[Page][k]);

      for (let k = 1; k <= 6; k++) {
        if (Menu[k] !== '') {
          const i = xp;
          const j = 56 + 14 * k;
          BG[Page][k] = VGA.PushBackGr(50, j, 220, ht);
          if (k === Selected) WriteText(i - 12, j, '\x10', 5);
          let l = 15;
          if (Menu[k].length > 19 && Menu[k][18] === '*') l = 14 + (Counter & 1);
          VGA.SetPalette(14, 63, 61, 31);
          WriteText(i + 8, j, Menu[k], l);
        }
      }
      if (Status === ST_LEVELS) { // scroll marks
        if (LevelTop > 0) WriteText(258, 56 + 14, '', 15);
        if (LevelTop + 5 < LEVEL_LIST.length) WriteText(258, 56 + 14 * 5, '', 15);
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
  B.Data.NumPlayers = NextNumPlayers;
  B.Versus = NextVersus && IntroDone && !B.QuitGame;
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

    const d = B.Data;
    if (SelectedWorld) {
      // LEVEL SELECT: one player, start at the chosen level and continue
      // with the normal level order from there.
      d.Progress[plMario] = SelectedWorld.n + (SelectedWorld.turbo ? NUM_LEV : 0);
      d.Progress[plLuigi] = 0;
      d.NumPlayers = 1;
      if (SelectedWorld.kind === 'level' || SelectedWorld.kind === 'smb') SelectedWorld = null;
    }
    if (d.NumPlayers === 2) {
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
          if (SelectedWorld && SelectedWorld.kind !== 'level') {
            const w = SelectedWorld;
            SelectedWorld = null;
            E.Turbo = false;
            Passed = await playSpecial(w, CurPlayer);
            if (w.kind === 'title' || w.kind === 'my') EndGame = true;
          } else if (smb) Passed = await playSmb(lev, CurPlayer);
          else if (lev >= 0 && lev < LEVELS.length) Passed = await playLevel(lev, CurPlayer);
          else EndGame = true;

          // a warp pipe ($D1..$D7) advances several levels at once
          if (Passed) d.Progress[CurPlayer] += Math.max(1, B.Warp || 1);
          B.Warp = 0;
          if (GameNumber !== -1) { // keep the saved game up to date
            Config.Games[GameNumber] = cloneData(d);
            WriteConfig();
          }
          if (B.QuitGame) {
            EndGame = true;
            B.QuitGame = false;
          }
        }
      }
    } while (!(EndGame || B.QuitGame || d.Lives[plMario] + d.Lives[plLuigi] === 0));

    if (GameNumber !== -1) Config.Games[GameNumber] = cloneData(d);
    WriteConfig();
    // In a browser there is nothing to exit to: "END" just returns to the title.
    B.QuitGame = false;
  } while (true);
}

export { newGameData };
