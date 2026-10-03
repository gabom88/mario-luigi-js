// Port of VGA256.PAS: an emulation of the unchained ("mode X") VGA setup the
// game uses: 320x200 256 colors, 4 planes of 64 KB, 360 pixel wide virtual
// screen, two pages, hardware scrolling, write-mode-1 latch copies.
//
// All drawing routines reproduce the byte layout and address arithmetic of
// the original assembler, including 16-bit address wrap-around, so the rest
// of the game (which relies on those details) can be translated literally.

export const VGA_SEGMENT = 0xA000;

export const WINDOWHEIGHT = 13 * 14;
export const WINDOWWIDTH = 16 * 20;

export const SCREEN_WIDTH = 320;
export const SCREEN_HEIGHT = 200;

export const VIR_SCREEN_WIDTH = SCREEN_WIDTH + 2 * 20;
export const VIR_SCREEN_HEIGHT = 182;
export const BYTES_PER_LINE = VIR_SCREEN_WIDTH >> 2; // 90

export const MAX_SCREENS = 24;
export const MAX_PAGE = 1;
export const PAGE_SIZE = (VIR_SCREEN_HEIGHT + MAX_SCREENS) * BYTES_PER_LINE;
export const PAGE_0 = 0;
export const PAGE_1 = 0x8000;

export const YBASE = 9;

const SAFE = 34 * BYTES_PER_LINE;

// ---------------------------------------------------------------------------
// Hardware state

export const planes = [0, 1, 2, 3].map(() => new Uint8Array(0x10000));

// DAC: 256 colors x RGB, 6 bits per component.
export const dac = new Uint8Array(768);

const crtc = {
  start: 0,       // display start address (bytes)
  pan: 0,         // horizontal pel panning in pixels (0..3)
  blankStart: 200 // first display line hidden by vertical blanking
};

let page = 0;
let pageOffset = 0;
let yOffset = 0;
let viewX = 0;
let viewY = 0;

export let InGraphicsMode = false;

const u16 = (v) => v & 0xFFFF;
const lineAddr = (y) => u16(Math.imul(y, BYTES_PER_LINE));

// ---------------------------------------------------------------------------
// Timing: the original synchronises everything on the 70 Hz vertical retrace.
//
// Two clocks are available:
//  - 'smooth'  : one game frame per monitor refresh (or per 2 refreshes on
//                120/144 Hz screens). Scrolling is perfectly smooth; on a
//                60 Hz monitor the game runs at 60/70 of the original speed.
//  - 'original': exactly 70 frames per second, like a VGA monitor. On a
//                60 Hz screen one frame in seven is never shown (judder).
// Display start address and pel panning are latched together at the
// retrace, so a frame is never shown with a half-updated scroll position.

export const RETRACE_HZ = 70;
const PERIOD = 1000 / RETRACE_HZ;
let nextTick = 0;
let frameCounter = 0;
export let turboClock = false; // run as fast as possible (debug / tests)
let clockMode = 'smooth';
let waiters = [];
let pendingCrtc = null;
let timerPending = false;
let presentHook = null;
const hasRAF = typeof requestAnimationFrame === 'function';

export function setTurboClock(v) {
  turboClock = v;
  if (v && waiters.length) scheduleTimer();
}
export function setClockMode(m) {
  clockMode = m === 'original' ? 'original' : 'smooth';
  if (clockMode === 'original' && waiters.length) scheduleTimer();
}
export function getClockMode() { return clockMode; }
// Called with no arguments every time the display should be redrawn.
export function setPresentHook(fn) {
  presentHook = fn;
  if (hasRAF) requestAnimationFrame(rafLoop);
}

function retraceTick() {
  if (pendingCrtc) {
    crtc.start = pendingCrtc.start;
    crtc.pan = pendingCrtc.pan;
    pendingCrtc = null;
  }
  frameCounter++;
  const w = waiters;
  waiters = [];
  for (const r of w) r();
}

function scheduleTimer() {
  if (timerPending) return;
  timerPending = true;
  const now = performance.now();
  if (nextTick < now - 4 * PERIOD) nextTick = now;
  nextTick += PERIOD;
  const delay = turboClock ? 0 : Math.max(0, nextTick - now);
  setTimeout(() => {
    timerPending = false;
    retraceTick();
  }, delay);
}

