// Draws an area with the game engine itself (BuildWorld + Redraw into the
// emulated VGA memory), so the editor shows exactly what the game shows,
// including the automatic edges of the ground.

import * as VGA from '../vga256.js';
import { B, WorldMap, ReadWorld, NV, W, H } from '../buffers.js';
import {
  InitSky, InitWalls, InitPipes, BuildWorld, Redraw, SetSkyPalette, FigList,
} from '../figures.js';
import { InitBackGr, DrawPalBackGr } from '../backgr.js';
import { Palette, P256, NewPalette, InitGrass, BlinkPalette, P as PalState } from '../palettes.js';
import { areaToEngine } from '../levels.js';

export { FigList };

// Current palette as 32-bit RGBA (little endian ABGR)
export const rgba = new Uint32Array(256);

function updateRgba() {
  for (let i = 0; i < 256; i++) {
    const c = (k) => { const v = Palette[i * 3 + k] & 63; return (v << 2) | (v >> 4); };
    rgba[i] = 0xFF000000 | (c(2) << 16) | (c(1) << 8) | c(0);
  }
}

// Loads the area into the engine. Full = also sky, walls, colours (needed
// after the options changed); otherwise only the map is rebuilt.
export function loadArea(area, full = true) {
  const { map, options } = areaToEngine(area);
  ReadWorld(map, WorldMap, options);
  const o = B.Options;
  if (full) {
    InitSky(o.SkyType);
    InitWalls(o.WallType1, o.WallType2, o.WallType3);
    InitPipes(o.PipeColor);
    InitBackGr(o.BackGrType, 0);
  }
  BuildWorld();
  if (full) {
    PalState.LockPalette = true; // the editor never touches the DAC
    NewPalette(P256);
    for (let i = 1; i <= 100; i++) BlinkPalette();
    SetSkyPalette();
    B.XView = 0;
    B.LastXView[0] = 0;
    B.LastXView[1] = 0;
    DrawPalBackGr();
    InitGrass();
    updateRgba();
  }
}

// Renders columns [x0, x1) of the loaded area into out32 (width outW px,
// height NV * H px). The engine draws 16 columns at a time: with 2 extra
// columns that is exactly the 360 pixel wide virtual screen, so no two
// pixels share video memory.
export function renderColumns(x0, x1, out32, outW) {
  const start = Math.max(0, Math.floor(x0 / 16) * 16);
  for (let s = start; s < x1; s += 16) {
    for (let X = s - 1; X <= s + 16; X++)
      for (let Y = 0; Y < NV; Y++) Redraw(X, Y);
    const px0 = s * W;
    const px1 = Math.min((s + 16) * W, outW);
    for (let y = 0; y < NV * H; y++) {
      const row = y * outW;
      for (let px = px0; px < px1; px++) out32[row + px] = rgba[VGA.GetPixel(px, y)];
    }
  }
}

// Decodes a planar sprite (VGA 4-plane layout) to RGBA pixels
export function spriteToImageData(data, w, h, mirror = false) {
  const img = new ImageData(w, h);
  const out = new Uint32Array(img.data.buffer);
  const bpl = w >> 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = mirror ? w - 1 - x : x;
      const c = data[(sx & 3) * h * bpl + y * bpl + (sx >> 2)];
      if (c) out[y * w + x] = rgba[c];
    }
  return img;
}
