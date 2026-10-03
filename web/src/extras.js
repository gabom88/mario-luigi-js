// EXTRAS: optional features that are not part of the original game.

import { setEnhancedSound } from './sound.js';

export const extras = {
  crt: false,
  enhancedSound: false,
  vibration: true,
};

let crtHook = () => {};
export function setCrtHook(fn) { crtHook = fn; }

export function applyExtras() {
  setEnhancedSound(extras.enhancedSound);
  crtHook(extras.crt);
}

// Short vibration on mobile devices (ignored where unsupported)
export function vibrate(pattern) {
  if (!extras.vibration || extras.suppress) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // not allowed (no user gesture yet) or unsupported
  }
}

export async function toggleFullscreen() {
  const d = document;
  const el = d.documentElement;
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      await (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    } else {
      await (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    }
  } catch {
    // fullscreen not available (e.g. iPhone Safari outside the installed app)
  }
}
