// Port of FIGURES.PAS: level tiles, sky and world construction.

import * as VGA from './vga256.js';
import { B, W, H, NV, WorldMap, canHoldYou } from './buffers.js';
import { ChangePalette } from './palettes.js';
import { BG, DrawBricks, LargeBricks, Pillar, Windows, SmoothFill } from './backgr.js';
import { RAW } from './data.js';
import { ch } from './pascal.js';

export const N1 = 3;
export const N2 = 13;

const IMG = W * H;
const newImage = () => new Uint8Array(IMG);

// FigList [1..N1, 1..N2] of ImageBuffer
export const FigList = Array.from({ length: N1 + 1 }, () =>
  Array.from({ length: N2 + 1 }, newImage));
export const Bricks = [newImage(), newImage(), newImage(), newImage()];

export const F = { Sky: 0 };

function ConvertGrass(P0, P1, P2) {
  for (let i = 0; i < IMG; i++) {
    const C1 = P1[i];
    const C2 = P2[i];
    let C0 = C1;
    if (C1 !== C2) {
      if (C1 === 2) C0 = C2 === 0 ? 153 : 155;
      else if (C1 === 3) C0 = C2 === 0 ? 154 : 156;
      else C0 = C2 === 2 ? 157 : 155; // C1 = 0
    }
    P0[i] = C0;
  }
}

export function ReColor(P1, P2, C) {
  for (let i = 0; i < IMG; i++) {
    let al = P1[i];
    if (al > 0x10) al = ((al & 7) + C) & 0xFF;
    P2[i] = al;
  }
}

export function ReColor2(P1, P2, C1, C2) {
  for (let i = 0; i < IMG; i++) {
    let al = P1[i];
    if (al > 0x10) {
      al &= 0x0F;
      al = al < 8 ? (al + C1) & 0xFF : ((al & 7) + C2) & 0xFF;
    }
    P2[i] = al;
  }
}

export function Replace(P1, P2, n1, n2) {
  for (let i = 0; i < IMG; i++) P2[i] = P1[i] === n1 ? n2 : P1[i];
}

// Horizontal mirror of a planar image (planes 0<->3, 1<->2, bytes reversed).
export function mirrorPlanar(P1, P2, w, h) {
  const bpl = w >> 2;
  const plane = h * bpl;
  const src = P1 === P2 ? P1.slice() : P1;
  const swap = (a, b) => {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < bpl; i++) {
        P2[b * plane + j * bpl + i] = src[a * plane + j * bpl + bpl - 1 - i];
        P2[a * plane + j * bpl + i] = src[b * plane + j * bpl + bpl - 1 - i];
      }
  };
  swap(0, 3);
  swap(1, 2);
}

export function Mirror(P1, P2) {
  mirrorPlanar(P1, P2, W, H);
}

// 180 degree rotation (reversing the planar byte order does exactly that).
export function Rotate(P1, P2) {
  const src = P1 === P2 ? P1.slice() : P1;
  for (let i = 0; i < IMG; i++) P2[i] = src[IMG - 1 - i];
}

export function InitSky(NewSky) {
  F.Sky = NewSky;
}

export function InitPipes(NewColor) {
  ReColor(RAW.PIPE000, RAW.PIPE000, NewColor);
  ReColor(RAW.PIPE001, RAW.PIPE001, NewColor);
  ReColor(RAW.PIPE002, RAW.PIPE002, NewColor);
  ReColor(RAW.PIPE003, RAW.PIPE003, NewColor);
}

const WALLS = { 0: 'GREEN', 1: 'SAND', 3: 'BROWN', 4: 'GRASS', 5: 'DES' };

function InitWall(N, WallType) {
  const L = FigList[N];
  const slots = [1, 2, 4, 5, 10];
  if (WALLS[WallType]) {
    const name = WALLS[WallType];
    slots.forEach((s, k) => L[s].set(RAW[`${name}00${k}`]));
  } else if (WallType === 2) {
    const i = B.Options.GroundColor1;
    const j = B.Options.GroundColor2;
    slots.forEach((s, k) => ReColor2(RAW[`GREEN00${k}`], L[s], i, j));
  }
  Mirror(L[1], L[3]);
  Rotate(L[4], L[6]);
  Rotate(L[1], L[9]);
  Rotate(L[2], L[8]);
  Rotate(L[3], L[7]);
  Mirror(L[10], L[11]);
  Rotate(L[11], L[12]);
  Mirror(L[12], L[13]);
}