// Monitor refresh measurement for the smooth clock
let lastRaf = 0;
let avgInterval = 1000 / 60;
let vsyncCount = 0;

function rafLoop(t) {
  if (lastRaf) {
    const d = t - lastRaf;
    if (d > 2 && d < 50) avgInterval += (d - avgInterval) * 0.05;
  }
  lastRaf = t;
  if (clockMode === 'smooth' && !turboClock && waiters.length) {
    const perTick = Math.max(1, Math.round(1000 / avgInterval / RETRACE_HZ));
    vsyncCount++;
    if (vsyncCount >= perTick) {
      vsyncCount = 0;
      retraceTick();
    }
  }
  if (presentHook) presentHook();
  requestAnimationFrame(rafLoop);
}

export function waitRetrace() {
  return new Promise((resolve) => {
    waiters.push(resolve);
    if (!presentHook || !hasRAF || turboClock || clockMode === 'original') scheduleTimer();
  });
}

export function getFrameCounter() { return frameCounter; }

export function WaitDisplay() { /* display is never "in retrace" between frames */ }

export async function WaitRetrace() {
  await waitRetrace();
}

// ---------------------------------------------------------------------------

export function DetectVGA() { return true; }

export function InitVGA() {
  ClearPalette();
  ClearVGAMem();
  InGraphicsMode = true;
}

export function OldMode() {
  ClearVGAMem();
  ClearPalette();
  InGraphicsMode = false;
}

export function ClearVGAMem() {
  for (const p of planes) p.fill(0);
}

export function SetView(X, Y) {
  viewX = X;
  viewY = Y;
}

export async function SetViewport(X, Y, PageNr) {
  X = u16(X << 1);
  Y = u16(Y << 1);
  let bx = u16(Math.imul(Y, BYTES_PER_LINE >> 1) + (X >>> 3));
  bx = u16(bx + ((PageNr & 1) << 15));
  pendingCrtc = { start: bx, pan: (X & 7) >> 1 };
  await waitRetrace();
}

export function SwapPages() {
  if (page === 0) {
    page = 1;
    pageOffset = u16(PAGE_1 + yOffset * BYTES_PER_LINE);
  } else {
    page = 0;
    pageOffset = u16(PAGE_0 + yOffset * BYTES_PER_LINE);
  }
}

export async function ShowPage() {
  await SetViewport(viewX, viewY, page);
  SwapPages();
}

export function Border(_attr) {}

// Vertical blanking start/end (CRTC registers 15h/16h). Only the "end of
// display" effect matters: the game blanks the lines below the play field.
export function SetYStart(_v) {}

export function SetYEnd(v) {
  crtc.blankStart = Math.min(200, Math.ceil((0x100 + (v & 0xFF)) / 2));
}

export function SetYOffset(v) { yOffset = v; }
export function GetYOffset() { return yOffset; }

export function CurrentPage() { return page; }
export function GetPageOffset() { return pageOffset; }

// ---------------------------------------------------------------------------
// Pixels

export function PutPixel(X, Y, Attr) {
  const di = u16(lineAddr(Y) + (u16(X) >>> 2) + pageOffset);
  planes[X & 3][di] = Attr;
}

export function GetPixel(X, Y) {
  const si = u16(lineAddr(Y) + (u16(X) >>> 2) + pageOffset);
  return planes[X & 3][si];
}

// Same as PutPixel but with an explicit page offset (used by DrawBitmap).
function putPixelAt(X, Y, Attr, offset) {
  const di = u16(lineAddr(Y) + (u16(X) >>> 2) + offset);
  planes[X & 3][di] = Attr;
}

// Clip test shared by DrawImage, RecolorImage, DrawPart, UpSideDown.
function skipY(YPos, Height) {
  const y = u16(YPos);
  if (y < VIR_SCREEN_HEIGHT) return false;
  if (YPos > VIR_SCREEN_HEIGHT) return true;
  // YPos negative (or exactly VIR_SCREEN_HEIGHT): draw only if the sum carries
  return y + u16(Height) <= 0xFFFF;
}

