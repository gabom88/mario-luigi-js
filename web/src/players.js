// Port of PLAYERS.PAS: Mario / Luigi movement, collisions and drawing.

import * as VGA from './vga256.js';
import {
  B, W, H, NV, EY1, WorldMap, canHoldYou, canStandOn, isHidden, AddScore, Beep, isPipeEntry,
  dirLeft, dirRight, mdSmall, mdLarge, mdFire, plMario, plLuigi,
  dmNoDemo, dmDownInToPipe, dmUpOutOfPipe, dmUpInToPipe, dmDownOutOfPipe, dmDead,
} from './buffers.js';
import { BumpBlock } from './blocks.js';
import { Redraw, mirrorPlanar } from './figures.js';
import { StartGlitter } from './glitter.js';
import { BreakBlock, HitCoin, Remove, tpNote, AddLife } from './tmpobj.js';
import {
  E, NewEnemy, HitAbove, tpFireBall, tpRisingChamp, tpRisingFlower, tpRisingLife, tpRisingStar,
} from './enemies.js';
import {
  StartMusic, GrowMusic, HitMusic, DeadMusic, StarMusic, NoteMusic, PipeMusic,
} from './music.js';
import * as KB from './keyboard.js';
import { J, ReadJoystick } from './joystick.js';
import { ch, byte, round } from './pascal.js';
import { RAW as RAWS } from './data.js';
import { vibrate } from './extras.js';

export const stOnTheGround = 0;
export const stJumping = 1;
export const stFalling = 2;

const SCROLL_AT = 112;

const JumpVel = 4;
const JumpDelay = 6;
const MaxYVel = JumpVel * 2;
const Slip = 6;
const BlinkTime = 125;
const StarTime = 750;
const GrowTime = 24;

const MAX_SPEED = 2;

const Safe = EY1;
const HSafe = H * Safe;

// Exported state of the unit
export const PL = {
  Blinking: false,
  Growing: false,
  InPipe: false,
  PipeCode: [0x20, 0x20],
  MapX: 0,
  MapY: 0,
  EarthQuake: false,
  EarthQuakeCounter: 0,
  Small: 0,
};

let keyLeft = false;
let keyRight = false;
let keyUp = false;
let keyDown = false;
let keyAlt = false;
let keyCtrl = false;
let keySpace = false;

const newSaveScreen = () => [
  { Visible: false, XPos: 0, YPos: 0, BackGrAddr: 0 },
  { Visible: false, XPos: 0, YPos: 0, BackGrAddr: 0 },
];
let SaveScreen = newSaveScreen();

let X = 0, Y = 0, OldX = 0, OldY = 0, DemoX = 0, DemoY = 0;
let DemoCounter1 = 0, DemoCounter2 = 0, XVel = 0, YVel = 0;
let Direction = 0, Status = 0, WalkingMode = 0, Counter = 0, WalkCount = 0;
let HighJump = false, HitEnemy = false, Jumped = false, Fired = false;
let FireCounter = 0, StarCounter = 0, GrowCounter = 0, BlinkCounter = 0;
let AtCh1 = 0x20, AtCh2 = 0x20, Below1 = 0x20, Below2 = 0x20;

// --- VERSUS: two players --------------------------------------------------
// The unit keeps the state of one player in its variables (like the
// original). In VERSUS each player has a saved copy of that state and
// selectPlayer loads one or the other before moving or drawing it.

export const VS = {
  cur: 0, // player whose state is loaded
  slots: [null, null],
  down: [false, false], // dead, waiting to reappear
  respawn: [0, 0], // frames left until it reappears
  died: false, // set when the loaded player has just died
};

const E_KEYS = ['Star', 'cdChamp', 'cdLife', 'cdFlower', 'cdStar', 'cdEnemy', 'cdHit', 'cdLift',
  'cdStopJump', 'PlayerX1', 'PlayerY1', 'PlayerX2', 'PlayerY2', 'PlayerXVel', 'PlayerYVel'];

// (Re)starting player: no pending collision codes from its last life
function initFresh(InitX, InitY, Name) {
  InitPlayer(InitX, InitY, Name);
  for (const k of E_KEYS) if (k.startsWith('cd')) E[k] = 0;
  B.Demo = dmNoDemo;
}

function snapshot() {
  const e = {};
  for (const k of E_KEYS) e[k] = E[k];
  return {
    X, Y, OldX, OldY, DemoX, DemoY, DemoCounter1, DemoCounter2, XVel, YVel,
    Direction, Status, WalkingMode, Counter, WalkCount, HighJump, HitEnemy, Jumped, Fired,
    FireCounter, StarCounter, GrowCounter, BlinkCounter, AtCh1, AtCh2, Below1, Below2,
    keyLeft, keyRight, keyUp, keyDown, keyAlt, keyCtrl, keySpace, SaveScreen,
    Player: B.Player,
    Demo: B.Demo,
    PL: {
      Blinking: PL.Blinking, Growing: PL.Growing, InPipe: PL.InPipe, PipeCode: PL.PipeCode.slice(),
      MapX: PL.MapX, MapY: PL.MapY, Small: PL.Small,
    },
    E: e,
  };
}