export function InitWalls(W1, W2, W3) {
  InitWall(1, W1);
  InitWall(2, W2);
  InitWall(3, W3);
}

export function SetSkyPalette() {
  switch (F.Sky) {
    case 0:
      ChangePalette(0xE0, 35, 45, 63);
      ChangePalette(0xF0, 20, 38, 48);
      ChangePalette(0xFF, 54, 57, 60);
      break;
    case 1:
      ChangePalette(0xE0, 52, 55, 55);
      ChangePalette(0xF0, 42, 48, 45);
      ChangePalette(0xFF, 61, 61, 61);
      break;
    case 2:
      for (let i = 0xE0; i <= 0xEF; i++) {
        const j = i - 0xE0;
        ChangePalette(i, 48 - 2 * j, 58 - j, 58);
      }
      ChangePalette(0xF0, 35, 48, 46);
      break;
    case 3:
      ChangePalette(0xE0, 0, 5, 3);
      ChangePalette(0xF0, 8, 12, 10);
      ChangePalette(0xFF, 8, 13, 13);
      break;
    case 4:
      ChangePalette(0xE0, 35, 45, 53);
      ChangePalette(0xF0, 23, 39, 43);
      ChangePalette(0xFF, 58, 60, 60);
      break;
    case 5:
      for (let i = 0xE0; i <= 0xEF; i++) {
        const j = i - 0xE0;
        ChangePalette(i, 58 - Math.trunc(j / 2), 56 - j, 38 - j);
      }
      ChangePalette(0xF0, 52, 49, 32);
      break;
    case 6: // Brown bricks
      if (B.Options.BackGrType === 4) {
        for (let i = 0xE0; i <= 0xEF; i++) ChangePalette(i, 22, 15, 11);
        ChangePalette(0xFD, 22, 15, 11);
        ChangePalette(0xFE, 19, 12, 8);
        ChangePalette(0xFF, 25, 18, 14);
      } else {
        for (let i = 0xE0; i <= 0xFF; i++) ChangePalette(i, 19, 9, 8);
        ChangePalette(0xD1, 19, 9, 8);
        ChangePalette(0xD6, 21, 11, 10);
        ChangePalette(0xD4, 17, 7, 6);
      }
      break;
    case 7: // Gray bricks
      if (B.Options.BackGrType === 4) {
        for (let i = 0xE0; i <= 0xEF; i++) ChangePalette(i, 18, 18, 22);
        ChangePalette(0xFD, 18, 18, 22);
        ChangePalette(0xFF, 23, 23, 27);
        ChangePalette(0xFE, 13, 13, 17);
      } else {
        for (let i = 0xE0; i <= 0xFF; i++) ChangePalette(i, 15, 15, 18);
        ChangePalette(0xD1, 15, 15, 18);
        ChangePalette(0xD4, 18, 18, 21);
        ChangePalette(0xD6, 12, 12, 15);
      }
      break;
    case 8: // Dark brown bricks
      if (B.Options.BackGrType === 4) {
        for (let i = 0xE0; i <= 0xEF; i++) ChangePalette(i, 17, 10, 10);
        ChangePalette(0xFD, 17, 10, 10);
        ChangePalette(0xFE, 11, 5, 5);
        ChangePalette(0xFF, 20, 14, 14);
      } else {
        for (let i = 0xE0; i <= 0xFF; i++) ChangePalette(i, 15, 5, 5);
        ChangePalette(0xD1, 15, 5, 5);
        ChangePalette(0xD4, 20, 10, 10);
        ChangePalette(0xD6, 10, 0, 0);
      }
      break;
    case 9:
      for (let i = 0xE0; i <= 0xEF; i++) {
        const j = i - 0xE0;
        ChangePalette(i, 63 - Math.trunc(j / 3), 50 - j, 25 - j);
      }
      ChangePalette(0xF0, 48, 35, 18);
      break;
    case 10:
      for (let i = 0xE0; i <= 0xEF; i++) {
        const j = i - 0xE0;
        ChangePalette(i, 27 - j, 43 - j, 63 - j);
      }
      ChangePalette(0xF0, 58, 58, 63);
      break;
    case 11:
      for (let i = 0xE0; i <= 0xEF; i++) {
        const j = i - 0xE0;
        ChangePalette(i, 60 - j, 63 - j, 63 - j);
      }
      ChangePalette(0xF0, 42, 48, 45);
      break;
    case 12:
      for (let i = 0xE0; i <= 0xEF; i++) {
        const j = i - 0xE0;
        ChangePalette(i, 55 - j, 63 - j, 63);
      }
      ChangePalette(0xF0, 30, 50, 58);
      ChangePalette(0xF0, 36, 45, 41);
      break;
  }
}

