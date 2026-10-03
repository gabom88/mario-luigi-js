// Port of ENEMIES.PAS: enemies, power-ups, fire balls and lifts.

import * as VGA from './vga256.js';
import {
  B, W, H, NH, NV, EY1, WorldMap, canHoldYou, canStandOn, AddScore, Beep, mdSmall,
} from './buffers.js';
import { Mirror, mirrorPlanar } from './figures.js';
import { NewGlitter, NewStar, CoinGlitter, StartGlitter } from './glitter.js';
import { NewTempObj, tpHit, tpFire, BreakBlock, HitCoin, Remove } from './tmpobj.js';
import { StartMusic, FireMusic } from './music.js';
import { RAW } from './data.js';
import { ch, random, byte } from './pascal.js';

export const StartEnemiesAt = 2;
export const ForgetEnemiesAt = 5;

export const tpDead = 0;
export const tpDying = 1;
export const tpChibibo = 2;
export const tpFlatChibibo = 3;
export const tpDeadChibibo = 4;
export const tpRisingChamp = 5;
export const tpChamp = 6;
export const tpRisingLife = 7;
export const tpLife = 8;
export const tpRisingFlower = 9;
export const tpFlower = 10;
export const tpRisingStar = 11;
export const tpStar = 12;
export const tpFireBall = 13;
export const tpDyingFireBall = 14;
export const tpVertFish = 15;
export const tpDeadVertFish = 16;
export const tpVertFireBall = 17;
export const tpVertPlant = 18;
export const tpDeadVertPlant = 19;
export const tpRed = 20;
export const tpDeadRed = 21;

export const tpKoopa = 50;
export const tpSleepingKoopa = 51;
export const tpWakingKoopa = 52;
export const tpRunningKoopa = 53;
export const tpDyingKoopa = 54;
export const tpDeadKoopa = 55;

export const tpLiftStart = 60;
export const tpBlockLift = 60;
export const tpDonut = 61;
export const tpLiftEnd = 69;

const Left = 0;
const Right = 1;
const kGreen = 0;
const kRed = 1;

// Shared with the player unit
export const E = {
  Turbo: false,
  cdChamp: 0,
  cdLife: 0,
  cdFlower: 0,
  cdStar: 0,
  cdEnemy: 0,
  cdHit: 0,
  cdLift: 0,
  cdStopJump: 0,
  PlayerX1: 0,
  PlayerY1: 0,
  PlayerX2: 0,
  PlayerY2: 0,
  PlayerXVel: 0,
  PlayerYVel: 0,
  Star: false,
};

const rKoopa = [0, 1, 2, 3].map(() => new Uint8Array(20 * 24 + 1));
const FireBallList = [RAW.F000, RAW.F001, RAW.F002, RAW.F003];
const KoopaList = [
  [[RAW.GRKOOPA000, RAW.GRKOOPA001], [RAW.RDKOOPA000, RAW.RDKOOPA001]],
  [[rKoopa[0], rKoopa[1]], [rKoopa[2], rKoopa[3]]],
];

const Grounded = 0;
const Falling = 1;

const MaxEnemies = 11;
// The original allowed 25 enemies at once; editor levels may have many more
const MaxEnemiesAtOnce = 150;

const newImage = () => new Uint8Array(W * H);
const EnemyPictures = Array.from({ length: MaxEnemies + 1 }, () => [newImage(), newImage()]);

const Enemy = Array.from({ length: MaxEnemiesAtOnce + 1 }, () => ({
  Tp: 0, SubTp: 0, XPos: 0, YPos: 0, LastXPos: 0, LastYPos: 0, MapX: 0, MapY: 0,
  XVel: 0, YVel: 0, MoveDelay: 0, DelayCounter: 0, Counter: 0, Status: 0,
  DirCounter: 0, BackGrAddr: [0xFFFF, 0xFFFF],
}));

// ActiveEnemies: string[MaxEnemiesAtOnce] of enemy indexes
let ActiveEnemies = [];
let TimeCounter = 0;

const isKoopa = (t) => t >= tpKoopa && t <= tpRunningKoopa;
const isLift = (t) => t >= tpLiftStart && t <= tpLiftEnd;

function Kill(i) {
  const e = Enemy[i];
  const dir = () => -1 + 2 * byte((e.XPos + e.XVel) % W > (W >> 1));
  switch (e.Tp) {
    case tpChibibo:
      e.Tp = tpDeadChibibo;
      e.XVel = dir();
      e.YVel = -4;
      e.MoveDelay = 0;
      e.DelayCounter = 0;
      AddScore(100);
      break;
    case tpRed:
      e.Tp = tpDeadRed;
      e.XVel = dir();
      e.YVel = -4;
      e.MoveDelay = 0;
      e.DelayCounter = 0;
      AddScore(100);
      break;
    case tpKoopa: case tpSleepingKoopa: case tpWakingKoopa: case tpRunningKoopa:
      e.Tp = tpDeadKoopa;
      e.XVel = dir();
      e.YVel = -4;
      e.MoveDelay = 0;
      e.DelayCounter = 0;
      AddScore(100);
      break;
    case tpVertFish:
      e.Tp = tpDeadVertFish;
      e.XVel = 0;
      e.YVel = 0;
      e.MoveDelay = 2;
      e.DelayCounter = 0;
      e.Status = Falling;
      AddScore(100);
      break;
    case tpVertPlant:
      e.Tp = tpDeadVertPlant;
      e.DelayCounter = 0;
      e.YVel = 0;
      AddScore(100);
      break;
  }
}

