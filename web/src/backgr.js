// Port of BACKGR.PAS: parallax backgrounds (hills drawn by changing only the
// pixels that move, palette-animated bricks and pillars) and sky fills.

import * as VGA from './vga256.js';
import { B, W, H, NH, NV, MaxWorldSize } from './buffers.js';
import { Palette, CopyPalette, OutPalette } from './palettes.js';
import { RAW } from './data.js';
import { round, toShortInt } from './pascal.js';

export const Left = 0;
export const Right = 1;
export const Shift = 16;

const Speed = 3;
const BrickSpeed = 2;
const Max = Math.trunc(MaxWorldSize / Speed) * W; // 1560
const HEIGHT = 26;
const CloudSpeed = 4;
const MaxClouds = 7;
const MaxCloudSize = 70;

export const BG = { BackGround: 0 };

// The unit's variables in data-segment order: BackGrMap is followed by
// ColorMap, which PutBackGr reads past the end of BackGrMap on long levels.
const dseg = new Uint8Array(0x10000);
const BackGrMap = dseg.subarray(0, Max + 1);
const COLORMAP = Max + 1;
const colorMap = (i) => dseg[COLORMAP + 2 * i] | (dseg[COLORMAP + 2 * i + 1] << 8);
const setColorMap = (i, v) => {
  dseg[COLORMAP + 2 * i] = v & 0xFF;
  dseg[COLORMAP + 2 * i + 1] = (v >> 8) & 0xFF;
};
let Clouds = 0;

// Move (@Proc^, BackGrMap, SizeOf (BackGrMap)): the byte after the data is
// the procedure's RET instruction.
function loadMap(name) {
  const src = RAW[name];
  BackGrMap.fill(0);
  BackGrMap.set(src.subarray(0, Math.min(src.length, BackGrMap.length)));
  if (src.length < BackGrMap.length) BackGrMap[src.length] = 0xC3;
}

function InitClouds() {
  // Clouds are not used by any level of the game.
}

function PutClouds(_offset, _n) {
  if (Clouds === 0) return;
}

export function StartClouds() {
  if (Clouds === 0) return;
  for (let i = B.XView + MaxCloudSize; i >= B.XView; i--) {
    B.XView = i;
    PutClouds(Math.trunc(i / CloudSpeed), -CloudSpeed);
  }
}

export function InitBackGr(NewBackGr, bClouds) {
  BG.BackGround = NewBackGr;
  switch (BG.BackGround) {
    case 1: case 2: loadMap('BOGEN'); break;
    case 3: loadMap('MOUNT'); break;
    case 9: loadMap('BOGEN7'); break;
    case 10: loadMap('BOGEN26'); break;
  }
  if ([1, 9, 10].includes(BG.BackGround))
    for (let i = 0; i <= Max; i++) BackGrMap[i] = (HEIGHT - BackGrMap[i] + 1) & 0xFF;
  Clouds = bClouds;
  if (Clouds !== 0) InitClouds();
}