export function DrawSky(X, Y, Wd, Ht) {
  if (B.Options.BackGrType === 0) {
    VGA.Fill(X, Y, Wd, Ht, 0xE0);
    return;
  }
  switch (F.Sky) {
    case 0: case 1: case 3: case 4: {
      const i = B.Options.Horizon;
      const j = i - Y;
      if (i < Y) VGA.Fill(X, Y, Wd, Ht, 0xF0);
      else if (i > Y + Ht - 1) VGA.Fill(X, Y, Wd, Ht, 0xE0);
      else {
        VGA.Fill(X, Y, Wd, j, 0xE0);
        VGA.Fill(X, i, Wd, Ht - j, 0xF0);
      }
      break;
    }
    case 2: case 5: case 9: case 10: case 11: case 12:
      SmoothFill(X, Y, Wd, Ht);
      break;
    case 6: case 7: case 8:
      switch (B.Options.BackGrType) {
        case 4: DrawBricks(X, Y, Wd, Ht); break;
        case 5: LargeBricks(X, Y, Wd, Ht); break;
        case 6: Pillar(X, Y, Wd, Ht); break;
        case 7: Windows(X, Y, Wd, Ht); break;
      }
      break;
  }
}

const cSp = 0x20;

export function Redraw(X, Y) {
  const XPos = X * W;
  const YPos = Y * H;
  let C = WorldMap.get(X, Y);
  const at = (dx, dy) => WorldMap.get(X + dx, Y + dy);
  if (!(X >= 0 && Y >= 0 && Y < NV)) return;
  if (C !== 0) {
    if (C === ch('%') && B.Options.Design === 4) DrawSky(XPos, YPos, W, H >> 1);
    else DrawSky(XPos, YPos, W, H);
  }
  if (C === cSp) return;
  if (at(0, -1) === 18) VGA.PutImage(XPos, YPos, W, H, FigList[1][5]);
  let Fig = null;
  const draw = (img) => VGA.DrawImage(XPos, YPos, W, H, img);
  const design = B.Options.Design;

  if (C >= 1 && C <= 26) {
    if (C > 13) C -= 13;
    else if (at(-1, 0) >= 14 && at(-1, 0) <= 26) {
      if (C === 1 || C === 4 || C === 7)
        VGA.PutImage(XPos, YPos, W, H, FigList[1][at(-1, 0) - 13]);
    } else if (at(1, 0) >= 14 && at(1, 0) <= 26) {
      if (C === 3 || C === 6 || C === 9)
        VGA.PutImage(XPos, YPos, W, H, FigList[1][at(1, 0) - 13]);
    }
    Fig = FigList[1][C];
    if (![1, 3, 4, 6, 7, 9].includes(C)) {
      VGA.PutImage(XPos, YPos, W, H, Fig);
      Fig = null;
    }
  } else {
    switch (C) {
      case ch('?'): Fig = RAW.QUEST000; break;
      case ch('@'): Fig = RAW.QUEST001; break;
      case ch('A'): {
        const L = at(-1, 0) === ch('A');
        const R = at(1, 0) === ch('A');
        const RS = ((X + Y) & 1) === 1;
        const LS = !RS;
        if (LS && R) Fig = Bricks[1];
        else if (RS && L) Fig = Bricks[2];
        else Fig = Bricks[0];
        break;
      }
      case ch('I'): Fig = RAW.BLOCK000; break;
      case ch('J'): Fig = RAW.BLOCK001; break;
      case ch('K'): Fig = RAW.NOTE000; break;
      case ch('X'): Fig = RAW.XBLOCK000; break;
      case ch('W'): Fig = RAW.WOOD000; break;
      case ch('='):
        if (canHoldYou(at(0, 1))) draw(RAW.PIN000);
        else VGA.UpSideDown(XPos, YPos, W, H, RAW.PIN000);
        break;
      case ch('0'): Fig = RAW.PIPE000; break;
      case ch('1'): Fig = RAW.PIPE001; break;
      case ch('2'): Fig = RAW.PIPE002; break;
      case ch('3'): Fig = RAW.PIPE003; break;
      case ch('*'): Fig = RAW.COIN000; break;
      case 0xFE:
        Fig = at(0, -1) === 0xFE ? RAW.EXIT001 : RAW.EXIT000;
        break;
      case 0xF7:
        if (at(0, -1) === 0xF0 && design === 2) draw(RAW.SMTREE001);
        if (at(0, -1) === 0xF6 && design === 1) draw(RAW.WPALM000);
        if (X === 0 || at(-1, 0) === C) Fig = at(1, 0) === C ? RAW.GRASS2000 : RAW.GRASS3000;
        else Fig = at(1, 0) === C ? RAW.GRASS1000 : RAW.GRASS3000;
        break;
      case 0xF0:
        if (design === 1) Fig = at(0, -1) !== C ? RAW.FENCE001 : RAW.FENCE000;
        else if (design === 2) Fig = at(0, -1) !== C ? RAW.SMTREE000 : RAW.SMTREE001;
        break;
      case 0xF6:
        if (design === 1) Fig = RAW.WPALM000;
        break;
      case 0xFA:
        if (design === 1) {
          if (at(-1, 0) === 0xF9) draw(RAW.PALM3000);
          else if (at(1, 0) === 0xF9) draw(RAW.PALM1000);
          Fig = RAW.PALM0000;
        }
        break;
      case 0xF4:
        if (design === 1) {
          if (at(0, 1) === 0xF6) draw(RAW.WPALM000);
          Fig = RAW.PALM1000;
        }
        break;
      case 0xF9:
        if (design === 1) Fig = RAW.PALM2000;
        break;
      case 0xF5:
        if (design === 1) {
          if (at(0, 1) === 0xF6) draw(RAW.WPALM000);
          Fig = RAW.PALM3000;
        }
        break;
      case ch('#'):
        switch (design) {
          case 1: Fig = RAW.FALL000; break;
          case 2:
            if (at(0, -1) === ch('#')) VGA.PutImage(XPos, YPos, W, H, RAW.TREE001);
            else if (at(0, -1) === ch('%')) {
              VGA.PutImage(XPos, YPos, W, H, RAW.TREE000);
              Fig = RAW.TREE003;
            } else Fig = RAW.TREE003;
            break;
          case 3: Fig = RAW.WINDOW001; break;
          case 4: Fig = RAW.LAVA000; break;
          case 5: VGA.Fill(XPos, YPos, W, H, 5); break;
        }
        break;
      case ch('%'):
        switch (design) {
          case 1: Fig = RAW.FALL001; break;
          case 2:
            if (at(0, -1) === ch('%')) VGA.PutImage(XPos, YPos, W, H, RAW.TREE000);
            else if (at(0, -1) === ch('#')) {
              VGA.PutImage(XPos, YPos, W, H, RAW.TREE001);
              Fig = RAW.TREE002;
            } else Fig = RAW.TREE002;
            break;
          case 3: Fig = RAW.WINDOW000; break;
          case 4: Fig = RAW.LAVA001; break;
          case 5:
            Fig = RAW[`LAVA200${((X + (B.LavaCounter >> 3)) % 5) + 1}`];
            break;
        }
        break;
    }
  }
  if (Fig) draw(Fig);
}

