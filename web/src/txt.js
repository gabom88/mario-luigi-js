// Port of TXT.PAS: bitmap fonts.

import * as VGA from './vga256.js';
import { B } from './buffers.js';
import { SWISSFONT, FONT8X8 } from './data.js';

export const Normal = 0x00;
export const Bold = 0x01;
export const Shadow = 0x02;

let bShadow = false;
let bBold = false;
let Font = FONT8X8;
let Base = 0;

const toCodes = (S) => (typeof S === 'string' ? Array.from(S, (c) => c.charCodeAt(0)) : S);

export function SetFont(i, Style) {
  switch (i) {
    case 0: Font = FONT8X8; Base = 0; break;
    case 1: Font = SWISSFONT; Base = 32; break;
  }
  bBold = (Style | Bold) === Style;
  bShadow = (Style | Shadow) === Style;
}

export function Letter(i) {
  return Font[i - Base] ?? new Uint8Array([0, 0]);
}

export function TextWidth(S) {
  let width = 0;
  for (const c of toCodes(S)) {
    width += Letter(c)[0];
    width += (bBold ? 1 : 0) + (bShadow ? 1 : 0);
  }
  return width;
}

export function WriteText(X, Y, S, Attr) {
  const codes = toCodes(S);
  let i = 0;
  do {
    const C = codes[i] ?? 0;
    const L = Letter(C);
    if (bShadow) VGA.DrawBitmap(X + 1, Y + 1, L, 16);
    if (bBold) {
      if (bShadow) VGA.DrawBitmap(X, Y + 1, L, 16);
      VGA.DrawBitmap(X - 1, Y, L, Attr);
    }
    VGA.DrawBitmap(X, Y, L, Attr);
    X += TextWidth([C]);
    i++;
  } while (i < codes.length);
}

export function CenterX(S) {
  return B.XView + ((VGA.SCREEN_WIDTH - TextWidth(S)) >> 1);
}

export function CenterText(Y, S, Attr) {
  WriteText(CenterX(S), Y, S, Attr);
}
