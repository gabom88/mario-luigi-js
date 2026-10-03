// Port of PALETTES.PAS: game palette, fading and color cycling.

import * as VGA from './vga256.js';
import { B } from './buffers.js';
import { RAW } from './data.js';
import { random } from './pascal.js';

export const Steps = 32;
export const BlinkSpeed = 25;
export const GrassSpeed = 40;
export const CoinSpeed = 25;
export const WaterFallSpeed = 10;

export const peNoEffect = 0;
export const peBlackWhite = 1;
export const peEGAMode = 2;

// PalType = array [0..255, 0..2] of ShortInt
export const newPal = () => new Int8Array(768);

export const P = {
  LockPalette: false,
  ModifyPalette: true,
  FadingDone: true,
  BlinkCounter: 0,
  GrassCounter: 0,
  CoinCounter: 0,
  WaterFallCounter: 0,
  PaletteEffect: peNoEffect,
};

export const Palette = newPal();
export const P256 = Int8Array.from(RAW.PAL256);

let FadingUp = false;
let FadingDown = false;
let FadingPos = 0;

export function ReadPalette(Pal) {
  if (P.PaletteEffect === peNoEffect) VGA.ReadPalette(Pal);
  else RefreshPalette(Pal);
}

export function NewPalette(Pal) {
  Palette.set(Pal);
  FadingUp = false;
  FadingDown = false;
}

export function ClearPalette() {
  ReadPalette(newPal());
  FadingUp = false;
  FadingDown = false;
}

export function ChangePalette(Color, R, G, Bl) {
  Palette[Color * 3] = R;
  Palette[Color * 3 + 1] = G;
  Palette[Color * 3 + 2] = Bl;
}

export function StartFadeUp() {
  FadingUp = true;
  FadingPos = 63;
  P.FadingDone = false;
}

export function StartFadeDown() {
  FadingDown = true;
  FadingPos = 0;
  P.FadingDone = false;
}

function fadedPalette(k) {
  const t = newPal();
  for (let i = 0; i < 768; i++) t[i] = Palette[i] - k > 0 ? Palette[i] - k : 0;
  return t;
}

export function Fade() {
  if (FadingUp || FadingDown) {
    ReadPalette(fadedPalette(FadingPos));
    if (FadingUp) {
      if (FadingPos === 0) {
        FadingUp = false;
        P.FadingDone = true;
      } else FadingPos--;
    }
    if (FadingDown) {
      if (FadingPos === 63) {
        FadingUp = false;
        P.FadingDone = true;
      } else FadingPos++;
    }
  }
}

export async function FadeUp(N) {
  if (P.PaletteEffect === peEGAMode) return;
  for (let k = N - 1; k >= 0; k--) {
    const t = fadedPalette(k);
    VGA.WaitDisplay();
    await VGA.WaitRetrace();
    ReadPalette(t);
  }
}

export async function FadeDown(N) {
  if (P.PaletteEffect === peEGAMode) return;
  for (let k = 0; k <= N - 1; k++) {
    const t = fadedPalette(k);
    VGA.WaitDisplay();
    await VGA.WaitRetrace();
    ReadPalette(t);
  }
}

function copyEntry(dst, src) {
  Palette[dst * 3] = Palette[src * 3];
  Palette[dst * 3 + 1] = Palette[src * 3 + 1];
  Palette[dst * 3 + 2] = Palette[src * 3 + 2];
}

export function InitGrass() {
  const o = B.Options;
  ChangePalette(2, o.C2r, o.C2g, o.C2b);
  ChangePalette(3, o.C3r, o.C3g, o.C3b);
  copyEntry(153, 2);
  copyEntry(154, 3);
  copyEntry(155, 2);
  copyEntry(156, 3);
  const sky = 0xF0 - (o.SkyType === 10 ? 1 : 0);
  copyEntry(157, sky);
  copyEntry(158, sky);
  OutPalette(6, 60, 40, 35); // Champ
}

export function CopyPalette(C1, C2) {
  OutPalette(C2, Palette[C1 * 3], Palette[C1 * 3 + 1], Palette[C1 * 3 + 2]);
}