// Generic planar blit. Bitmap layout: for each of the 4 planes (starting with
// the plane of XPos), Height lines of Width/4 bytes.
// mode: 0 = transparent (skip 0), 1 = opaque, 2 = transparent + recolor
function blit(XPos, YPos, Width, Height, bmp, mode, diff, y1, y2, upsideDown) {
  let di = u16(lineAddr(upsideDown ? YPos + Height - 1 : YPos) + (u16(XPos) >>> 2) + pageOffset);
  let plane = XPos & 3;
  const bpl = u16(Width) >>> 2;
  const h = u16(Height) || 0x10000;
  let si = 0;
  for (let k = 0; k < 4; k++) {
    const pl = planes[plane];
    let d = di;
    for (let line = 0; line < h; line++) {
      if (y1 !== undefined && (line < y1 || line > y2)) {
        si += bpl;
        d = u16(d + BYTES_PER_LINE);
        continue;
      }
      for (let i = 0; i < bpl; i++) {
        const v = bmp[si++];
        if (mode === 1) pl[u16(d + i)] = v;
        else if (v !== 0) pl[u16(d + i)] = mode === 2 ? (v + diff) & 0xFF : v;
      }
      d = u16(upsideDown ? d - BYTES_PER_LINE : d + BYTES_PER_LINE);
    }
    plane++;
    if (plane === 4) {
      plane = 0;
      di = u16(di + 1);
    }
  }
}

export function DrawImage(XPos, YPos, Width, Height, BitMap) {
  if (skipY(YPos, Height)) return;
  blit(XPos, YPos, Width, Height, BitMap, 0, 0);
}

export function RecolorImage(XPos, YPos, Width, Height, BitMap, Diff) {
  if (skipY(YPos, Height)) return;
  blit(XPos, YPos, Width, Height, BitMap, 2, Diff & 0xFF);
}

export function DrawPart(XPos, YPos, Width, Height, Y1, Y2, BitMap) {
  if (Height <= 0) return;
  if (skipY(YPos, Height)) return;
  blit(XPos, YPos, Width, Height, BitMap, 0, 0, Y1, Y2);
}

export function UpSideDown(XPos, YPos, Width, Height, BitMap) {
  if (skipY(YPos, Height)) return;
  blit(XPos, YPos, Width, Height, BitMap, 0, 0, undefined, undefined, true);
}

export function PutImage(XPos, YPos, Width, Height, BitMap) {
  blit(XPos, YPos, Width, Height, BitMap, 1, 0);
}

export function GetImage(XPos, YPos, Width, Height, BitMap) {
  let si = u16(lineAddr(YPos) + (u16(XPos) >>> 2) + pageOffset);
  let plane = XPos & 3;
  const bpl = u16(Width) >>> 2;
  let di = 0;
  for (let k = 0; k < 4; k++) {
    const pl = planes[plane];
    let s = si;
    for (let line = 0; line < Height; line++) {
      for (let i = 0; i < bpl; i++) BitMap[di++] = pl[u16(s + i)];
      s = u16(s + BYTES_PER_LINE);
    }
    plane++;
    if (plane === 4) {
      plane = 0;
      si = u16(si + 1);
    }
  }
}

export function Fill(X, Y, W, H, Attr) {
  if (H === 0 || W === 0) return;
  const a = Attr & 0xFF;
  const h = u16(H);
  const w = u16(W);
  for (let y = 0; y < h; y++) {
    const base = u16(lineAddr(Y + y) + pageOffset);
    for (let x = 0; x < w; x++) {
      const px = X + x;
      planes[px & 3][u16(base + (u16(px) >>> 2))] = a;
    }
  }
}

// ---------------------------------------------------------------------------
// Palette (DAC)

export function SetPalette(Color, Red, Green, Blue) {
  const i = (Color & 0xFF) * 3;
  dac[i] = Red & 0x3F;
  dac[i + 1] = Green & 0x3F;
  dac[i + 2] = Blue & 0x3F;
}

// Loads a complete palette (768 bytes) into the DAC.
export function ReadPalette(P) {
  for (let i = 0; i < 768; i++) dac[i] = P[i] & 0x3F;
}

export function ClearPalette() {
  dac.fill(0);
}

// ---------------------------------------------------------------------------
// Background save stack in unused video memory (write mode 1 latch copies)