function ShowStar(X, Y) {
  Beep(100);
  if (X + W > B.XView && X < B.XView + VGA.SCREEN_WIDTH) NewTempObj(tpHit, X, Y, 0, 0, W, H);
}

function ShowFire(X, Y) {
  Beep(50);
  X -= 4;
  Y -= 4;
  if (X + W > B.XView && X < B.XView + VGA.SCREEN_WIDTH) NewTempObj(tpFire, X, Y, 0, 0, W, H);
}

export function InitEnemyFigures() {
  EnemyPictures[1][Right].set(RAW.CHIBIBO000);
  EnemyPictures[2][Right].set(RAW.CHIBIBO001);
  EnemyPictures[4][Right].set(RAW.CHIBIBO002);
  EnemyPictures[5][Right].set(RAW.CHIBIBO003);

  EnemyPictures[3][Left].set(RAW.FISH001);
  Mirror(EnemyPictures[3][Left], EnemyPictures[3][Right]);

  EnemyPictures[6][Left].set(RAW.RED000);
  EnemyPictures[7][Left].set(RAW.RED001);

  EnemyPictures[8][Right].set(RAW.GRKP000);
  EnemyPictures[9][Right].set(RAW.GRKP001);

  EnemyPictures[10][Right].set(RAW.RDKP000);
  EnemyPictures[11][Right].set(RAW.RDKP001);

  for (let i = 1; i <= MaxEnemies; i++) {
    if (i === 6 || i === 7) Mirror(EnemyPictures[i][Left], EnemyPictures[i][Right]);
    else if (i !== 3) Mirror(EnemyPictures[i][Right], EnemyPictures[i][Left]);
  }

  for (let i = 0; i <= 1; i++)
    for (let j = kGreen; j <= kRed; j++)
      mirrorPlanar(KoopaList[Left][j][i], KoopaList[Right][j][i], 20, 24);
}

export function ClearEnemies() {
  for (let i = 1; i <= MaxEnemiesAtOnce; i++) Enemy[i].Tp = tpDead;
  ActiveEnemies = [];
  E.cdChamp = 0;
  E.cdLife = 0;
  E.cdFlower = 0;
  E.cdStar = 0;
  E.cdEnemy = 0;
  E.cdHit = 0;
  E.cdLift = 0;
  E.cdStopJump = 0;
}

// Puts an enemy back in the map so it can be started again later.
function putBack(e) {
  switch (e.Tp) {
    case tpChibibo: WorldMap.set(e.MapX, e.MapY, 0x80); break;
    case tpVertFish: WorldMap.set(e.MapX, e.MapY - 2, 0x81); break;
    case tpVertFireBall: WorldMap.set(e.MapX, e.MapY - 2, 0x82); break;
    case tpVertPlant: WorldMap.set(e.MapX, e.MapY - 2, (0x84 + e.SubTp) & 0xFF); break;
    case tpRed: WorldMap.set(e.MapX, e.MapY, 0x87); break;
    case tpBlockLift: WorldMap.set(e.MapX, e.MapY, 0xB0); break;
    case tpDonut: WorldMap.set(e.MapX, e.MapY, 0xB1); break;
    default:
      if (isKoopa(e.Tp)) WorldMap.set(e.MapX, e.MapY, (0x88 + e.SubTp) & 0xFF);
  }
}

export function StopEnemies() {
  const n = ActiveEnemies.length;
  for (let i = 1; i <= n; i++) putBack(Enemy[ActiveEnemies[i - 1]]);
  ClearEnemies();
}

