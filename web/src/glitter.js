// Port of GLITTER.PAS: single-pixel sparkles (coins, stars).

import * as VGA from './vga256.js';
import { B, W, H, NH, NV } from './buffers.js';
import { random } from './pascal.js';

const MaxGlitter = 75;

// Count is a string[MaxGlitter]: Count[0] (its length byte) is NumGlitter.
const Count = new Uint8Array(MaxGlitter + 1);
const GlitterList = Array.from({ length: MaxGlitter + 1 }, () => ({
  Attr: 0, Pos: 0, BackGr: [0, 0],
}));

export function ClearGlitter() {
  Count.fill(0);
}

export function NewGlitter(X, Y, NewAttr, Duration) {
  if (X < B.XView || X >= B.XView + NH * W) return;
  let i = 1;
  while (Count[i] > 0 && i < MaxGlitter) i++;
  if (i < MaxGlitter) {
    if (Y < 0 || Y > NV * H) return;
    Count[i] = Duration & 0xFF;
    Count[0] = (Count[0] + 1) & 0xFF;
    const g = GlitterList[i];
    g.Pos = (Y * VGA.VIR_SCREEN_WIDTH + X) & 0xFFFF;
    g.BackGr[0] = 0;
    g.BackGr[1] = 0;
    g.Attr = NewAttr;
  }
}

export function NewStar(X, Y, NewAttr, Duration) {
  NewGlitter(X, Y, NewAttr, Duration + 4);
  NewGlitter(X + 1, Y, NewAttr, Duration);
  NewGlitter(X, Y + 1, NewAttr, Duration);
  NewGlitter(X - 1, Y, NewAttr, Duration);
  NewGlitter(X, Y - 1, NewAttr, Duration);
}

export function ShowGlitter() {
  const pageOffset = VGA.GetPageOffset();
  const page = VGA.CurrentPage();
  if (Count[0] > 0) {
    for (let i = 1; i <= MaxGlitter; i++) {
      const g = GlitterList[i];
      if (Count[i] > VGA.MAX_PAGE + 1) {
        const di = ((g.Pos >>> 2) + pageOffset) & 0xFFFF;
        const pl = VGA.planes[g.Pos & 3];
        g.BackGr[page] = pl[di];
        pl[di] = g.Attr;
      } else if (Count[i] > 0) {
        g.BackGr[page] = 0;
      }
    }
  }
}

export function HideGlitter() {
  const pageOffset = VGA.GetPageOffset();
  if (Count[0] === 0) return;
  const page = VGA.CurrentPage();
  for (let i = MaxGlitter; i >= 1; i--) {
    if (Count[i] > 0) {
      const g = GlitterList[i];
      const bl = g.BackGr[page];
      if (bl !== 0) {
        const di = ((g.Pos >>> 2) + pageOffset) & 0xFFFF;
        VGA.planes[g.Pos & 3][di] = bl;
      }
      Count[i]--;
      if (Count[i] === 0) Count[0] = (Count[0] - 1) & 0xFF;
    }
  }
}

export function CoinGlitter(X, Y) {
  NewStar(X + 5, Y + 2, 0x1F, 20);
  NewStar(X + W - 6, Y + 6, 0x1F, 18);
  NewStar(X + 10, Y + H - 3, 0x1F, 16);
  NewGlitter(X + W - 9, Y + 2, 0x1F, 15);
  NewGlitter(X + 6, Y + 7, 0x1F, 17);
  NewGlitter(X + 3, Y + 9, 0x1F, 15);
}

export function StartGlitter(X, Y, Wd, Ht) {
  NewStar(X + random(Wd), Y + random(Ht), 0x1F, 10 + random(10));
  for (let i = 1; i <= 4; i++)
    NewGlitter(X + random(Wd), Y + random(Ht), 0x1F, 5 + random(10));
}