function restore(c) {
  ({
    X, Y, OldX, OldY, DemoX, DemoY, DemoCounter1, DemoCounter2, XVel, YVel,
    Direction, Status, WalkingMode, Counter, WalkCount, HighJump, HitEnemy, Jumped, Fired,
    FireCounter, StarCounter, GrowCounter, BlinkCounter, AtCh1, AtCh2, Below1, Below2,
    keyLeft, keyRight, keyUp, keyDown, keyAlt, keyCtrl, keySpace, SaveScreen,
  } = c);
  B.Player = c.Player;
  B.Demo = c.Demo;
  Object.assign(PL, c.PL);
  PL.PipeCode = c.PL.PipeCode.slice();
  Object.assign(E, c.E);
}

// Loads the state of player i (0 or 1). Outside VERSUS it does nothing.
export function selectPlayer(i) {
  if (!B.Versus || i === VS.cur) return;
  VS.slots[VS.cur] = snapshot();
  restore(VS.slots[i]);
  VS.cur = i;
}

// Saved state of the player that is not loaded
export const otherPlayer = (i) => VS.slots[i];

// Both players start at (InitX, InitY), player 2 one block to the right
// when there is room for it.
export function InitVersus(InitX, InitY) {
  VS.cur = 0;
  VS.down = [false, false];
  VS.respawn = [0, 0];
  VS.died = false;
  SaveScreen = newSaveScreen();
  initFresh(InitX, InitY, 0);
  VS.slots[0] = snapshot();
  const free = (x) => [0, 1].every((k) => !canHoldYou(WorldMap.get(Math.trunc((x + k * (W - 1)) / W),
    Math.trunc((InitY + H) / H))) && !canHoldYou(WorldMap.get(Math.trunc((x + k * (W - 1)) / W),
    Math.trunc((InitY + 2 * H - 1) / H))));
  SaveScreen = newSaveScreen();
  initFresh(free(InitX + W) ? InitX + W : InitX, InitY, 1);
  VS.slots[1] = snapshot();
  restore(VS.slots[0]);
}

// After a pipe both players come out of the pipe the loaded one entered.
export function InitVersusAtPipe(InitX, InitY) {
  const { MapX, MapY, PipeCode } = PL;
  const lead = VS.cur;
  for (const i of [1 - lead, lead]) {
    selectPlayer(i);
    initFresh(InitX, InitY, i);
    PL.InPipe = true;
    PL.MapX = MapX;
    PL.MapY = MapY;
    PL.PipeCode = PipeCode.slice();
  }
  VS.down = [false, false];
  VS.respawn = [0, 0];
}

// The loaded player reappears at (NewX, NewY), blinking (it cannot be hurt
// for a moment).
export function Respawn(NewX, NewY) {
  initFresh(NewX, NewY, VS.cur);
  PL.InPipe = false;
  PL.Blinking = true;
  BlinkCounter = 0;
}

export const playerX = () => X;
export const playerY = () => Y;

// Keeps the loaded player between MinX and MaxX (the VERSUS camera)
export function ClampPlayer(MinX, MaxX) {
  if (X < MinX) {
    X = MinX;
    if (XVel < 0) XVel = 0;
  } else if (X > MaxX) {
    X = MaxX;
    if (XVel > 0) XVel = 0;
  } else return;
  E.PlayerX1 = X + XVel;
  E.PlayerX2 = E.PlayerX1 + W - 1;
  E.PlayerXVel = XVel;
}

// Codes 254 / 255 below the map stop the screen from scrolling past them
// while the player (top at PlayerY1) is next to a wall there.
export function ViewLocked(NewXView, OldXView, PlayerY1) {
  if (NewXView < OldXView
    && WorldMap.get(Math.trunc(NewXView / W), NV) === 254
    && WorldMap.get(Math.trunc(NewXView / W), round(PlayerY1 / H)) !== 0x20) return true;
  return NewXView > OldXView
    && WorldMap.get(Math.trunc((NewXView - 1) / W) + 16, NV) === 255
    && WorldMap.get(Math.trunc((NewXView - 1) / W) + 16, round(PlayerY1 / H)) !== 0x20;
}

// A player fell into a hole or finished dying
function PlayerDown() {
  if (B.Versus) VS.died = true;
  else B.GameDone = true;
}