export function NewEnemy(InitType, SubType, InitX, InitY, InitXVel, InitYVel, InitDelay) {
  if (E.Turbo) {
    InitXVel *= 2;
    InitYVel *= 2;
    InitDelay = Math.trunc(InitDelay / 2);
  }
  if (InitType === tpFireBall) {
    let j = 0;
    for (const k of ActiveEnemies) if (Enemy[k].Tp === tpFireBall) j++;
    if (j >= 2) return;
    StartMusic(FireMusic);
  }

  let i = 1;
  while (Enemy[i].Tp !== tpDead) {
    if (i < MaxEnemiesAtOnce) i++;
    else return;
  }
  const e = Enemy[i];
  e.Tp = InitType;
  e.SubTp = SubType;
  e.MapX = InitX;
  e.MapY = InitY;
  e.XPos = e.MapX * W;
  e.YPos = e.MapY * H;
  e.XVel = InitXVel;
  e.YVel = InitYVel;
  e.MoveDelay = InitDelay;
  e.DelayCounter = 0;
  e.DirCounter = 0;
  e.Status = Grounded;
  e.BackGrAddr[0] = 0xFFFF;
  e.BackGrAddr[1] = 0xFFFF;
  e.Counter = 0;
  switch (e.Tp) {
    case tpVertPlant:
      e.XPos += 8;
      e.Status = 0;
      break;
    case tpFireBall:
      e.XPos = e.XVel > 0 ? E.PlayerX2 : E.PlayerX1;
      break;
  }
  e.LastXPos = e.XPos;
  e.LastYPos = e.YPos;
  if (ActiveEnemies.length < MaxEnemiesAtOnce) ActiveEnemies.push(i);
}

export function ShowEnemies() {
  const page = VGA.CurrentPage();
  const n = ActiveEnemies.length;
  for (let i = 1; i <= n; i++) {
    const e = Enemy[ActiveEnemies[i - 1]];
    if (e.XPos + 1 * W < B.XView
      || e.XPos > B.XView + VGA.SCREEN_WIDTH + 0 * W
      || e.YPos >= B.YView + VGA.SCREEN_HEIGHT) {
      e.BackGrAddr[page] = 0xFFFF;
      continue;
    }
    if (e.Tp === tpFireBall || e.Tp === tpDyingFireBall)
      e.BackGrAddr[page] = VGA.PushBackGr(e.XPos, e.YPos, W, H >> 1);
    else if (e.Tp === tpVertPlant || e.Tp === tpDeadVertPlant)
      e.BackGrAddr[page] = VGA.PushBackGr(e.XPos, e.YPos, 24, 20);
    else if (e.Tp >= tpKoopa && e.Tp <= tpDeadKoopa)
      e.BackGrAddr[page] = VGA.PushBackGr(e.XPos, e.YPos - 10, 24, 24);
    else
      e.BackGrAddr[page] = VGA.PushBackGr(e.XPos, e.YPos, W + 4, H);

    const { XPos, YPos } = e;
    const dc16 = byte(e.DirCounter % 16 <= 8);
    switch (e.Tp) {
      case tpChibibo:
        VGA.DrawImage(XPos, YPos, W, H, EnemyPictures[1 + 3 * e.SubTp][byte(e.DirCounter % 32 < 16)]);
        break;
      case tpFlatChibibo:
        VGA.DrawImage(XPos, YPos, W, H, EnemyPictures[2 + 3 * e.SubTp][byte(e.DirCounter % 32 < 16)]);
        break;
      case tpDeadChibibo:
        VGA.UpSideDown(XPos, YPos, W, H, EnemyPictures[1][Left]);
        break;
      case tpRisingChamp:
        if (YPos !== e.MapY * H)
          VGA.DrawPart(XPos, YPos, W, H, 0, H - (YPos % H) - 1, e.SubTp === 0 ? RAW.CHAMP000 : RAW.POISON000);
        break;
      case tpChamp:
        VGA.DrawImage(XPos, YPos, W, H, e.SubTp === 0 ? RAW.CHAMP000 : RAW.POISON000);
        break;
      case tpRisingLife:
        if (YPos !== e.MapY * H) VGA.DrawPart(XPos, YPos, W, H, 0, H - (YPos % H) - 1, RAW.LIFE000);
        break;
      case tpLife:
        VGA.DrawImage(XPos, YPos, W, H, RAW.LIFE000);
        break;
      case tpRisingFlower:
        if (YPos !== e.MapY * H) VGA.DrawPart(XPos, YPos, W, H, 0, H - (YPos % H) - 1, RAW.FLOWER000);
        break;
      case tpFlower:
        VGA.DrawImage(XPos, YPos, W, H, RAW.FLOWER000);
        break;
      case tpRisingStar:
        if (YPos !== e.MapY * H) VGA.DrawPart(XPos, YPos, W, H, 0, H - (YPos % H) - 1, RAW.STAR000);
        break;
      case tpStar:
        VGA.DrawImage(XPos, YPos, W, H, RAW.STAR000);
        break;
      case tpFireBall:
        VGA.DrawImage(XPos, YPos, 12, H >> 1, XPos % 4 < 2 ? RAW.FIRE000 : RAW.FIRE001);
        break;
      case tpVertFish:
        if (e.YVel !== 0 || YPos < NV * H - H)
          VGA.DrawImage(XPos, YPos, W, H, EnemyPictures[3][byte(E.PlayerX1 > XPos)]);
        break;
      case tpDeadVertFish:
        if (YPos < NV * H - H || e.YVel !== 0)
          VGA.UpSideDown(XPos, YPos, W, H, EnemyPictures[3][byte(E.PlayerX1 <= XPos)]);
        break;
      case tpVertFireBall:
        if (Math.abs(e.DelayCounter - e.MoveDelay) <= 1) {
          VGA.DrawImage(XPos, YPos, W, H, FireBallList[random(4)]);
          NewGlitter(XPos + random(W), YPos + random(H), 57 + random(7), 14 + random(20));
          NewStar(XPos + random(W), YPos + random(H), 57 + random(7), 14 + random(20));
        }
        break;
      case tpVertPlant: {
        let Fig;
        if (TimeCounter % 32 < 16) Fig = e.SubTp <= 1 ? RAW.PPLANT002 : RAW.PPLANT000;
        else Fig = e.SubTp <= 1 ? RAW.PPLANT003 : RAW.PPLANT001;
        VGA.DrawPart(XPos, YPos, 24, 20, 0, e.MapY * H - YPos - 1, Fig);
        break;
      }
      case tpDeadVertPlant:
        e.DelayCounter = 0;
        e.MoveDelay = 0;
        e.YVel = 0;
        e.Status++;
        if (e.Status < 12) VGA.DrawImage(XPos, YPos, 24, 20, RAW.HIT000);
        else if (e.Status > 14) e.Tp = tpDying;
        break;
      case tpRed:
        VGA.DrawImage(XPos, YPos, W, H, EnemyPictures[6 + dc16][byte(e.XVel > 0)]);
        break;
      case tpDeadRed:
        VGA.UpSideDown(XPos, YPos, W, H, EnemyPictures[6 + dc16][byte(e.XVel > 0)]);
        break;
      case tpKoopa:
        VGA.DrawImage(XPos, YPos - 10, W, 24, KoopaList[byte(e.XVel > 0)][e.SubTp][dc16]);
        break;
      case tpWakingKoopa:
      case tpRunningKoopa:
        VGA.DrawImage(XPos, YPos, W, H,
          EnemyPictures[8 + 2 * e.SubTp + 1 - dc16][byte(e.DirCounter % 32 <= 16)]);
        break;
      case tpSleepingKoopa:
        VGA.DrawImage(XPos, YPos, W, H, EnemyPictures[8 + 2 * e.SubTp][0]);
        break;
      case tpDeadKoopa:
        VGA.UpSideDown(XPos, YPos, W, H, EnemyPictures[8 + 2 * e.SubTp][dc16]);
        break;
      case tpBlockLift:
        VGA.DrawImage(XPos, YPos, W, H, RAW.LIFT1000);
        break;
      case tpDonut:
        if (e.Status === 0) {
          VGA.DrawImage(XPos, YPos, W, H, RAW.DONUT000);
          if (e.YVel === 0) e.Counter = 0;
        } else {
          VGA.DrawImage(XPos, YPos, W, H, RAW.DONUT001);
          e.Status--;
        }
        if (e.YVel > 0 && e.Counter % 24 === 0) e.YVel++;
        e.Counter++;
        break;
    }
  }
}

