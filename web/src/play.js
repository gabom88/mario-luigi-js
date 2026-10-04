// Port of PLAY.PAS: the main loop of one level.

import * as VGA from './vga256.js';
import {
  B, W, H, NH, NV, WorldMap, SaveWorldMap, ReadWorld, Swap, InitLevelScore, Beep, isPipeCode,
  BeeperOn, BeeperOff, PlayerName, mdSmall, dmNoDemo,
} from './buffers.js';
import {
  PL, InitPlayer, DrawPlayer, ErasePlayer, DoDemo, MovePlayer, InitVersus, InitVersusAtPipe,
} from './players.js';
import { VersusStep, DrawBoth, EraseBoth, resetFocus } from './versus.js';
import { InitTempObj, ShowTempObj, HideTempObj, MoveTempObj, RunRemove, AddLife } from './tmpobj.js';
import { InitBlocks, EraseBlocks, DrawBlocks, MoveBlocks } from './blocks.js';
import {
  InitSky, InitWalls, InitPipes, DrawSky, SetSkyPalette, Redraw, BuildWorld,
} from './figures.js';
import { ClearGlitter, ShowGlitter, HideGlitter } from './glitter.js';
import { InitBackGr, DrawBackGr, StartClouds, DrawPalBackGr, ReadColorMap } from './backgr.js';
import {
  E, StartEnemiesAt, ClearEnemies, StopEnemies, NewEnemy, ShowEnemies, HideEnemies,
  MoveEnemies, StartEnemies, tpLife, tpChamp,
} from './enemies.js';
import {
  P as PalState, Palette, P256, NewPalette, BlinkPalette, InitGrass, LockPal, UnLockPal,
  FadeUp, FadeDown, OutPalette, RefreshPalette, peNoEffect, peBlackWhite, peEGAMode,
} from './palettes.js';
import * as Pal from './palettes.js';
import { InitStars, ShowStars, HideStars } from './stars.js';
import { InitStatus, ShowStatus, HideStatus } from './status.js';
import { SetFont, CenterText, Bold, Shadow } from './txt.js';
import { PlayMusic, StopMusic, PauseMusic } from './music.js';
import * as KB from './keyboard.js';
import { K } from './keyboard.js';
import { random, delay, strWidth } from './pascal.js';

export const PS = {
  Stat: false,
  ShowRetrace: false,
};

let CheatsUsed = 0;

// Zones of a level made with the editor: [{ map, options }], zone 0 and 1
// are Map1 and Map2 of PlayWorld. Set before calling PlayWorld.
let pendingZones = null;
export function setZones(zones) {
  pendingZones = zones;
}