// PictureBuffer [plMario..plLuigi, mdSmall..mdFire, 0..3, dirLeft..dirRight]
const PIC = W * 2 * H;
const Pictures = [0, 1].map(() => [0, 1, 2].map(() => [0, 1, 2, 3].map(() =>
  [new Uint8Array(PIC).fill(0xFF), new Uint8Array(PIC).fill(0xFF)])));

// Sprites follow the character chosen for the player slot (Mario / Luigi)
const pic = (md, n, dir) => Pictures[B.Character[B.Player]][md][n][dir];

export function InitPlayerFigures() {
  const names = [['SWMAR', 'SJMAR'], ['LWMAR', 'LJMAR'], ['FWMAR', 'FJMAR']];
  for (let pl = plMario; pl <= plLuigi; pl++)
    for (let md = mdSmall; md <= mdFire; md++) {
      const [walk, jump] = names[md].map((s) => (pl === plLuigi ? s.replace('MAR', 'LUI') : s));
      Pictures[pl][md][0][dirLeft].set(RAWS[`${walk}000`]);
      Pictures[pl][md][1][dirLeft].set(RAWS[`${walk}001`]);
      Pictures[pl][md][2][dirLeft].set(RAWS[`${jump}000`]);
      Pictures[pl][md][3][dirLeft].set(RAWS[`${jump}001`]);
      for (let n = 0; n <= 3; n++)
        mirrorPlanar(Pictures[pl][md][n][dirLeft], Pictures[pl][md][n][dirRight], W, 2 * H);
    }
}

export function InitPlayer(InitX, InitY, Name) {
  B.Player = Name;
  X = InitX;
  Y = InitY;
  OldX = X;
  OldY = Y;
  XVel = 0;
  YVel = 0;
  Direction = dirRight;
  WalkingMode = 0;
  Status = stOnTheGround;
  Jumped = false;
  Fired = false;
  HitEnemy = false;
  SaveScreen[0].Visible = false;
  SaveScreen[1].Visible = false;
  E.PlayerX1 = X;
  E.PlayerX2 = X + W - 1;
  E.PlayerY1 = Y + H;
  E.PlayerY2 = Y + 2 * H - 1;
  E.PlayerXVel = XVel;
  E.PlayerYVel = YVel;
  PL.Blinking = false;
  E.Star = false;
  PL.Growing = false;
  PL.EarthQuake = false;
}

function saveBack() {
  const s = SaveScreen[VGA.CurrentPage()];
  s.BackGrAddr = VGA.PushBackGr(X, Y, W + 4, 2 * H);
  s.XPos = X;
  s.YPos = Y;
  s.Visible = true;
}

function DrawDemo() {
  saveBack();
  const img = pic(B.Data.Mode[B.Player], WalkingMode, Direction);
  switch (B.Demo) {
    case dmDownInToPipe:
    case dmUpOutOfPipe:
      VGA.DrawPart(X, Y + DemoY, W, 2 * H, 0, 2 * H - DemoY - 1, img);
      break;
    case dmUpInToPipe:
    case dmDownOutOfPipe:
      VGA.DrawPart(X, Y + DemoY, W, 2 * H, -DemoY, 2 * H, img);
      Redraw(PL.MapX, PL.MapY - 1);
      Redraw(PL.MapX + 1, PL.MapY - 1);
      break;
    case dmDead:
      VGA.DrawImage(X, Y, W, 2 * H, img);
      break;
  }
  OldX = X;
  OldY = Y;
}

export function DrawPlayer() {
  if (B.Demo !== dmNoDemo) {
    DrawDemo();
    return;
  }
  if (!PL.Blinking || BlinkCounter % 2 === 0) {
    saveBack();
    const md = B.Data.Mode[B.Player];
    if (md === mdFire && keySpace && FireCounter < 7) {
      FireCounter++;
      VGA.DrawPart(X, Y + 1, W, 2 * H, 0, 20, pic(mdFire, 1, Direction));
      VGA.DrawPart(X, Y, W, 2 * H, 21, 2 * H, pic(mdFire, 0, Direction));
    } else if (E.Star || PL.Growing) {
      const gs = GrowCounter + StarCounter;
      VGA.RecolorImage(X, Y, W, 2 * H, pic(md, WalkingMode, Direction),
        ((gs & 1) << 4) - byte((gs & 0xF) < 8));
    } else {
      VGA.DrawImage(X, Y, W, 2 * H, pic(md, WalkingMode, Direction));
    }
    OldX = X;
    OldY = Y;
  }
}

export function ErasePlayer() {
  const s = SaveScreen[VGA.CurrentPage()];
  if (!s.Visible) return;
  VGA.PopBackGr(s.BackGrAddr);
  s.Visible = false;
}