// Scrolls the hills: only pixels that change between the old and the new
// position are rewritten (colors $E0 = sky, $F0 = hill).
function PutBackGr(Fill) {
  const u16 = (v) => v & 0xFFFF;
  const pageOffset = VGA.GetPageOffset();
  const OldXView = B.LastXView[VGA.CurrentPage()];
  const XView = B.XView;
  const Y = u16(pageOffset + (B.Options.Horizon - HEIGHT) * VGA.BYTES_PER_LINE);
  let X1 = u16(Y + Math.trunc(XView / 4));
  let X2 = u16(Y + Math.trunc((XView + NH * W) / 4));
  let Bank = XView & 3;
  const DX = XView - OldXView;
  let XPos = XView;
  let X1Pos = XView;
  let X2Pos = OldXView + NH * W - 1;
  if (DX < 0) {
    X1Pos = OldXView;
    X2Pos = XView + NH * W - 1;
  }
  let XStart = Math.trunc(XView / Speed);
  let OldXStart = Math.trunc(OldXView / Speed) + DX;
  X1Pos = u16(X1Pos);
  X2Pos = u16(X2Pos);
  const map = (i) => dseg[u16(i)];

  for (let count = 0; count < 4; count++) {
    const pl = VGA.planes[Bank];
    let dx = u16(XPos);
    let di = X1;
    let cx = u16(OldXStart);
    let bx = u16(XStart);
    do {
      let ah = map(bx); // new position
      let cl = map(cx); // old position
      let d = di;
      if (Fill || dx < X1Pos || dx > X2Pos) {
        // @Fill: redraw the complete column
        const top = ah;
        for (let c = 0; c <= HEIGHT; c++) {
          if (c < top) {
            if (pl[d] === 0xF0) pl[d] = 0xE0;
          } else if (pl[d] === 0xE0) pl[d] = 0xF0;
          d = u16(d + VGA.BYTES_PER_LINE);
        }
      } else if (ah !== cl) {
        if (toShortInt(ah) > toShortInt(cl)) {
          d = u16(d + VGA.BYTES_PER_LINE * cl);
          do {
            if (pl[d] === 0xF0) pl[d] = 0xE0;
            d = u16(d + VGA.BYTES_PER_LINE);
            cl = (cl + 1) & 0xFF;
          } while (cl < ah);
        } else {
          d = u16(d + VGA.BYTES_PER_LINE * ah);
          do {
            if (pl[d] === 0xE0) pl[d] = 0xF0;
            d = u16(d + VGA.BYTES_PER_LINE);
            ah = (ah + 1) & 0xFF;
          } while (ah < cl);
        }
      }
      bx = u16(bx + 4);
      cx = u16(cx + 4);
      dx = u16(dx + 4);
      di = u16(di + 1);
    } while (di < X2);
    Bank++;
    if (Bank === 4) {
      Bank = 0;
      X1 = u16(X1 + 1);
      X2 = u16(X2 + 1);
    }
    OldXStart++;
    XStart++;
    XPos++;
  }
}

function BrickPalette(i) {
  i %= 20;
  for (let j = 0; j <= 19; j++) {
    if (i === j) CopyPalette(0xFE, 0xE0 + j);
    else if ((i + 2) % 20 === j) CopyPalette(0xFF, 0xE0 + j);
    else CopyPalette(0xFD, 0xE0 + j);
  }
}

function LargeBrickPalette(i) {
  i %= 32;
  for (let j = 0; j <= 31; j++) {
    if (i === j || (i + 1) % 32 === j) CopyPalette(0xD6, 0xE0 + j);
    else if ((i + 3) % 32 === j || (i + 4) % 32 === j) CopyPalette(0xD4, 0xE0 + j);
    else CopyPalette(0xD1, 0xE0 + j);
  }
}

function PillarPalette(i) {
  const ShadowPos = 28;
  const ShadowEnd = 36;
  let base = B.Options.BackGrColor1;
  let C1 = Math.trunc(Palette[base * 3] / 4) & 0xFF;
  let C2 = Math.trunc(Palette[base * 3 + 1] / 4) & 0xFF;
  let C3 = Math.trunc(Palette[base * 3 + 2] / 4) & 0xFF;
  i %= 60;
  let j = 0;
  let k = 1;
  do {
    for (let l = j; l <= k; l++) {
      OutPalette(0xC0 + ((l + i) % 60), C1 + k, C2 + k, C3 + k);
      OutPalette(0xC0 + ((ShadowPos + i - l) % 60), C1 + k, C2 + k, C3 + k);
    }
    j = k;
    k = k + 1;
  } while (k < 15);
  for (j = ShadowPos; j <= ShadowEnd; j++) {
    if (C1 > 0) C1--;
    if (C2 > 0) C2--;
    if (C3 > 0) C3--;
    OutPalette(0xC0 + ((j + i) % 60), C1, C2, C3);
  }
  base = B.Options.BackGrColor2;
  C1 = Math.trunc(Palette[base * 3] / 4) & 0xFF;
  C2 = Math.trunc(Palette[base * 3 + 1] / 4) & 0xFF;
  C3 = Math.trunc(Palette[base * 3 + 2] / 4) & 0xFF;
  for (j = ShadowEnd + 1; j <= 59; j++) OutPalette(0xC0 + ((i + j) % 60), C1, C2, C3);
}

function WindowPalette(i) {
  i %= 32;
  for (let j = 0; j <= 5; j++) CopyPalette(1, 0xE0 + ((i + j) % 32));
  for (let j = 6; j <= 31; j++) CopyPalette(16, 0xE0 + ((i + j) % 32));
}

export function DrawBackGr(FirstTime) {
  switch (BG.BackGround) {
    case 1: case 2: case 3: case 9: case 10: case 11:
      PutBackGr(FirstTime);
      break;
  }
  if (Clouds !== 0) {
    PutClouds(Math.trunc(B.XView / CloudSpeed), B.XView - B.LastXView[VGA.CurrentPage()]);
  }
}