export async function PlayWorld(N1, N2, Map1, Opt1, Opt1b, Map2, Opt2, Opt2b, Player) {
  let result = false;
  const zones = pendingZones;
  pendingZones = null;
  let curZone = 0;
  const zoneState = [];
  B.Warp = 0;
  K.Key = 0;

  VGA.SetYOffset(VGA.YBASE);
  VGA.SetYStart(0x12);
  VGA.SetYEnd(0x7D);

  VGA.ClearPalette();
  LockPal();
  VGA.ClearVGAMem();

  B.TextCounter = 0;

  B.WorldNumber = `${N1}-${N2}`;
  const OnlyDraw = N1 === '\0' && N2 === '\0';

  let ShowObjects = true;

  PL.InPipe = false;
  PL.PipeCode = [0x20, 0x20];
  B.Demo = dmNoDemo;

  InitLevelScore();
  const TotalBackGrAddr = [0, 0];
  let ShowScore = false;
  let CountingScore = false;
  let Waiting = false;
  let TextStatus = false;

  if (!E.Turbo) {
    ReadWorld(Map2, WorldMap, Opt2);
    Swap();
    ReadWorld(Map1, WorldMap, Opt1);
  } else {
    ReadWorld(Map2, WorldMap, Opt2b);
    Swap();
    ReadWorld(Map1, WorldMap, Opt1b);
  }

  if (B.Versus) {
    resetFocus();
    InitVersus(B.Options.InitX, B.Options.InitY);
  } else InitPlayer(B.Options.InitX, B.Options.InitY, Player);
  PL.MapX = B.Options.InitX;
  PL.MapY = B.Options.InitY;

  B.XView = 0;
  B.YView = 0;

  B.LastXView[0] = 0;
  B.LastXView[1] = 0;
  VGA.SetView(B.XView, B.YView);

  // ---- local procedures ---------------------------------------------------

  function MoveScreen() {
    const page = VGA.CurrentPage();
    const Scroll = B.XView - B.LastXView[page];

    if (!PL.EarthQuake) VGA.SetView(B.XView, B.YView);
    else {
      PL.EarthQuakeCounter++;
      if (PL.EarthQuakeCounter > 0) PL.EarthQuake = false;
      VGA.SetView(B.XView, B.YView + random(2) - random(2));
    }

    if (Scroll < 0) StartEnemies(Math.trunc(B.XView / W) - StartEnemiesAt, 1);
    else if (Scroll > 0) StartEnemies(Math.trunc(B.XView / W) + NH + StartEnemiesAt, -1);

    const o = B.Options;
    const hz = o.Horizon;
    o.Horizon = hz + VGA.GetYOffset() - VGA.YBASE;
    DrawBackGr(false);
    o.Horizon = hz;

    if (Scroll > 0) {
      for (let j = B.LastXView[page]; j <= B.XView; j++) {
        let i = j - W - W;
        if (i >= 0) VGA.PutPixel(i, 0, 0);
        i = W - (j % W) - 1;
        Redraw(Math.trunc(j / W) + NH + 1, i);
      }
    }
    if (Scroll < 0) {
      for (let j = B.LastXView[page]; j >= B.XView; j--) {
        const i = W - (j % W) - 1;
        Redraw(Math.trunc(j / W) - 1, i);
      }
    }
  }

  function FindPipeExit() {
    for (let i = 0; i <= B.Options.XSize - 1 - 1; i++)
      for (let j = 0; j <= NH - 1; j++)
        if (i !== PL.MapX || j !== PL.MapY) {
          const c = WorldMap.get(i, j);
          if (isPipeCode(c) && WorldMap.get(i + 1, j) === PL.PipeCode[1]) {
            PL.MapX = i;
            PL.MapY = j;
            B.XView = (i - (NH >> 1) + 1) * W;
            if (B.XView > (B.Options.XSize - NH) * W) B.XView = (B.Options.XSize - NH) * W;
            if (B.XView < 0) B.XView = 0;
            return;
          }
        }
  }

  // Moves to another zone keeping the state of the one left (collected
  // coins, broken blocks...), like the original does with its two areas.
  function gotoZone(k) {
    if (k === curZone) return;
    if (k <= 1 && curZone <= 1) {
      Swap();
      curZone = k;
      return;
    }
    const save = (n, wb, opt) => { zoneState[n] = { mem: wb.mem.slice(), opt: { ...opt } }; };
    save(curZone, WorldMap, B.Options);
    if (curZone <= 1) save(1 - curZone, SaveWorldMap, B.SaveOptions);
    if (zoneState[k]) {
      WorldMap.mem.set(zoneState[k].mem);
      B.Options = { ...zoneState[k].opt };
    } else ReadWorld(zones[k].map, WorldMap, zones[k].options);
    if (k <= 1 && zoneState[1 - k]) {
      SaveWorldMap.mem.set(zoneState[1 - k].mem);
      B.SaveOptions = { ...zoneState[1 - k].opt };
    }
    curZone = k;
  }

  function WriteTotalScore() {
    SetFont(0, Bold + Shadow);
    const S = strWidth(B.Data.Score[Player], 11).split('');
    for (let i = 4; i <= S.length; i++) if (S[i - 1] === ' ') S[i - 1] = '0';
    CenterText(120, `TOTAL SCORE:${S.join('')}`, 31);
  }

  function ShowTotalBack() {
    if (B.Passed && CountingScore) Beep(4 * 880);
    TotalBackGrAddr[VGA.CurrentPage()] = VGA.PushBackGr(B.XView + 160, 120, 120, 8);
    if (B.Passed && CountingScore) Beep(2 * 880);
    WriteTotalScore();
    if (B.Passed && CountingScore) Beep(0);
  }

  function HideTotalBack() {
    const page = VGA.CurrentPage();
    if (TotalBackGrAddr[page] !== 0) VGA.PopBackGr(TotalBackGrAddr[page]);
    TotalBackGrAddr[page] = 0;
  }

  async function Pause() {
    let PauseText = 'PAUSE';
    PauseMusic();
    await FadeDown(8);

    VGA.SwapPages();
    let PauseBack = VGA.PushBackGr(B.XView + 120, 85, 80, 10);

    if (PauseBack !== 0) {
      OutPalette(0x0F, 63, 63, 63);
      SetFont(0, Bold + Shadow);
      CenterText(85, PauseText, 0x0F);
    }

    let EndPause = false;
    let Cheat = '';
    while (K.Key === KB.kbP) await VGA.waitRetrace();
    while (((K.Key - 0x80) & 0xFF) === KB.kbP) await VGA.waitRetrace();
    let OldKey = K.Key;
    if (K.Key === KB.kbTab) {
      K.cheatMode = true;
      const is = (...keys) => Cheat === String.fromCharCode(...keys);
      do {
        if (K.Key !== OldKey) {
          const Ch = KB.GetAsciiCode(K.Key);
          if (K.Key < 0x80) {
            Cheat += String.fromCharCode(K.Key);
            EndPause = Ch === 0;
          }
          OldKey = K.Key;

          if (is(KB.kbT, KB.kbE, KB.kbS, KB.kbT) || is(KB.kb0, KB.kb0, KB.kb4, KB.kb4)) {
            PS.ShowRetrace = !PS.ShowRetrace;
            EndPause = true;
          }
          if (is(KB.kb0, KB.kb3, KB.kbE, KB.kb8)) { AddLife(); EndPause = true; }
          if (is(KB.kbB, KB.kb1, KB.kb7, KB.kb2)) { B.Data.Lives[Player] = 10000; EndPause = true; }
          if (is(KB.kb9, KB.kbC, KB.kb3, KB.kb2)) { E.cdStar = 1; EndPause = true; }
          if (is(KB.kbF, KB.kb1, KB.kbF, KB.kb2)) { E.cdChamp = 1; EndPause = true; }
          if (is(KB.kbF, KB.kbF, KB.kbB, KB.kb5)) { E.cdFlower = 1; EndPause = true; }
          if (is(KB.kbD, KB.kb2, KB.kb3, KB.kb5)) { E.Turbo = !E.Turbo; EndPause = true; }
          if (is(KB.kb7, KB.kb6, KB.kbD, KB.kbD)) { KB.RecordMacro(); EndPause = true; }
          if (is(KB.kbC, KB.kb7, KB.kbB, KB.kb4)) { KB.PlayMacro(); EndPause = true; }
          if (is(KB.kb2, KB.kb0, KB.kb8, KB.kbD)) { KB.SaveMacro(); EndPause = true; }
          if (is(KB.kb1, KB.kbU, KB.kbP)) {
            if ((CheatsUsed & 1) === 0) {
              NewEnemy(tpLife, 0, Math.trunc(B.XView / W), -1, 2, 0, 2);
              CheatsUsed |= 1;
            } else {
              NewEnemy(tpChamp, 1, Math.trunc((B.XView + random(100)) / W), -1, 2 - random(2), 0, 2);
              if (random(10) === 0) CheatsUsed &= ~1;
            }
            EndPause = true;
          }
          if (is(KB.kb2, KB.kb3, KB.kb0, KB.kb5)) { // next level
            B.Passed = true;
            Waiting = true;
            B.TextCounter = 200;
            PL.PipeCode[0] = 0xE7;
            PL.InPipe = true;
            EndPause = true;
          }
          if (is(KB.kbM, KB.kbO, KB.kbN, KB.kbO)) {
            PalState.PaletteEffect = peBlackWhite;
            RefreshPalette(Palette);
            EndPause = true;
          }
          if (is(KB.kbE, KB.kbG, KB.kbA, KB.kbM, KB.kbO, KB.kbD, KB.kbE)) {
            PalState.PaletteEffect = peEGAMode;
            RefreshPalette(Palette);
            EndPause = true;
          }
          if (is(KB.kbV, KB.kbG, KB.kbA, KB.kbM, KB.kbO, KB.kbD, KB.kbE)
            || is(KB.kbC, KB.kbO, KB.kbL, KB.kbO, KB.kbR)) {
            PalState.PaletteEffect = peNoEffect;
            RefreshPalette(Palette);
            EndPause = true;
          }
          if (is(KB.kbC, KB.kbR, KB.kbE, KB.kbD, KB.kbI, KB.kbT, KB.kbS)) {
            PauseText = CREDITS;
            if (PauseBack !== 0) VGA.PopBackGr(PauseBack);
            PauseBack = VGA.PushBackGr(B.XView + 20, 85, 280, 10);
            CenterText(85, PauseText, 0x0F);
          }
        }
        if (!EndPause) await VGA.waitRetrace();
      } while (!EndPause);
      K.cheatMode = false;
    }

    if (PauseBack !== 0) VGA.PopBackGr(PauseBack);
    VGA.SwapPages();

    await FadeUp(8);
    K.Key = 255;
  }

  // ---- PlayWorld ----------------------------------------------------------

  let stage = 'build';
  for (;;) {
    if (stage === 'build') {
      const o = B.Options;
      InitSky(o.SkyType);
      InitWalls(o.WallType1, o.WallType2, o.WallType3);
      InitPipes(o.PipeColor);
      InitBackGr(o.BackGrType, o.Clouds);
      if (o.Stars !== 0) InitStars();
      BuildWorld();
    }

    // Restart:
    VGA.ResetStack();

    TextStatus = false;
    InitStatus();

    InitBlocks();
    InitTempObj();
    ClearGlitter();
    ClearEnemies();

    await VGA.ShowPage();

    B.GameDone = false;
    B.Passed = false;

    for (let i = -StartEnemiesAt; i <= NH + StartEnemiesAt; i++) {
      const j = Math.trunc(B.XView / W) + i;
      StartEnemies(j, 1 - 2 * (j > PL.MapX ? 1 : 0));
    }

    VGA.SetYOffset(VGA.YBASE);

    for (let i = 0; i <= VGA.MAX_PAGE; i++) {
      DrawSky(B.XView, 0, NH * W, NV * H);

      StartClouds();

      for (let x = Math.trunc(B.XView / W) - 1; x <= Math.trunc(B.XView / W) + NH; x++)
        for (let y = 0; y <= NV - 1; y++) Redraw(x, y);

      DrawBackGr(true);
      ReadColorMap();

      if (B.Options.Stars !== 0) ShowStars();

      ShowEnemies();
      if (!OnlyDraw) {
        if (B.Versus) DrawBoth();
        else DrawPlayer();
      }
      await VGA.ShowPage();
    }

    B.Demo = dmNoDemo;
    Waiting = false;

    NewPalette(P256);
    for (let i = 1; i <= 100; i++) BlinkPalette(); // Waterfalls

    SetSkyPalette();
    DrawPalBackGr();
    InitGrass();

    if (OnlyDraw) return result;

    UnLockPal();
    await FadeUp(64);
    Pal.ReadPalette(Palette);

    TextStatus = PS.Stat && !KB.PlayingMacro();

    let next = null;
    do {
      if (!KB.PlayingMacro()) {
        if (K.Key === 31) { // S - Status on/off
          PS.Stat = !PS.Stat;
          TextStatus = PS.Stat;
          K.Key = 255;
          PS.onSettingsChanged?.();
        }
        if (K.Key === 16) { // Q - quiet/sound
          if (B.BeeperSound) BeeperOff();
          else {
            BeeperOn();
            Beep(80);
          }
          K.Key = 255;
          PS.onSettingsChanged?.();
        }
        if (K.Key === 197 || K.Key === 198) { // Pause/Break
          PauseMusic();
          do {
            while (K.Key === 197) await VGA.waitRetrace();
            await VGA.waitRetrace();
          } while (!KB.kbHit());
        }
      } else if (K.Key !== 0) {
        B.GameDone = true;
        B.Passed = true;
      }

      if (B.TextCounter >= 40 && B.TextCounter <= 40 + VGA.MAX_PAGE) ShowObjects = false;

      HideGlitter();
      if (B.Options.Stars !== 0) HideStars();
      if (ShowObjects) HideTempObj();
      HideStatus();
      if (ShowScore) HideTotalBack();
      if (B.Versus) EraseBoth();
      else ErasePlayer();
      if (ShowObjects) {
        HideEnemies();
        EraseBlocks();
      }

      B.LavaCounter = (B.LavaCounter + 1) & 0xFF;

      if (!Waiting) {
        if (B.Versus) VersusStep();
        else if (B.Demo === dmNoDemo) {
          MoveEnemies();
          MovePlayer();
        } else DoDemo();
      }

      if (!Waiting) {
        if (B.Passed) {
          if (B.Demo === dmNoDemo || PL.InPipe) {
            Waiting = true;
            B.TextCounter = 0;
          }
          B.TextCounter++;
          if (!ShowScore && B.TextCounter >= 50 && B.TextCounter <= 50 + VGA.MAX_PAGE) {
            SetFont(0, Bold + Shadow);
            CenterText(20, PlayerName[B.Character[Player]], 0x1E);
            SetFont(1, Bold + Shadow);
            CenterText(40, 'STAGE CLEAR!', 31);
            if (B.TextCounter === 50 + VGA.MAX_PAGE) ShowScore = true;
          }
        } else if (B.GameDone) {
          B.Data.Lives[Player]--;
          B.Data.Mode[Player] = mdSmall;
          if (B.Versus) B.Data.Mode[1] = mdSmall;
          B.TextCounter = 0;
          B.Data.Score[Player] += B.LevelScore;
          Waiting = true;
          B.GameDone = false;
        }
      }

      if (K.Key === 25) await Pause(); // P - pause

      if (ShowScore && B.TextCounter === 120 && B.LevelScore > 0) {
        let i = B.LevelScore - 50;
        if (i < 0) i = 0;
        B.Data.Score[Player] += B.LevelScore - i;
        B.LevelScore = i;
        B.TextCounter = 119;
        CountingScore = true;
      } else CountingScore = false;

      if (Waiting) {
        B.TextCounter++;
        if (B.Data.Lives[Player] === 0) {
          if (B.TextCounter >= 100 && B.TextCounter <= 100 + VGA.MAX_PAGE) {
            SetFont(0, Bold + Shadow);
            CenterText(20, PlayerName[B.Character[Player]], 0x1E);
            SetFont(1, Bold + Shadow);
            CenterText(40, 'GAME OVER', 31);
            ShowScore = true;
          }
          if (B.TextCounter > 350) B.GameDone = true;
        } else if (B.Passed) {
          if (B.TextCounter > 250) Waiting = false;
        } else if (B.TextCounter > 100) B.GameDone = true;
      }

      MoveTempObj();
      MoveBlocks();

      if (K.Key === KB.kbEsc || K.Key === 0x81) B.QuitGame = true;

      MoveScreen();
      RunRemove();

      if (B.Options.Horizon < NV) {
        const j = B.Options.Horizon - 1;
        for (let i = 0; i <= NH; i++) {
          const k = Math.trunc(B.XView / W) + ((i + (B.LavaCounter >> 3)) % (NH + 1));
          if (WorldMap.get(k, j) === 0x25) Redraw(k, j); // '%'
        }
      }

      VGA.ResetStack();

      if (ShowObjects) {
        DrawBlocks();
        ShowEnemies();
      }
      if (B.Versus) DrawBoth();
      else DrawPlayer();

      if (ShowScore) ShowTotalBack();
      if (TextStatus) ShowStatus();
      if (ShowObjects) ShowTempObj();
      if (B.Options.Stars !== 0) ShowStars();
      ShowGlitter();

      B.LastXView[VGA.CurrentPage()] = B.XView;

      if (PS.ShowRetrace) VGA.SetPalette(0, 0, 0, 0);
      await VGA.ShowPage();
      if (PS.ShowRetrace) VGA.SetPalette(0, 63, 63, 63);

      DrawPalBackGr();
      BlinkPalette();
      PlayMusic();

      if (PL.InPipe && KB.PlayingMacro()) B.GameDone = true;

      if (PL.InPipe && !B.GameDone && !Waiting) {
        StopEnemies();
        ClearGlitter();
        await FadeDown(64);
        VGA.ClearPalette();
        LockPal();
        VGA.ClearVGAMem();

        switch (PL.PipeCode[0]) {
          case 0xE0:
            FindPipeExit();
            await delay(100);
            break;
          case 0xE1:
            if (curZone <= 1) {
              Swap();
              curZone = 1 - curZone;
            } else {
              gotoZone(0);
              PL.MapX = -1; // search the whole map (another zone)
            }
            FindPipeExit();
            break;
          case 0xE7:
            B.GameDone = true;
            result = true;
            break;
          default: {
            const code = PL.PipeCode[0];
            if (code >= 0xD1 && code <= 0xD7) { // warp to a later level
              B.GameDone = true;
              result = true;
            } else if (code >= 0xC0 && code <= 0xC7 && zones && code - 0xC0 < zones.length) {
              const before = curZone;
              gotoZone(code - 0xC0);
              if (curZone !== before) PL.MapX = -1;
              FindPipeExit();
            } else FindPipeExit(); // unknown zone: behave like $E0
          }
        }

        // VERSUS: both players come out of the pipe the other one took
        if (B.Versus) InitVersusAtPipe(PL.MapX * W + (W >> 1), (PL.MapY - 1) * H);
        else InitPlayer(PL.MapX * W + (W >> 1), (PL.MapY - 1) * H, Player);

        VGA.SetView(B.XView, B.YView);
        VGA.SetYOffset(VGA.YBASE);

        for (let i = 0; i <= VGA.MAX_PAGE; i++) B.LastXView[i] = B.XView;

        const pc = PL.PipeCode[0];
        if (pc === 0xE0 || (pc >= 0xC0 && pc <= 0xC7 && !(zones && pc - 0xC0 < zones.length))) {
          next = 'restart';
          break;
        }
        if (pc === 0xE1 || (pc >= 0xC0 && pc <= 0xC7)) { next = 'build'; break; }
      }
    } while (!(B.GameDone || B.QuitGame));

    if (next) {
      stage = next;
      continue;
    }
    break;
  }

  VGA.SetYOffset(VGA.YBASE);

  ClearEnemies();
  ClearGlitter();
  await FadeDown(64);
  VGA.ClearPalette();
  VGA.ClearVGAMem();
  StopMusic();
  return result;
}

const CREDITS = 'PROGRAMMED BY MIKE WIERING';
