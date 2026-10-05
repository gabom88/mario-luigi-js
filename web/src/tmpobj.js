// Port of TMPOBJ.PAS: short-lived objects (brick parts, coins, hit marks)
// and delayed block removal.

import * as VGA from './vga256.js';
import { B, W, H, NH, NV, WorldMap, AddScore, Beep, dataSlot } from './buffers.js';
import { DrawBackGrBlock } from './backgr.js';
import { CoinGlitter } from './glitter.js';
import { ReColor } from './figures.js';
import { StartMusic, LifeMusic } from './music.js';
import { RAW } from './data.js';
import { vibrate } from './extras.js';

export const tpBroken = 1;
export const tpCoin = 2;
export const tpHit = 3;
export const tpFire = 4;
export const tpNote = 5;

const BrokenDelay = 3;
const CoinSpeed = -4;
const CoinDelay = 12;
const MaxCoinYVel = 6;
const HitTime = 4;

// (original: 20 and 10) more room for levels made with the editor
const MaxTempObj = 60;
const MaxRemove = 40;

const TempObj = Array.from({ length: MaxTempObj + 1 }, () => ({
  Alive: false,
  Visible: [false, false],
  Tp: 0,
  BackGrAddr: [0, 0],
  XPos: 0, YPos: 0, HSize: 0, VSize: 0, XVel: 0, YVel: 0, DelayCounter: 0,
  OldX: [0, 0], OldY: [0, 0],
}));

const RemList = Array.from({ length: MaxRemove + 2 }, () => ({
  Active: false, RemCount: 0, RemX: 0, RemY: 0, RemW: 0, RemH: 0, NewImage: 0,
}));

export function InitTempObj() {
  for (let i = 1; i <= MaxTempObj; i++) {
    TempObj[i].Alive = false;
    TempObj[i].Visible[0] = false;
    TempObj[i].Visible[1] = false;
  }
  for (let i = 1; i <= MaxRemove; i++) RemList[i].Active = false;
  ReColor(RAW.PART000, RAW.PART000, B.Options.BrickColor);
}

function ReadBackGr(i) {
  const t = TempObj[i];
  const page = VGA.CurrentPage();
  t.BackGrAddr[page] = VGA.PushBackGr(t.XPos, t.YPos, t.HSize + 4, t.VSize);
  t.OldX[page] = t.XPos;
  t.OldY[page] = t.YPos;
}

function Available(i) {
  const t = TempObj[i];
  if (!t) return false;
  return !(t.Alive || t.Visible[0] || t.Visible[1]);
}

export function NewTempObj(NewType, X, Y, XV, YV, Wid, Ht) {
  if (NewType === tpBroken) {
    if (XV > 0) {
      if (X + 32 * XV > B.XView + NH * W + 2 * W) return;
    } else if (X + 32 * XV + 2 * W < B.XView) return;
  }
  let i = 1;
  while (!Available(i) && i <= MaxTempObj) i++;
  if (i <= MaxTempObj) {
    const t = TempObj[i];
    t.Alive = true;
    t.Visible[0] = false;
    t.Visible[1] = false;
    t.Tp = NewType;
    t.XPos = X;
    t.YPos = Y;
    t.XVel = XV;
    t.YVel = YV;
    t.HSize = Wid;
    t.VSize = Ht;
    ReadBackGr(i);
    t.DelayCounter = 0;
  }
}

export function ShowTempObj() {
  for (let i = 1; i <= MaxTempObj; i++) {
    const t = TempObj[i];
    if (t.Alive) {
      ReadBackGr(i);
      switch (t.Tp) {
        case tpBroken: VGA.DrawImage(t.XPos, t.YPos, t.HSize, t.VSize, RAW.PART000); break;
        case tpCoin: VGA.DrawImage(t.XPos, t.YPos, t.HSize, t.VSize, RAW.COIN000); break;
        case tpHit: VGA.DrawImage(t.XPos, t.YPos, t.HSize, t.VSize, RAW.WHHIT000); break;
        case tpFire: VGA.DrawImage(t.XPos, t.YPos, t.HSize, t.VSize, RAW.WHFIRE000); break;
        case tpNote: VGA.DrawImage(t.XPos, t.YPos, t.HSize, t.VSize, RAW.NOTE000); break;
      }
      t.Visible[VGA.CurrentPage()] = true;
    }
  }
}