// Wall builder: chooses the right edge/corner tile for blocks 'A'..'D'.
export function BuildWorld() {
  const o = B.Options;
  let LastAB = cSp;
  let AB = cSp;
  let CD = cSp;
  const EF = cSp;
  const IgnoreAbove = (c) => c === 0xF7;

  function BuildWall(X, Y) {
    const C = WorldMap.get(X, Y);
    let inCh;
    let inChLeft;
    let N;
    if (C === ch('A') || C === ch('B')) {
      AB = C;
      inCh = (c) => c === C || (c >= 1 && c <= 13);
      if (LastAB !== C) inChLeft = (c) => inCh(c) && c !== 3 && c !== 6 && c !== 9;
      else inChLeft = inCh;
      N = 0;
    } else if (C === ch('C') || C === ch('D')) {
      CD = C;
      inCh = (c) => c === C || (c >= 1 && c <= 26) || c === ch('A') || c === ch('B') || IgnoreAbove(c);
      inChLeft = inCh;
      N = 13;
    } else return;
    const at = (x, y) => WorldMap.get(x, y);
    const A = 1 - ((inCh(at(X, Y - 1)) && !IgnoreAbove(at(X, Y - 1))) || Y === 0 ? 1 : 0);
    const Bv = 2 * (!((Y === NV - 1) || inCh(at(X, Y + 1))) ? 1 : 0);
    const L = 4 * (!((X === 0) || inChLeft(at(X - 1, Y))) ? 1 : 0);
    const R = 8 * (!((X === o.XSize - 1) || inCh(at(X + 1, Y))) ? 1 : 0);
    const set = (v) => WorldMap.set(X, Y, v + N);
    switch (A + Bv + L + R) {
      case 0:
        if (X > 0 && Y > 0 && !inCh(at(X - 1, Y - 1))) { set(10); return; }
        if (X < o.XSize - 1 && Y > 0 && !inCh(at(X + 1, Y - 1))) { set(11); return; }
        if (X > 0 && Y < NV - 1 && !inCh(at(X - 1, Y + 1))) { set(12); return; }
        if (X < o.XSize - 1 && Y < NV - 1 && !inCh(at(X + 1, Y + 1))) { set(13); return; }
        set(5);
        break;
      case 1: set(2); break;
      case 2: set(8); break;
      case 4: set(4); break;
      case 8: set(6); break;
      case 5: set(1); break;
      case 6: set(7); break;
      case 9: set(3); break;
      case 10: set(9); break;
      default: set(5);
    }
  }

  for (let i = 0; i <= o.XSize - 1; i++)
    for (let j = 0; j <= NV - 1; j++) {
      switch (WorldMap.get(i, j)) {
        case 0xFD:
          WorldMap.set(i, j - 5, ch('?'));
          WorldMap.set(i, j - 6, 0xE1);
          WorldMap.set(i, j, cSp);
          break;
        case 0xFC:
          WorldMap.set(i, j - 2, ch('*'));
          WorldMap.set(i, j, cSp);
          break;
        case 0xAD: {
          const k = j + 1;
          for (let l = j; l >= -1; l--) WorldMap.set(i, l, WorldMap.get(i, k));
          break;
        }
        case 0xAE:
          WorldMap.set(i, j, WorldMap.get(i, j - 1));
          WorldMap.set(i, NV, 254);
          break;
        case 0xAF:
          WorldMap.set(i, j, WorldMap.get(i, j - 1));
          WorldMap.set(i, NV, 255);
          break;
      }
    }

  o.BuildWall = o.WallType1 < 100;

  if (o.BuildWall) {
    for (let i = 0; i <= o.XSize - 1; i++) {
      for (let j = 0; j <= NV - 1; j++) BuildWall(i, j);
      // (sic) the original assigns LastAB three times
      LastAB = AB;
      LastAB = CD;
      LastAB = EF;
    }
  } else {
    switch (o.WallType1) {
      case 100:
        ReColor(RAW.BRICK0000, Bricks[0], o.GroundColor1);
        ReColor(RAW.BRICK0001, Bricks[1], o.GroundColor1);
        ReColor(RAW.BRICK0002, Bricks[2], o.GroundColor1);
        break;
      case 101:
        ReColor(RAW.BRICK1000, Bricks[0], o.GroundColor1);
        ReColor(RAW.BRICK1001, Bricks[1], o.GroundColor1);
        ReColor(RAW.BRICK1002, Bricks[2], o.GroundColor1);
        break;
      case 102:
        ReColor(RAW.BRICK2000, Bricks[0], o.GroundColor1);
        ReColor(RAW.BRICK2001, Bricks[1], o.GroundColor1);
        ReColor(RAW.BRICK2002, Bricks[2], o.GroundColor1);
        break;
    }
  }
  ConvertGrass(RAW.GRASS1000, RAW.GRASS1001, RAW.GRASS1002);
  ConvertGrass(RAW.GRASS2000, RAW.GRASS2001, RAW.GRASS2002);
  ConvertGrass(RAW.GRASS3000, RAW.GRASS3002, RAW.GRASS3001);

  ConvertGrass(RAW.PALM0000, RAW.PALM0001, RAW.PALM0002);
  ConvertGrass(RAW.PALM1000, RAW.PALM1001, RAW.PALM1002);
  ConvertGrass(RAW.PALM2000, RAW.PALM2001, RAW.PALM2002);
  ConvertGrass(RAW.PALM3000, RAW.PALM3001, RAW.PALM3002);

  ReColor(RAW.BLOCK001, RAW.BLOCK001, o.BrickColor);
  ReColor(RAW.WOOD000, RAW.WOOD000, o.WoodColor);
  ReColor(RAW.XBLOCK000, RAW.XBLOCK000, o.XBlockColor);
}