export function HideEnemies() {
  const page = VGA.CurrentPage();
  for (let i = ActiveEnemies.length; i >= 1; i--) {
    const e = Enemy[ActiveEnemies[i - 1]];
    if (e.BackGrAddr[page] !== 0xFFFF) VGA.PopBackGr(e.BackGrAddr[page]);
  }
}

function Check(i) {
  const Safe = EY1;
  const HSafe = H * Safe;
  const e = Enemy[i];
  let NewCh1, NewCh2, Ch, AtX, NewX, NewX1, NewX2, Y1, Y2, NewY, Hold1, Hold2;

  switch (e.Tp) {
    case tpRisingChamp: case tpRisingLife: case tpRisingFlower: case tpRisingStar:
      if (e.YPos % H === 0 && e.YPos !== e.MapY * H) {
        e.XVel = 1 - 2 * byte(canHoldYou(WorldMap.get(e.MapX + 1, e.MapY - 1)));
        switch (e.Tp) {
          case tpRisingChamp:
            e.Tp = tpChamp;
            break;
          case tpRisingLife:
            e.Tp = tpLife;
            e.XVel = 2 * e.XVel;
            break;
          case tpRisingFlower:
            e.XVel = 0;
            e.Tp = tpFlower;
            break;
          case tpRisingStar:
            e.Tp = tpStar;
            e.XVel = 2 * e.XVel;
            break;
        }
        e.YVel = -7;
        e.MoveDelay = 1;
        e.Status = Falling;
      } else {
        const j = e.YPos % H;
        if (j % 2 === 0) Beep(130 - 20 * j);
        return;
      }
      break;
    case tpFireBall: {
      AtX = Math.trunc((e.XPos + (W >> 2)) / W);
      NewX = Math.trunc((e.XPos + (W >> 2) + e.XVel) / W);
      if (AtX !== NewX || E.PlayerX1 % W === 0) {
        Y1 = Math.trunc((e.YPos + (H >> 2) + HSafe) / H) - Safe;
        NewCh1 = WorldMap.get(NewX, Y1);
        if (canHoldYou(NewCh1)) e.XVel = 0;
      }
      NewX = e.XPos;
      AtX = Math.trunc((e.XPos + (W >> 2) + e.XVel) / W);
      NewY = Math.trunc((e.YPos + 2 + (H >> 2) + e.YVel + HSafe) / H) - Safe;
      NewCh1 = WorldMap.get(AtX, NewY);
      if (e.YVel > 0 && (canHoldYou(NewCh1) || canStandOn(NewCh1))) {
        e.YPos = (Math.trunc((e.YPos + e.YVel - 5 + HSafe) / H) - Safe) * H;
        e.YVel = -2;
      } else if (e.XPos % 3 === 0) e.YVel++;
      if (e.XVel === 0
        || NewX < B.XView - W
        || NewX > B.XView + NH * W + W
        || NewY > NV * H) {
        e.DelayCounter = -(VGA.MAX_PAGE + 1);
        e.Tp = tpDyingFireBall;
      }
      return;
    }
    case tpStar:
      StartGlitter(e.XPos, e.YPos, W, H);
      break;
  }

  if (![tpVertFish, tpDeadVertFish, tpVertFireBall, tpVertPlant, tpDeadVertPlant].includes(e.Tp)) {
    const Side = byte(e.XVel > 0) * (W - 1);
    AtX = Math.trunc((e.XPos + Side) / W);
    NewX = Math.trunc((e.XPos + Side + e.XVel) / W);
    if (AtX !== NewX || e.Status === Falling) {
      Y1 = Math.trunc((e.YPos + HSafe) / H) - Safe;
      Y2 = Math.trunc((e.YPos + HSafe + H - 1) / H) - Safe;
      NewCh1 = WorldMap.get(NewX, Y1);
      NewCh2 = WorldMap.get(NewX, Y2);
      Hold1 = canHoldYou(NewCh1);
      Hold2 = canHoldYou(NewCh2);
      if (Hold1 || Hold2) {
        if (e.Tp === tpRunningKoopa) {
          ShowStar(e.XPos + e.XVel, e.YPos);
          const l = Math.trunc((e.YPos + HSafe + (H >> 1)) / H) - Safe;
          Ch = WorldMap.get(NewX, l);
          if (e.XPos >= B.XView && e.XPos + W <= B.XView + NH * W) {
            if (Ch === ch('J')) BreakBlock(NewX, l);
            else if (Ch === ch('?')) {
              switch (WorldMap.get(NewX, l - 1)) {
                case 0x20: HitCoin(NewX * W, l * H, true); break;
                case 0xE0:
                  if (B.Data.Mode[B.Player] === mdSmall) NewEnemy(tpRisingChamp, 0, NewX, l, 0, -1, 1);
                  else NewEnemy(tpRisingFlower, 0, NewX, l, 0, -1, 1);
                  break;
                case 0xE1: NewEnemy(tpRisingLife, 0, NewX, l, 0, -1, 2); break;
              }
              Remove(NewX * W, l * H, W, H, 1);
              WorldMap.set(NewX, l, ch('@'));
            }
          }
        }
        e.XVel = 0;
      }
    }

    AtX = Math.trunc((e.XPos + e.XVel) / W);
    NewX = Math.trunc((e.XPos + e.XVel + W - 1) / W);
    NewY = Math.trunc((e.YPos + 1 + H + e.YVel + HSafe) / H) - Safe;

    NewCh1 = WorldMap.get(AtX, NewY);
    NewCh2 = WorldMap.get(NewX, NewY);
    Hold1 = canHoldYou(NewCh1) || canStandOn(NewCh1);
    Hold2 = canHoldYou(NewCh2) || canStandOn(NewCh2);

    if (isLift(e.Tp)) {
      if (e.YVel !== 0 && e.Tp !== tpDonut) {
        if (e.YVel < 0) Hold1 = Math.trunc((e.YPos + e.YVel) / H) < e.MapY;
        if (Hold1) e.YVel = -e.YVel;
      }
    } else {
      switch (e.Status) {
        case Grounded:
          if (!(Hold1 || Hold2)) {
            e.Status = Falling;
            e.YVel = 1;
          }
          if (e.SubTp === 1 && e.Tp === tpKoopa) {
            const m = e.XPos % W;
            if (e.XVel > 0 && m >= 11 && m <= 19) if (!Hold2 && Hold1) e.XVel = 0;
            if (e.XVel < 0 && m >= 1 && m <= 9) if (!Hold1 && Hold2) e.XVel = 0;
          }
          break;
        case Falling:
          if (Hold1 || Hold2) {
            e.Status = Grounded;
            e.YPos = (Math.trunc((e.YPos + e.YVel + 1 + HSafe) / H) - Safe) * H;
            if (e.Tp === tpStar) {
              e.YVel = Math.trunc(-(5 * e.YVel) / 2);
              e.Status = Falling;
            } else e.YVel = 0;
          } else {
            e.YVel++;
            if (e.YVel > 4) e.YVel = 4;
          }
          break;
      }
    }
  }

  NewX1 = e.XPos + e.XVel;
  NewX2 = NewX1 + W - 1 + 4 * byte(e.Tp === tpVertPlant);
  Y1 = e.YPos + e.YVel;
  Y2 = Y1 + H - 1;

  if ([tpChibibo, tpFlatChibibo, tpVertFish, tpVertPlant, tpDeadVertPlant, tpRed].includes(e.Tp)
    || isKoopa(e.Tp)) {
    const n = ActiveEnemies.length;
    for (let k = 1; k <= n; k++) {
      const j = ActiveEnemies[k - 1];
      if (j === i) continue;
      const o = Enemy[j];
      if ([tpChibibo, tpFlatChibibo, tpRed].includes(o.Tp) || isKoopa(o.Tp)) {
        const X = o.XPos + o.XVel;
        const Y = o.YPos + o.YVel;
        if (NewX1 < X + W && NewX2 > X && Y1 < Y + H && Y2 > Y) {
          if (o.Tp === tpRunningKoopa) {
            ShowStar(e.XPos, e.YPos);
            if (e.Tp === tpRunningKoopa) {
              ShowStar(o.XPos, o.YPos);
              Kill(j);
            }
            Kill(i);
          } else if (e.Tp !== tpRunningKoopa) {
            e.XVel = -e.XVel;
            o.XVel = -o.XVel;
            e.YVel = -e.YVel;
            o.YVel = -o.YVel;
            if (Math.abs(X - NewX1) < W) {
              if (X > NewX1) {
                e.XPos -= e.XVel;
                e.XVel = -Math.abs(e.XVel);
              } else if (X < NewX1) {
                e.XPos -= e.XVel;
                e.XVel = Math.abs(e.XVel);
              }
            }
          }
        }
      } else if (o.Tp === tpFireBall) {
        const X = o.XPos + o.XVel;
        const Y = o.YPos + o.YVel;
        if (NewX1 <= X + (W >> 1) && NewX2 >= X && Y1 <= Y + (H >> 1) && Y2 >= Y) {
          o.Tp = tpDyingFireBall;
          o.DelayCounter = -(VGA.MAX_PAGE + 1);
          ShowStar(e.XPos, e.YPos);
          Kill(i);
        }
      }
    }
  }
}