export function HideTempObj() {
  const page = VGA.CurrentPage();
  for (let i = MaxTempObj; i >= 1; i--) {
    const t = TempObj[i];
    if (t.Visible[page]) {
      VGA.PopBackGr(t.BackGrAddr[page]);
      t.Visible[page] = false;
    }
  }
}

export function MoveTempObj() {
  for (let i = 1; i <= MaxTempObj; i++) {
    const t = TempObj[i];
    if (!t.Alive) continue;
    switch (t.Tp) {
      case tpBroken:
        t.DelayCounter++;
        if (t.DelayCounter > BrokenDelay) {
          t.DelayCounter = 0;
          t.YVel++;
          if (t.YPos > NV * H) t.Alive = false;
        }
        break;
      case tpCoin:
        t.DelayCounter++;
        if (t.DelayCounter > CoinDelay) {
          t.YVel++;
          if (t.YVel > MaxCoinYVel) {
            t.Alive = false;
            CoinGlitter(t.XPos + t.XVel, t.YPos + t.YVel);
          }
        }
        break;
      case tpHit:
      case tpFire:
        t.DelayCounter++;
        if (t.DelayCounter > HitTime) t.Alive = false;
        break;
    }
    t.XPos += t.XVel;
    t.YPos += t.YVel;
  }
}

export function Remove(X, Y, Wd, Ht, NewImg) {
  if (Y < 0) return;
  let i = 1;
  while (RemList[i].Active && i <= MaxRemove) i++;
  if (i <= MaxRemove) {
    const r = RemList[i];
    r.RemX = X;
    r.RemY = Y;
    r.RemW = Wd;
    r.RemH = Ht;
    r.NewImage = NewImg;
    r.RemCount = VGA.MAX_PAGE + 1;
    r.Active = true;
  }
}

export function RunRemove() {
  for (let i = 1; i <= MaxRemove; i++) {
    const r = RemList[i];
    if (!r.Active) continue;
    switch (r.NewImage) {
      case 0: DrawBackGrBlock(r.RemX, r.RemY, r.RemW, r.RemH); break;
      case 1: VGA.DrawImage(r.RemX, r.RemY, r.RemW, r.RemH, RAW.QUEST001); break;
      case 2: VGA.DrawImage(r.RemX, r.RemY, r.RemW, r.RemH, RAW.QUEST000); break;
      case 5: VGA.DrawImage(r.RemX, r.RemY, r.RemW, r.RemH, RAW.NOTE000); break;
    }
    r.RemCount--;
    if (r.RemCount < 1) r.Active = false;
  }
}

export function BreakBlock(X, Y) {
  WorldMap.set(X, Y, 0x20);
  X = X * W;
  Y = Y * H;
  Remove(X, Y, W, H, 0);
  const X1 = X;
  const X2 = X + (W >> 1);
  const Y1 = Y;
  const Y2 = Y + (H >> 1);
  NewTempObj(tpBroken, X1, Y1, -2, -6, 12, H >> 1);
  NewTempObj(tpBroken, X2, Y1, 2, -6, 12, H >> 1);
  NewTempObj(tpBroken, X1, Y2, -2, -4, 12, H >> 1);
  NewTempObj(tpBroken, X2, Y2, 2, -4, 12, H >> 1);
  Beep(110);
  vibrate(25);
}

export function HitCoin(X, Y, ThrowUp) {
  const MapX = Math.trunc(X / W);
  const MapY = Math.trunc(Y / H);
  if (WorldMap.get(MapX, MapY) === 0x20) return;
  if (ThrowUp) NewTempObj(tpCoin, X, Y - H, 0, CoinSpeed, W, H);
  else {
    WorldMap.set(MapX, MapY, 0x20);
    Remove(X, Y, W, H, 0);
    CoinGlitter(X, Y);
  }
  Beep(2420);
  const d = B.Data;
  d.Coins[dataSlot()]++;
  AddScore(50);
  if (d.Coins[dataSlot()] % 100 === 0) {
    AddLife();
    d.Coins[dataSlot()] = 0;
  }
}

export function AddLife() {
  B.Data.Lives[dataSlot()]++;
  StartMusic(LifeMusic);
}