export function DoDemo() {
  PL.Small = 9 * byte(B.Data.Mode[B.Player] === mdSmall);
  switch (B.Demo) {
    case dmDownInToPipe:
    case dmUpOutOfPipe:
      // $E7: exit; $D1..$D7: warp to a later level (editor levels)
      const exit = PL.PipeCode[0] === 0xE7 || (PL.PipeCode[0] >= 0xD1 && PL.PipeCode[0] <= 0xD7);
      if (exit && !B.Passed) {
        B.Warp = PL.PipeCode[0] === 0xE7 ? 1 : PL.PipeCode[0] - 0xD0;
        B.Passed = true;
        B.TextCounter = 0;
      }
      DemoCounter1++;
      if (DemoCounter1 % 3 === 0) {
        if (B.Demo === dmDownInToPipe) {
          DemoY++;
          if (DemoY > 2 * H - PL.Small) {
            DemoCounter2++;
            DemoY--;
            if (DemoCounter2 > 10) PL.InPipe = true;
          }
        } else {
          DemoY--;
          if (DemoY < 0) {
            DemoY++;
            B.Demo = dmNoDemo;
          }
        }
      }
      break;
    case dmUpInToPipe:
    case dmDownOutOfPipe:
      DemoCounter1++;
      if (DemoCounter1 % 3 === 0) {
        if (B.Demo === dmDownOutOfPipe) {
          DemoY++;
          if (DemoY > -PL.Small) {
            B.Demo = dmNoDemo;
            DemoY--;
          }
        } else {
          DemoY--;
          if (DemoY < -2 * H + PL.Small) {
            DemoCounter2++;
            DemoY++;
            if (DemoCounter2 > 10) PL.InPipe = true;
          }
        }
      }
      break;
    case dmDead:
      DemoCounter1++;
      if (DemoCounter1 % 7 === 0) YVel++;
      Y += YVel;
      if (Y > NV * H) PlayerDown();
      break;
  }
}

function StartDemo(dm) {
  B.Demo = dm;
  DemoCounter1 = 0;
  DemoCounter2 = 0;
  DemoX = 0;
  DemoY = 0;
  Below1 = 0x20;
  Below2 = 0x20;
  AtCh1 = 0x20;
  AtCh2 = 0x20;
  if ([dmDownInToPipe, dmUpInToPipe, dmDownOutOfPipe, dmUpOutOfPipe].includes(dm))
    StartMusic(PipeMusic);
  const small = byte(B.Data.Mode[B.Player] === mdSmall);
  switch (dm) {
    case dmUpOutOfPipe:
      DemoY = 2 * H - 9 * small;
      break;
    case dmDownOutOfPipe:
      DemoY = -2 * H;
      Y += H - 7 * small - 2;
      break;
    case dmDead:
      YVel = -3;
      Beep(220);
      break;
  }
  PL.InPipe = false;
}

const inRange = (v, a, b) => v >= a && v <= b;

function CheckPipeBelow() {
  if (XVel !== 0 || YVel !== 0 || Y % H !== 0) return;
  const Mo = X % W;
  if (!inRange(Mo, 4, W - 4)) return;
  if (Below1 !== ch('0') || Below2 !== ch('1')
    || !isPipeEntry(AtCh1)
    || !inRange(AtCh2, 0xE0, 0xEF)) return;
  PL.PipeCode[0] = AtCh1;
  PL.PipeCode[1] = AtCh2;
  StartDemo(dmDownInToPipe);
}

function CheckPipeAbove(C1, C2) {
  const Mo = X % W;
  if (!inRange(Mo, 4, W - 4)) return;
  if (C1 !== ch('0') || C2 !== ch('1')) return;
  PL.MapX = Math.trunc(X / W);
  PL.MapY = Math.trunc(Y / H) + 1;
  if (!isPipeEntry(WorldMap.get(PL.MapX, PL.MapY))
    || !inRange(WorldMap.get(PL.MapX + 1, PL.MapY), 0xE0, 0xEF)) return;
  PL.PipeCode[0] = WorldMap.get(PL.MapX, PL.MapY);
  PL.PipeCode[1] = WorldMap.get(PL.MapX + 1, PL.MapY);
  StartDemo(dmUpInToPipe);
}

const holdOrStand = (c) => canHoldYou(c) || canStandOn(c);
const holdOrHidden = (c) => canHoldYou(c) || isHidden(c);