// The original keeps the saved backgrounds in the unused video memory after
// each page (about 11 KB). With many sprites on screen (e.g. 20+ Koopas)
// that space overflows into the other page and the screen gets corrupted.
// Here the saved backgrounds live in ordinary memory, with no limit, but
// with the same behaviour: ResetStack only rewinds the stack pointer, the
// data stays until it is overwritten (the title menu relies on that).
const savedBack = [[], []];
const stackTop = [0, 0];

export function ResetStack() {
  stackTop[0] = 0;
  stackTop[1] = 0;
}

// Returns a non-zero handle (never $FFFF) or 0 when nothing was saved
export function PushBackGr(X, Y, W, H) {
  if (!((Y + H >= 0) && (Y < 200))) return 0;
  const cx = u16(W) >>> 2;
  const h = u16(H) || 0x10000;
  const slot = stackTop[page]++;
  let e = savedBack[page][slot];
  const size = cx * h;
  if (!e || e.data.length < size * 4) {
    e = { data: new Uint8Array(size * 4) };
    savedBack[page][slot] = e;
  }
  e.X = X; e.Y = Y; e.cx = cx; e.h = h;
  let si = u16(lineAddr(Y) + (u16(X) >>> 2) + pageOffset);
  const [p0, p1, p2, p3] = planes;
  const d = e.data;
  let o = 0;
  for (let line = 0; line < h; line++) {
    for (let i = 0; i < cx; i++) {
      const s = u16(si + i);
      d[o++] = p0[s]; d[o++] = p1[s]; d[o++] = p2[s]; d[o++] = p3[s];
    }
    si = u16(si + BYTES_PER_LINE);
  }
  return (page << 15) | (slot + 1);
}

export function PopBackGr(Address) {
  if (Address === 0) return;
  const e = savedBack[(Address >> 15) & 1][(Address & 0x7FFF) - 1];
  if (!e) return;
  let di = u16(lineAddr(e.Y) + (u16(e.X) >>> 2) + pageOffset);
  const [p0, p1, p2, p3] = planes;
  const d = e.data;
  let o = 0;
  for (let line = 0; line < e.h; line++) {
    for (let i = 0; i < e.cx; i++) {
      const t = u16(di + i);
      p0[t] = d[o++]; p1[t] = d[o++]; p2[t] = d[o++]; p3[t] = d[o++];
    }
    di = u16(di + BYTES_PER_LINE);
  }
}

// Draws a 1-bit bitmap (font glyph): width, height, then LSB-first bits.
export function DrawBitmap(X, Y, BitMap, Attr) {
  const offset = pageOffset;
  const W = BitMap[0];
  const H = BitMap[1];
  let si = 2;
  let bits = 0;
  let count = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (count === 0) {
        bits = BitMap[si++] ?? 0;
        count = 8;
      }
      count--;
      if (bits & 1) putPixelAt(X + x, Y + y, Attr, offset);
      bits >>= 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Display: converts the visible part of video memory to RGBA.

const rgba = new Uint32Array(256);

export function renderFrame(out32) {
  for (let i = 0; i < 256; i++) {
    const r = dac[i * 3], g = dac[i * 3 + 1], b = dac[i * 3 + 2];
    const R = (r << 2) | (r >> 4), G = (g << 2) | (g >> 4), B = (b << 2) | (b >> 4);
    rgba[i] = 0xFF000000 | (B << 16) | (G << 8) | R;
  }
  const black = 0xFF000000;
  const start = crtc.start;
  const pan = crtc.pan;
  const p0 = planes[0], p1 = planes[1], p2 = planes[2], p3 = planes[3];
  const pl = [p0, p1, p2, p3];
  let o = 0;
  for (let y = 0; y < SCREEN_HEIGHT; y++) {
    if (y >= crtc.blankStart) {
      out32.fill(black, o, o + SCREEN_WIDTH);
      o += SCREEN_WIDTH;
      continue;
    }
    const base = start + y * BYTES_PER_LINE;
    for (let x = 0; x < SCREEN_WIDTH; x++) {
      const n = x + pan;
      out32[o++] = rgba[pl[n & 3][(base + (n >> 2)) & 0xFFFF]];
    }
  }
}