export function MoveEnemies() {
  TimeCounter = (TimeCounter + 1) & 0xFF;
  let n = ActiveEnemies.length;
  for (let i = 1; i <= n; i++) {
    const j = ActiveEnemies[i - 1];
    const e = Enemy[j];
    e.DelayCounter++;
    const NewX = e.XPos + e.XVel;
    if (e.DelayCounter > e.MoveDelay) {
      e.XPos = e.LastXPos;
      e.YPos = e.LastYPos;
      e.DirCounter = (e.DirCounter + 1) & 0xFF;
      if (e.Tp === tpVertFish || e.Tp === tpVertFireBall || e.Tp === tpVertPlant) {
        if (e.Tp === tpVertPlant) {
          switch (e.Status) {
            case 0:
              switch (e.SubTp) {
                case 0:
                  if (e.XPos > E.PlayerX2 + W || e.XPos + 24 + W < E.PlayerX1) e.Status++;
                  break;
                case 1:
                  if (e.XPos > E.PlayerX2 || e.XPos + 24 < E.PlayerX1) e.Status++;
                  break;
                case 2:
                  e.Status++;
                  break;
              }
              e.YVel = 0;
              e.DelayCounter = 0;
              e.MoveDelay = 1;
              break;
            case 1:
              e.YVel = -1;
              e.DelayCounter = 0;
              e.MoveDelay = 2;
              if (e.YPos + e.YVel <= e.MapY * H - 19) {
                e.YVel = 0;
                e.DelayCounter = 0;
                e.MoveDelay = 2;
                e.Counter = 0;
                e.Status++;
              }
              break;
            case 2:
              e.Counter++;
              if (e.Counter > 200) e.Status++;
              e.MoveDelay = 0;
              e.DelayCounter = 0;
              break;
            case 3:
              e.YVel = 1;
              e.DelayCounter = 0;
              e.MoveDelay = 2;
              if (e.YPos > e.MapY * H) e.Status++;
              break;
            case 4:
              e.YVel = 0;
              e.MoveDelay = 100 + random(100);
              e.DelayCounter = 0;
              e.Status = 0;
              break;
          }
        } else if (e.YPos + H >= NV * H) {
          if (e.YVel > 0) {
            e.YVel = 0;
            e.MoveDelay = 100 + random(300);
            e.DelayCounter = 0;
          } else {
            e.YVel = -10;
            e.MoveDelay = 1;
            e.DelayCounter = 0;
            if (e.Tp === tpVertFireBall) {
              Beep(100);
              e.YVel = -9;
            }
          }
        }
      }
      if (e.Tp === tpSleepingKoopa) {
        e.Counter++;
        if (e.Counter > 150) {
          e.Tp = tpWakingKoopa;
          e.XVel = 1;
          e.Counter = 0;
        }
      }
      if (e.Tp === tpWakingKoopa) {
        e.XVel = -e.XVel;
        e.MoveDelay = 1;
        e.DelayCounter = 0;
        e.Counter++;
        if (e.Counter > 50) {
          e.Tp = tpKoopa;
          e.XVel = E.PlayerX1 > e.XPos ? 1 : -1;
        }
      }
      if (e.Tp === tpDying || e.Tp === tpDyingFireBall || e.Tp === tpDyingKoopa) {
        e.Tp = tpDead;
      } else if (e.Tp === tpFlatChibibo
        || NewX <= -W
        || NewX < B.XView - ForgetEnemiesAt * W
        || NewX > B.XView + NH * W + ForgetEnemiesAt * W
        || e.YPos + e.YVel > NV * H) {
        putBack(e);
        if (e.Tp === tpKoopa) e.Tp = tpDyingKoopa;
        else if (e.Tp !== tpFireBall) e.Tp = tpDying;
        else e.Tp = tpDyingFireBall;
        e.DelayCounter = -(VGA.MAX_PAGE + 1);
      } else {
        e.DelayCounter = 0;
        const OldXVel = e.XVel;
        if ([tpVertFish, tpDeadVertFish, tpVertFireBall, tpDeadVertPlant].includes(e.Tp)) {
          if (e.DirCounter % 3 === 0 && e.YPos + H < NV * H) e.YVel++;
        }
        if (e.Tp === tpDeadChibibo || e.Tp === tpDeadRed || e.Tp === tpDeadKoopa) {
          if (e.XPos % 6 === 0) e.YVel++;
        } else Check(j);
        e.XPos += e.XVel;
        e.YPos += e.YVel;
        if (e.XVel === 0) {
          e.XVel = -OldXVel;
          if (e.Tp === tpDyingFireBall) ShowFire(e.XPos, e.YPos);
        }
      }
      e.LastXPos = e.XPos;
      e.LastYPos = e.YPos;
    } else if (e.XVel !== 0 || e.YVel !== 0) {
      e.XPos = e.LastXPos + Math.trunc((e.DelayCounter * e.XVel) / (e.MoveDelay + 1));
      e.YPos = e.LastYPos + Math.trunc((e.DelayCounter * e.YVel) / (e.MoveDelay + 1));
    }
  }

  // Collisions with the player
  n = ActiveEnemies.length;
  for (let i = 1; i <= n; i++) {
    const j = ActiveEnemies[i - 1];
    const e = Enemy[j];
    const t = e.Tp;
    if (!([tpChibibo, tpChamp, tpLife, tpFlower, tpStar, tpVertFish, tpVertFireBall,
      tpVertPlant, tpRed].includes(t) || isKoopa(t) || isLift(t))) continue;
    if (!(E.PlayerX1 < e.XPos + W && E.PlayerX2 > e.XPos
      && E.PlayerY1 + E.PlayerYVel < e.YPos + H && E.PlayerY2 + E.PlayerYVel > e.YPos)) continue;

    if (E.Star && !isLift(e.Tp)) {
      Beep(800);
      Kill(j);
      E.cdHit = 1;
    }
    switch (e.Tp) {
      case tpSleepingKoopa:
      case tpWakingKoopa:
        e.Tp = tpRunningKoopa;
        e.XVel = 5 * (2 * byte(e.XPos > E.PlayerX1) - 1);
        e.MoveDelay = 0;
        e.DelayCounter = 0;
        Beep(800);
        E.cdEnemy = 1;
        AddScore(100);
        break;
      case tpChamp:
        if (e.SubTp === 0) {
          E.cdChamp = 1;
          AddScore(1000);
        } else E.cdHit = 1;
        e.Tp = tpDying;
        e.DelayCounter = -(VGA.MAX_PAGE + 1);
        CoinGlitter(e.XPos, e.YPos);
        break;
      case tpLife:
        E.cdLife = 1;
        e.Tp = tpDying;
        e.DelayCounter = -(VGA.MAX_PAGE + 1);
        CoinGlitter(e.XPos, e.YPos);
        AddScore(1000);
        break;
      case tpFlower:
        E.cdFlower = 1;
        e.Tp = tpDying;
        e.DelayCounter = -(VGA.MAX_PAGE + 1);
        CoinGlitter(e.XPos, e.YPos);
        AddScore(1000);
        break;
      case tpStar:
        E.cdStar = 1;
        e.Tp = tpDying;
        e.DelayCounter = -(VGA.MAX_PAGE + 1);
        CoinGlitter(e.XPos, e.YPos);
        AddScore(1000);
        break;
      case tpVertFireBall:
        E.cdHit = 1;
        break;
      default:
        if ((E.PlayerYVel > e.YVel || E.PlayerYVel > 0) && E.PlayerY2 <= e.YPos + H) {
          if (e.Tp === tpChibibo) {
            e.Tp = tpFlatChibibo;
            e.XVel = 0;
            e.DelayCounter = -2 - 15 * byte(e.YVel === 0);
            Beep(800);
            E.cdEnemy = 1;
            AddScore(100);
          } else if (e.Tp === tpVertFish) {
            if (e.YPos + H < NV * H) {
              Kill(j);
              Beep(800);
              E.cdEnemy = 1;
            }
          } else if (e.Tp === tpKoopa || e.Tp === tpRunningKoopa) {
            e.Tp = tpSleepingKoopa;
            e.XVel = 0;
            e.Counter = 0;
            Beep(800);
            E.cdEnemy = 1;
            AddScore(100);
          } else if (isLift(e.Tp)) {
            if (e.Tp === tpDonut) {
              e.Status = 2;
              if (e.Counter > 20 && e.YVel === 0) e.YVel++;
            }
            E.cdStopJump = byte(E.PlayerYVel !== 2);
            E.cdLift = 1;
            E.PlayerY1 = e.YPos - 2 * H;
            E.PlayerY2 = e.YPos - 1;
            E.PlayerXVel = e.XVel;
            if (e.MoveDelay !== 0) E.PlayerXVel = (e.XVel * e.XPos) % 2;
            E.PlayerYVel = e.YVel;
          }
        } else if (!((e.Tp === tpVertFish && !(Math.abs(e.DelayCounter - e.MoveDelay) <= 1))
          || isLift(e.Tp))) {
          E.cdHit = 1;
          if (E.Star) Kill(j);
        }
    }
  }

  ActiveEnemies = ActiveEnemies.filter((k) => Enemy[k].Tp !== tpDead);
}