function Check() {
  let NewCh1 = 0x20;
  let NewCh2 = 0x20;
  let NewCh3 = 0x20;
  let Hold1, Hold2, Hold3, NewY, Mo, Ch;
  const mode = () => B.Data.Mode[B.Player];

  const Side = byte(XVel > 0) * (W - 1);
  let NewX1 = Math.trunc((X + Side) / W);
  let NewX2 = Math.trunc((X + Side + XVel) / W);
  const Small = mode() === mdSmall;

  function CheckFall() {
    if (!(Hold1 || Hold2)) {
      if (NewCh1 === ch('*')) HitCoin(NewX1 * W, NewY * H, false);
      if (NewCh2 === ch('*')) HitCoin(NewX2 * W, NewY * H, false);
      if (Counter % JumpDelay === 0) YVel++;
      if (YVel > MaxYVel) YVel = MaxYVel;
    } else {
      if (NewCh1 === ch('=') || NewCh2 === ch('=')) E.cdHit = 1;

      Mo = (X + XVel) % W;
      Y = (Math.trunc((Y + YVel + 1 + HSafe) / H) - Safe) * H;
      YVel = 0;
      Status = stOnTheGround;
      Jumped = true;

      if (NewCh1 === ch('K') || NewCh2 === ch('K')) {
        StartMusic(NoteMusic);
        if (NewCh1 === ch('K')) {
          BumpBlock(NewX1 * W, NewY * H);
          Remove(NewX1 * W, NewY * H, W, H, tpNote);
          WorldMap.set(NewX1, NewY, ch('K'));
        }
        if (NewCh2 === ch('K')) {
          BumpBlock(NewX2 * W, NewY * H);
          Remove(NewX2 * W, NewY * H, W, H, tpNote);
          WorldMap.set(NewX2, NewY, ch('K'));
        }
        Counter = 0;
        Status = stJumping;
        Jumped = false;
        HighJump = true;
        YVel = -5;
        HitEnemy = true;
      }

      if (inRange(Mo, 0, (W >> 1) - 1)) {
        if (Hold1) {
          Ch = NewCh1;
          NewX2 = NewX1;
        } else Ch = NewCh2;
      } else if (inRange(Mo, W >> 1, W)) {
        if (Hold2) Ch = NewCh2;
        else {
          Ch = NewCh1;
          NewX2 = NewX1;
        }
      }
    }
  }

  function CheckJump() {
    if (E.cdEnemy !== 0) {
      vibrate(18); // stomped an enemy
      HitEnemy = true;
      Jumped = false;
    }
    if (!Jumped && (keyAlt || HitEnemy)) {
      Counter = 0;
      Status = stJumping;
      HighJump = Math.abs(XVel) === 2 || (HitEnemy && keyAlt);
      YVel = -JumpVel - 2 * byte(HitEnemy && keyAlt) - byte(E.Turbo);
    }
    E.cdEnemy = 0;
  }

  if (NewX1 !== NewX2) {
    const Y1 = Math.trunc((Y + HSafe + 4) / H) - Safe;
    const Y2 = Math.trunc((Y + HSafe + H) / H) - Safe;
    const Y3 = Math.trunc((Y + HSafe + 2 * H - 1) / H) - Safe;
    NewCh1 = WorldMap.get(NewX2, Y1);
    NewCh2 = WorldMap.get(NewX2, Y2);
    NewCh3 = WorldMap.get(NewX2, Y3);

    if (NewCh3 === ch('*')) HitCoin(NewX2 * W, Y3 * H, false);
    if (NewCh2 === ch('*')) HitCoin(NewX2 * W, Y2 * H, false);
    else if (NewCh2 === ch('z')) E.Turbo = true;
    if (!Small && NewCh1 === ch('*')) HitCoin(NewX2 * W, Y1 * H, false);

    Hold1 = canHoldYou(NewCh1) && !Small;
    Hold2 = canHoldYou(NewCh2);
    Hold3 = canHoldYou(NewCh3);

    if (Hold1 || Hold2 || Hold3) {
      XVel = 0;
      WalkingMode = 0;
    }
  }

  NewX1 = Math.trunc((X + XVel) / W);
  NewX2 = Math.trunc((X + XVel + W - 1) / W);

  if (E.cdEnemy !== 0) CheckJump();

  if (Status === stJumping)
    NewY = Math.trunc((Y + 1 + 4 + (H - 1 - 4) * byte(Small) + YVel + HSafe) / H) - Safe;
  else
    NewY = Math.trunc((Y + 1 + 2 * H + YVel + HSafe) / H) - Safe;

  NewCh1 = WorldMap.get(NewX1, NewY);
  NewCh2 = WorldMap.get(NewX2, NewY);
  NewCh3 = WorldMap.get(Math.trunc((X + XVel + (W >> 1)) / W), NewY);
  Hold1 = holdOrStand(NewCh1);
  Hold2 = holdOrStand(NewCh2);
  Hold3 = holdOrStand(NewCh3);

  switch (Status) {
    case stFalling:
      CheckFall();
      break;

    case stOnTheGround:
      if (E.cdLift === 0) {
        if (!(Hold1 || Hold2)) {
          Status = stFalling;
          if (Math.abs(XVel) < 2) Y++;
        } else if (NewCh1 === ch('K') || NewCh2 === ch('K')) {
          CheckFall();
        } else {
          if (XVel === 0) {
            Below1 = NewCh1;
            Below2 = NewCh2;
            PL.MapX = NewX1; // Codes for pipes
            PL.MapY = NewY - 1;
            AtCh1 = WorldMap.get(PL.MapX, PL.MapY);
            AtCh2 = WorldMap.get(PL.MapX + 1, PL.MapY);

            Mo = X % W;
            if (!Hold1 && inRange(Mo, 1, 5)) XVel--;
            if (!Hold2 && inRange(Mo, W - 5, W - 1)) XVel++;
          }
          CheckJump();
        }
      } else {
        YVel = E.PlayerYVel;
        CheckJump();
      }
      break;

    case stJumping: {
      Hold1 = holdOrHidden(NewCh1);
      Hold2 = holdOrHidden(NewCh2);
      Hold3 = holdOrHidden(NewCh3);

      let Hit = Hold1 || Hold2;
      if (Hit) {
        Mo = (X + XVel) % W;
        if ((inRange(Mo, 1, 4) || inRange(Mo, W - 4, W - 1)) && !Hold3) {
          if (!(isHidden(NewCh1) && isHidden(NewCh2))) Hit = false;
          if (Mo < (W >> 1) && !isHidden(NewCh2)) X -= Mo;
          else if (Mo >= (W >> 1) && !isHidden(NewCh1)) X += W - Mo;
        }
      }
      if (!Hit) {
        if (NewCh1 === ch('*')) HitCoin(NewX1 * W, NewY * H, false);
        if (NewCh2 === ch('*')) HitCoin(NewX2 * W, NewY * H, false);
        if (Counter % (JumpDelay + byte(HighJump)) === 0 || (!keyAlt && !HitEnemy)) YVel++;
        if (YVel >= 0) {
          YVel = 0;
          Status = stFalling;
        }
      } else {
        Ch = 0;
        if (inRange(Mo, 0, (W >> 1) - 1)) {
          if (holdOrHidden(NewCh1)) {
            Ch = NewCh1;
            NewX2 = NewX1;
          } else Ch = NewCh2;
        } else if (inRange(Mo, W >> 1, W - 1)) {
          Ch = NewCh2;
          if (!holdOrHidden(Ch)) {
            Ch = NewCh1;
            NewX2 = NewX1;
          }
        }
        if (Ch === ch('=')) E.cdHit = 1;
        else if (Ch === ch('0') || Ch === ch('1')) {
          if (keyUp) CheckPipeAbove(NewCh1, NewCh2);
        } else if (Ch === ch('?') || Ch === ch('$') || Ch === ch('J') || Ch === ch('K')) {
          Mo = 0;
          const above = WorldMap.get(NewX2, NewY - 1);
          if (inRange(above, 0xE0, 0xE2)) {
            WorldMap.set(NewX2, NewY, ch('?'));
            Ch = ch('?');
          } else if (above === 0xEF) {
            WorldMap.set(NewX2, NewY, ch('K'));
            Ch = ch('K');
          } else if (!Small && Ch === ch('J')) {
            BreakBlock(NewX2, NewY);
            AddScore(10);
            Mo = 1;
          }
          if (Mo === 0) {
            BumpBlock(NewX2 * W, NewY * H);
            Beep(110);
          }
          const a = WorldMap.get(NewX2, NewY - 1);
          if (a === 0x20 || inRange(a, 0xE3, 0xEC)) {
            if (Ch !== ch('J') && Ch !== ch('K')) {
              HitCoin(NewX2 * W, NewY * H, true);
              if (WorldMap.get(NewX2, NewY - 1) !== 0x20) {
                WorldMap.set(NewX2, NewY - 1, (WorldMap.get(NewX2, NewY - 1) + 1) & 0xFF);
                if (WorldMap.get(NewX2, NewY) === ch('$')) {
                  Remove(NewX2 * W, NewY * H, W, H, 2);
                  WorldMap.set(NewX2, NewY, ch('?'));
                }
              }
            }
          } else if (a === 0xE0) {
            if (mode() === mdSmall) NewEnemy(tpRisingChamp, 0, NewX2, NewY, 0, -1, 2);
            else NewEnemy(tpRisingFlower, 0, NewX2, NewY, 0, -1, 2);
          } else if (a === 0xE1) NewEnemy(tpRisingLife, 0, NewX2, NewY, 0, -1, 2);
          else if (a === 0xE2) NewEnemy(tpRisingStar, 0, NewX2, NewY, 0, -1, 1);
          else if (a === ch('*')) HitCoin(NewX2 * W, (NewY - 1) * H, false);
          else if (a === 0xED) NewEnemy(tpRisingChamp, 1, NewX2, NewY, 0, -1, 2);
          HitAbove(NewX2, NewY - 1);
          if (Ch === ch('K')) {
            Remove(NewX2 * W, NewY * H, W, H, tpNote);
            WorldMap.set(NewX2, NewY, ch('K'));
          } else if (Ch !== ch('J')) {
            if (!inRange(WorldMap.get(NewX2, NewY - 1), 0xE3, 0xEC)) {
              Remove(NewX2 * W, NewY * H, W, H, 1);
              WorldMap.set(NewX2, NewY, ch('@'));
            }
          }
        } else Beep(30);
        if (Ch !== ch('J') || mode() === mdSmall) {
          YVel = 0;
          Status = stFalling;
        }
        if (Ch === ch('K')) YVel = 3;
      }
      break;
    }
  }
}