export function DrawBackGrMap(Y1, Y2, Shft, C) {
  for (let i = 0; i <= 320 - 1; i++) {
    for (let j = Y1 - BackGrMap[i + Shft]; j <= Y2; j++)
      if (VGA.GetPixel(i, j) >= 0xC0) VGA.PutPixel(i, j, C);
  }
}

export function DrawPalBackGr() {
  const i = round(B.XView / BrickSpeed);
  switch (BG.BackGround) {
    case 4: BrickPalette(i); break;
    case 5: LargeBrickPalette(i); break;
    case 6: PillarPalette(i); break;
    case 7: WindowPalette(i); break;
  }
}

export function ReadColorMap() {
  for (let i = 0; i <= NV * H - 1; i++)
    setColorMap(i, VGA.GetPixel(B.XView + Shift, i) * 256 + VGA.GetPixel(B.XView + Shift + 1, i));
}

export function DrawBricks(X, Y, Wd, Ht) {
  VGA.PutImage(X, Y, Wd, Ht, RAW.PALBRICK000);
}

// LargeBricks and Windows were written for linear mode 13h and are not used
// by any level (background types 5 and 7).
export function LargeBricks(_X, _Y, _W, _H) {}
export function Windows(_X, _Y, _W, _H) {}

export function Pillar(X, Y, Wd, Ht) {
  switch (Math.trunc(X / Wd) % 3) {
    case 0: VGA.PutImage(X, Y, Wd, Ht, RAW.PALPILL000); break;
    case 1: VGA.PutImage(X, Y, Wd, Ht, RAW.PALPILL001); break;
    case 2: VGA.PutImage(X, Y, Wd, Ht, RAW.PALPILL002); break;
  }
}

export function DrawBackGrBlock(X, Y, Wd, Ht) {
  if ([2, 5, 9, 10, 11].includes(B.Options.SkyType)) SmoothFill(X, Y, Wd, Ht);
  else {
    switch (BG.BackGround) {
      case 4: DrawBricks(X, Y, Wd, Ht); break;
      case 5: LargeBricks(X, Y, Wd, Ht); break;
      case 6: Pillar(X, Y, Wd, Ht); break;
      case 7: Windows(X, Y, Wd, Ht); break;
      default:
        for (let i = 0; i <= Ht - 1; i++) VGA.Fill(X, Y + i, Wd, 1, colorMap(Y + i));
    }
  }
}

// Sky with a dithered vertical gradient ($EF at the top down to $E0).
export function SmoothFill(X, Y, Wd, Ht) {
  const u16 = (v) => v & 0xFFFF;
  const pageOffset = VGA.GetPageOffset();
  const Horizon = u16(B.Options.Horizon - 4); // -4 for BumpBlock
  let di = u16(Math.imul(Y, VGA.BYTES_PER_LINE) + (u16(X) >>> 2) + pageOffset);
  let y = u16(Y);
  let dl;
  let dh;
  if (y < Horizon) {
    const q = Math.trunc(y / 6) & 0xFF;
    dh = (y % 6) & 0xFF;
    dl = (0xEF - q) & 0xFF;
    if (dl < 0xE0) dl = 0xE0;
  } else {
    dl = 0xF0;
    dh = (y >> 8) & 0xFF;
  }
  if (Ht <= 0) return;
  const cx = u16(Wd) >>> 2;
  const [p0, p1, p2, p3] = VGA.planes;
  for (let n = 0; n < Ht; n++) {
    let al = dl;
    for (let i = 0; i < cx; i++) {
      const a = u16(di + i);
      p0[a] = al; p1[a] = al; p2[a] = al; p3[a] = al;
    }
    if (dh >= 3) {
      if (al !== 0xE0 && al !== 0xF0) al = (al - 1) & 0xFF;
      const odd = dh & 1;
      const pa = odd ? p1 : p0;
      const pb = odd ? p3 : p2;
      for (let i = 0; i < cx; i++) {
        const a = u16(di + i);
        pa[a] = al;
        pb[a] = al;
      }
    }
    y = u16(y + 1);
    if (y >= Horizon) dl = 0xF0;
    dh = (dh + 1) & 0xFF;
    if (dh === 6) {
      dh = 0;
      if (dl !== 0xE0 && dl !== 0xF0) dl = (dl - 1) & 0xFF;
    }
    di = u16(di + VGA.BYTES_PER_LINE);
  }
}