export function BlinkPalette() {
  if (FadingUp || FadingDown) return;

  OutPalette(1, 60 + random(4), 55 + random(8), 30 + random(25)); // Star

  P.WaterFallCounter++;
  if (P.WaterFallCounter >= 5 * WaterFallSpeed) P.WaterFallCounter = 0;
  let i = P.WaterFallCounter % WaterFallSpeed;
  if (i === 0) {
    let j = Math.trunc(P.WaterFallCounter / WaterFallSpeed);
    for (i = 0; i <= 4; i++) {
      j--;
      if (j < 0) j = 4;
      const k = 5 - j;
      switch (B.Options.SkyType) {
        case 0: OutPalette(7 + i, 40 + 3 * k, 50 + 2 * k, 53 + 2 * k); break;
        case 1: OutPalette(7 + i, 45 + 3 * k, 52 + 2 * k, 51 + 2 * k); break;
        case 2: OutPalette(7 + i, 44 + 3 * k, 53 + 2 * k, 53 + 2 * k); break;
        case 3: OutPalette(7 + i, 34 + 3 * k, 40 + 2 * k, 40 + 2 * k); break;
        case 4: OutPalette(7 + i, 38 + 3 * k, 47 + 2 * k, 47 + 2 * k); break;
        case 5: OutPalette(7 + i, 53 + 2 * k, 53 + 2 * k, 44 + 3 * k); break;
        case 6: case 7: case 8: OutPalette(7 + i, 42 + 4 * k, 5 + k * k, 2 * k); break;
        case 10: OutPalette(7 + i, 40 + 4 * k, 45 + 3 * k, 63 + 0 * k); break;
        default: OutPalette(7 + i, 50 + 2 * k, 50 + 2 * k, 50 + 2 * k);
      }
    }
  }

  P.BlinkCounter++;
  if (P.BlinkCounter > BlinkSpeed) {
    P.BlinkCounter = -BlinkSpeed;
    OutPalette(159, 52, 43, 21);
  } else if (P.BlinkCounter === 0) {
    OutPalette(159, 55, 46, 24);
  }

  const sky = 0xF0 - (B.Options.SkyType === 10 ? 1 : 0);
  P.GrassCounter++;
  if (P.GrassCounter > GrassSpeed) {
    P.GrassCounter = -GrassSpeed;
    CopyPalette(2, 153);
    CopyPalette(3, 154);
    CopyPalette(2, 155);
    CopyPalette(3, 156);
    CopyPalette(sky, 157);
    CopyPalette(sky, 158);
  } else if (P.GrassCounter === 0) {
    CopyPalette(sky, 153);
    CopyPalette(sky, 154);
    CopyPalette(3, 155);
    CopyPalette(2, 156);
    CopyPalette(2, 157);
    CopyPalette(3, 158);
  }

  P.CoinCounter++;
  if (P.CoinCounter > 3 * CoinSpeed) {
    P.CoinCounter = 0;
    OutPalette(12, 62, 56, 20);
    OutPalette(13, 60, 56, 22);
    OutPalette(14, 63, 63, 36);
  } else if (P.CoinCounter === CoinSpeed) {
    OutPalette(14, 62, 56, 20);
    OutPalette(12, 60, 56, 22);
    OutPalette(13, 63, 63, 36);
  } else if (P.CoinCounter === 2 * CoinSpeed) {
    OutPalette(13, 62, 56, 20);
    OutPalette(14, 60, 56, 22);
    OutPalette(12, 63, 63, 36);
  }
}

export function OutPalette(Color, Red, Green, Blue) {
  if (P.ModifyPalette) {
    Palette[Color * 3] = Red;
    Palette[Color * 3 + 1] = Green;
    Palette[Color * 3 + 2] = Blue;
  }
  Red &= 0xFF; Green &= 0xFF; Blue &= 0xFF;
  if (P.PaletteEffect !== peNoEffect) {
    switch (P.PaletteEffect) {
      case peBlackWhite: {
        const i = Math.trunc((Red + Green + Blue) / 3);
        Red = i; Green = i; Blue = i;
        break;
      }
      case peEGAMode:
        Red &= 0xF0; Green &= 0xF0; Blue &= 0xF0;
        break;
    }
  }
  if (!P.LockPalette) VGA.SetPalette(Color, Red, Green, Blue);
}

export function LockPal() { P.LockPalette = true; }
export function UnLockPal() { P.LockPalette = false; }

export function RefreshPalette(Pal) {
  P.ModifyPalette = false;
  for (let i = 0; i <= 255; i++) OutPalette(i, Pal[i * 3], Pal[i * 3 + 1], Pal[i * 3 + 2]);
  P.ModifyPalette = true;
}