export function MovePlayer() {
  if (PL.InPipe) {
    if (WorldMap.get(PL.MapX, PL.MapY + 1) === ch('0')) StartDemo(dmUpOutOfPipe);
    else if (WorldMap.get(PL.MapX, PL.MapY - 1) === ch('0')) StartDemo(dmDownOutOfPipe);
    return;
  }
  const d = B.Data;
  const p = B.Player;

  if (E.cdChamp !== 0) {
    if (d.Mode[p] === mdSmall) {
      d.Mode[p] = mdLarge;
      PL.Growing = true;
      GrowCounter = 0;
    }
    StartMusic(GrowMusic);
    E.cdChamp = 0;
  }
  if (E.cdLife !== 0) {
    E.cdLife = 0;
    AddLife();
  }
  if (E.cdFlower !== 0) {
    d.Mode[p] = mdFire;
    Fired = true;
    FireCounter = 0;
    StartMusic(GrowMusic);
    PL.Growing = true;
    GrowCounter = 0;
    E.cdFlower = 0;
  }
  if (!PL.Blinking && !E.Star && !PL.Growing) {
    if (E.cdHit !== 0) {
      switch (d.Mode[p]) {
        case mdSmall:
          vibrate([70, 50, 140]);
          BlinkCounter = 0;
          PL.Blinking = true;
          StartDemo(dmDead);
          StartMusic(DeadMusic);
          return;
        case mdLarge:
        case mdFire:
          vibrate(90);
          d.Mode[p] = mdSmall;
          BlinkCounter = 0;
          PL.Blinking = true;
          StartMusic(HitMusic);
          break;
      }
      E.cdHit = 0;
    }
  } else E.cdHit = 0;

  if (PL.Blinking) {
    BlinkCounter++;
    if (BlinkCounter >= BlinkTime) PL.Blinking = false;
  }

  if (E.cdStar !== 0) {
    StartMusic(StarMusic);
    StarCounter = 0;
    E.Star = true;
  }

  if (E.Star) {
    StarCounter++;
    if (StarCounter >= StarTime) E.Star = false;
    if (StarCounter % 3 === 0)
      StartGlitter(X, Y + 11 * byte(d.Mode[p] === mdSmall), W,
        H + 3 + 11 * byte(d.Mode[p] !== mdSmall));
    E.cdStar = 0;
  }

  if (PL.Growing) {
    GrowCounter++;
    if (GrowCounter > GrowTime) PL.Growing = false;
  }

  Counter = (Counter + 1) & 0xFF;
  if (XVel === 0 && YVel === 0) Counter = 0;
  const CheckX = Counter % Slip === 0;

  let OldDir = Direction;
  let OldXVel = XVel;

  const LastKeyLeft = keyLeft;
  const LastKeyRight = keyRight;

  if (B.Versus && B.Player === 1) {
    // Player 2: its own keys / touch controls and the second gamepad
    ReadJoystick(1);
    const k = KB.p2Keys();
    keyLeft = k.left || J.jsLeft;
    keyRight = k.right || J.jsRight;
    keyUp = k.up || J.jsUp;
    keyDown = k.down || J.jsDown;
    keyAlt = k.jump || J.jsButton1;
    keyCtrl = k.run || J.jsButton2;
    keySpace = k.fire || J.jsButton2;
  } else {
    // In VERSUS player 1 uses only the first gamepad
    ReadJoystick(B.Versus ? 0 : -1);
    keyLeft = KB.kbLeft() || J.jsLeft;
    keyRight = KB.kbRight() || J.jsRight;
    // The recorded demo (DEMOKEYS.OBJ) was made with an earlier build that
    // polled Left/Right twice per frame (all their counts are even and add up
    // to twice the other keys). Reading them twice during playback makes the
    // demo replay exactly as recorded instead of Mario dying after 6 seconds.
    if (KB.PlayingMacro()) {
      keyLeft = KB.kbLeft() || J.jsLeft;
      keyRight = KB.kbRight() || J.jsRight;
    }
    keyUp = KB.kbUp() || J.jsUp;
    keyDown = KB.kbDown() || J.jsDown;
    keyAlt = KB.kbAlt() || J.jsButton1;
    keyCtrl = KB.kbCtrl() || J.jsButton2;
    keySpace = KB.kbSpace() || J.jsButton2;
  }

  if (keyRight && !LastKeyRight && Direction === dirLeft) {
    OldDir = dirRight;
    OldXVel = -XVel;
  }
  if (keyLeft && !LastKeyLeft && Direction === dirRight) {
    OldDir = dirLeft;
    OldXVel = -XVel;
  }

  if (Fired && !keySpace) Fired = false;

  if (keySpace && !Fired && d.Mode[p] === mdFire) {
    FireCounter = 0;
    NewEnemy(tpFireBall, 0, Math.trunc(X / W) + Direction, Math.trunc((Y + H) / H),
      10 * (-1 + 2 * Direction), 3 + 3 * (byte(keyDown) - byte(keyUp)), 2);
    Fired = true;
  }

  if (E.cdLift !== 0) {
    Y = E.PlayerY1;
    XVel = E.PlayerXVel;
    YVel = E.PlayerYVel;
    Status = stOnTheGround;
  }
  if (E.cdStopJump !== 0) {
    Jumped = true;
    E.cdStopJump = 0;
  }

  if (Jumped && !keyAlt) Jumped = false;

  const MaxSpeed = MAX_SPEED - 1 + byte(keyCtrl) + byte(E.Turbo) + Math.abs(E.cdLift * E.PlayerXVel);
  const MinSpeed = -MAX_SPEED + 1 - byte(keyCtrl) - byte(E.Turbo) - Math.abs(E.cdLift * E.PlayerXVel);

  if (keyLeft) {
    if (XVel > MinSpeed) {
      if (CheckX || E.cdLift !== 0) XVel -= 1 + byte(E.cdLift !== 0 && keyCtrl);
    } else XVel = MinSpeed;
    Direction = byte(XVel > 0);
    if (X + XVel < 0) XVel = -X;
  } else if (XVel < 0 && CheckX && E.cdLift === 0) XVel++;

  if (keyRight) {
    if (XVel < MaxSpeed) {
      if (CheckX || E.cdLift !== 0) XVel += 1 + byte(E.cdLift !== 0 && keyCtrl);
    } else XVel = MaxSpeed;
    Direction = byte(XVel >= 0);
  } else if (XVel > 0 && CheckX && E.cdLift === 0) XVel--;

  if (keyLeft && keyRight) {
    Direction = OldDir;
    XVel = OldXVel;
  }

  if (Y + YVel >= NV * H) {
    PlayerDown();
    StartMusic(DeadMusic);
  }

  if (Status === stOnTheGround) HitEnemy = false;

  Check();

  if (Status === stOnTheGround && YVel === 0) {
    if (XVel === 0 || (E.cdLift !== 0 && XVel === E.PlayerXVel)) {
      WalkingMode = 0;
      WalkCount = 0;
    } else {
      WalkCount = (WalkCount + 1) & 0xF;
      WalkingMode = byte(WalkCount < 8);
    }
  } else WalkingMode = YVel < 0 ? 2 : 3;

  if (keyDown) CheckPipeBelow();

  X += XVel;
  Y += YVel;

  if (B.Versus) {
    // the camera follows both players (versus.js)
    if (X < 0) X = 0;
  } else {
    const OldXView = B.XView;
    B.XView = B.XView - byte(KB.kbLeftShift()) + byte(KB.kbRightShift());
    if (X + W + SCROLL_AT > B.XView + 320) B.XView = X + W + SCROLL_AT - 320;
    if (X < B.XView + SCROLL_AT) B.XView = X - SCROLL_AT;
    if (B.XView - OldXView > MAX_SPEED + byte(E.Turbo)) B.XView = OldXView + MAX_SPEED + byte(E.Turbo);
    if (B.XView - OldXView < -MAX_SPEED - byte(E.Turbo)) B.XView = OldXView - MAX_SPEED - byte(E.Turbo);
    if (B.XView < 0) {
      B.XView = 0;
      if (X < 0) X = 0;
    }

    if (B.XView > (B.Options.XSize - 16) * W) B.XView = (B.Options.XSize - 16) * W;
    if (ViewLocked(B.XView, OldXView, E.PlayerY1)) B.XView = OldXView;
  }

  E.PlayerX1 = X + XVel;
  E.PlayerX2 = E.PlayerX1 + W - 1;
  E.PlayerY1 = d.Mode[p] === mdSmall ? Y + H : Y;
  E.PlayerY2 = Y + 2 * H - 1;
  E.PlayerXVel = XVel;
  E.PlayerYVel = YVel;

  if (E.cdLift !== 0) {
    E.PlayerYVel += 2 - YVel;
    E.cdLift = 0;
  }
}