export function StartEnemies(X, Dir) {
  if (X < 0 || X > B.Options.XSize) return;
  for (let i = 0; i <= NV - 1; i++) {
    let rm = true;
    const c = WorldMap.get(X, i);
    switch (c) {
      case 0x80: NewEnemy(tpChibibo, 0, X, i, 1 * Dir, 0, 2); break;
      case 0x81: NewEnemy(tpVertFish, 0, X, i + 2, 0, 0, 50 + random(100)); break;
      case 0x82: NewEnemy(tpVertFireBall, 0, X, i + 2, 0, 0, 50 + random(100)); break;
      case 0x83: NewEnemy(tpChibibo, 1, X, i, 1 * Dir, 0, 2); break;
      case 0x84: case 0x85: case 0x86:
        NewEnemy(tpVertPlant, c - 0x84, X, i + 2, 0, 0, 20 + random(50));
        break;
      case 0x87: NewEnemy(tpRed, 0, X, i, 1 * Dir, 0, 2); break;
      case 0x88: case 0x89: case 0x8A:
        NewEnemy(tpKoopa, c - 0x88, X, i, Dir, 0, 2);
        break;
      case 0xB0:
        if (canHoldYou(WorldMap.get(X - 1, i)) || canHoldYou(WorldMap.get(X + 1, i)))
          NewEnemy(tpBlockLift, 0, X, i, -Dir, 0, 0);
        else NewEnemy(tpBlockLift, 0, X, i, 0, -Dir, 0);
        break;
      case 0xB1: NewEnemy(tpDonut, 0, X, i, 0, 0, 0); break;
      default:
        rm = false;
    }
    if (rm) WorldMap.set(X, i, 0x20);
  }
}

export function HitAbove(MapX, MapY) {
  const Y = MapY * H;
  const X = MapX * W;
  const n = ActiveEnemies.length;
  for (let i = 1; i <= n; i++) {
    const e = Enemy[ActiveEnemies[i - 1]];
    if (e.YPos !== Y) continue;
    if (!(e.XPos + e.XVel + W > X && e.XPos + e.XVel < X + W)) continue;
    const t = e.Tp;
    if (t === tpChamp || t === tpLife || t === tpFlower || t === tpStar || (t >= tpKoopa && t <= tpWakingKoopa)) {
      if ((e.XVel > 0 && e.XPos + e.XVel + (W >> 1) <= X)
        || (e.XVel < 0 && e.XPos + e.XVel + (W >> 1) >= X)) e.XVel = -e.XVel;
      e.YVel = -7;
      e.Status = Falling;
      if (t >= tpKoopa && t <= tpWakingKoopa) {
        e.Tp = tpSleepingKoopa;
        e.XVel = 0;
      }
    } else if (t === tpChibibo || t === tpRed) Kill(ActiveEnemies[i - 1]);
  }
}
