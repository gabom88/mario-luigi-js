// Browser entry point: canvas output, start screen and game boot.

import * as VGA from './vga256.js';
import { initAudio } from './sound.js';
import { Main } from './mario.js';
import { getPlaytest } from './levels.js';
import { initUI, openPanel } from './ui.js';
import { PS } from './play.js';
import { InitKeyBoard, setActionHandler } from './keyboard.js';
import { setCrtHook, toggleFullscreen } from './extras.js';

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { alpha: false });

// The emulated VGA output (320x200) is drawn to a small offscreen canvas.
const small = document.createElement('canvas');
small.width = VGA.SCREEN_WIDTH;
small.height = VGA.SCREEN_HEIGHT;
const sctx = small.getContext('2d', { alpha: false });
const image = sctx.createImageData(VGA.SCREEN_WIDTH, VGA.SCREEN_HEIGHT);
const out32 = new Uint32Array(image.data.buffer);

// Scaling modes:
//  'sharp': integer nearest-neighbour upscale to about the display size,
//           then the browser filters the last (non integer) step. All
//           pixels keep the same size, so scrolling does not shimmer.
//  'pixel': plain nearest-neighbour; crisper but with uneven pixel widths.
let scaleMode = 'sharp';
let factor = 1;

function setScaleMode(m) {
  scaleMode = m === 'pixel' ? 'pixel' : 'sharp';
  fit();
}

function present() {
  VGA.renderFrame(out32);
  sctx.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
}

const crt = document.getElementById('crt');

function setCrt(on) {
  document.body.classList.toggle('crt-on', on);
}

function fit() {
  // 320x200 pixels on a 4:3 screen, like on a VGA monitor. In portrait the
  // screen goes to the top, leaving the lower part for the touch controls.
  const maxW = window.innerWidth;
  const maxH = window.innerHeight;
  document.body.classList.toggle('portrait', maxH > maxW * 1.1);
  let w = maxW;
  let h = Math.round((w * 3) / 4);
  if (h > maxH) {
    h = maxH;
    w = Math.round((h * 4) / 3);
  }
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  crt.style.width = `${w}px`;
  crt.style.height = `${h}px`;
  crt.style.setProperty('--line', `${h / VGA.SCREEN_HEIGHT}px`);
  const dpr = window.devicePixelRatio || 1;
  factor = scaleMode === 'sharp'
    ? Math.max(1, Math.ceil((h * dpr) / VGA.SCREEN_HEIGHT))
    : 1;
  canvas.width = VGA.SCREEN_WIDTH * factor;
  canvas.height = VGA.SCREEN_HEIGHT * factor;
  canvas.style.imageRendering = scaleMode === 'sharp' ? 'auto' : 'pixelated';
  present();
}

window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 200));
fit();
VGA.setPresentHook(present);

// index.html?test=1: play test of the level being edited in the editor
const testLevel = new URLSearchParams(location.search).has('test') ? getPlaytest() : null;

function start() {
  initAudio();
  Main(testLevel).then(() => {
    if (testLevel) location.href = 'editor.html';
  }).catch((e) => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend',
      `<pre class="error">${String(e && e.stack ? e.stack : e)}</pre>`);
  });
}

InitKeyBoard();
setCrtHook(setCrt);
setActionHandler('fullscreen', toggleFullscreen);
initUI(start, { setScaleMode, testMode: !!testLevel });
// END in the title menu: a browser game cannot close, it opens the settings
PS.onEnd = openPanel;
window.addEventListener('pointerdown', () => initAudio());

// Installable app: offline cache (needs https or localhost)
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker:', e));
  });
}

// Debug helpers (console): MARIO.vga, MARIO.fast(true)
window.MARIO = { vga: VGA, fast: VGA.setTurboClock };
