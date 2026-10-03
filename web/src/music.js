// Port of MUSIC.PAS: tiny PC speaker tunes, one step per frame.
// A tune is a list of (duration, note) pairs: duration in frames, note is an
// index in the chromatic scale (0 = silence), terminated by 0.

import { B } from './buffers.js';
import { Sound, NoSound } from './sound.js';

const n = {};
['c', 'd', 'e', 'f', 'g', 'a', 'b'].forEach((name, k) => {
  const offs = [1, 3, 5, 6, 8, 10, 12][k];
  for (let oct = 0; oct <= 6; oct++) n[`${name}${oct}`] = offs + 12 * oct;
});

const tune = (...a) => a;

export const LifeMusic = tune(1, n.g4, 8, n.c5, 8, n.e5, 8, n.c5, 8, n.d5, 8, n.g5, 8, 0);
export const GrowMusic = tune(1, n.c3, 4, n.g3, 4, n.c4, 4,
  38, 4, 45, 4, 50, 4,
  n.d3, 4, n.a3, 4, n.d4, 4, 0);
export const CoinMusic = tune(1, n.f5, 1, 0);
export const PipeMusic = tune(1, n.c1, 0, n.c1, 8, n.c0, 0, n.c0, 16,
  n.c1, 0, n.c1, 8, n.c0, 0, n.c0, 16,
  n.c1, 0, n.c1, 8, n.c0, 0, n.c0, 16, 0);
export const FireMusic = tune(1, n.e3, 1, n.a3, 1, 0);
export const HitMusic = tune(1, n.c2, 2, n.c1, 3, n.c0, 4, n.c2, 1, n.c1, 2, n.c0, 3, 0);
export const DeadMusic = tune(1, n.c2, 3, n.c1, 4, n.c0, 6, 0);
export const NoteMusic = tune(1, n.c0, 3, n.c1, 2, n.c2, 1, 0);
export const StarMusic = tune(1, n.c3, 4, n.e3, 4, n.g3, 4,
  n.c4, 4, n.e4, 4, n.g4, 4,
  n.c5, 4, n.e5, 4, n.g5, 4, n.c6, 4, 0);

const HALF_NOTE = 1.059463094;
const MAX_OCT = 7;

const aiNote = new Array(MAX_OCT * 12 + 1).fill(0);
{
  let rTmp = HALF_NOTE * 55;
  for (let i = 1; i <= MAX_OCT * 12; i++) {
    aiNote[i] = Math.round(rTmp);
    rTmp *= HALF_NOTE;
  }
}

// sMusic is a Pascal string: index 1..Length
let sMusic = [];
let iPos = 0;

export function StartMusic(S) {
  if (!B.BeeperSound) return;
  sMusic = S.slice();
  iPos = 1;
}

function beep(freq) {
  if (B.BeeperSound) {
    if (freq === 0) NoSound();
    else Sound(freq);
  }
}

export function PlayMusic() {
  if (!B.BeeperSound) return;
  NoSound();
  if (iPos === 0 || iPos > sMusic.length) return;
  let c = sMusic[iPos - 1];
  if (c > 1) sMusic[iPos - 1] = c - 1;
  else {
    iPos++;
    c = sMusic[iPos - 1] ?? 0;
    if (c > 0) beep(aiNote[c]);
    iPos++;
  }
}

export function StopMusic() {
  NoSound();
  sMusic = [];
  iPos = 0;
}

export function PauseMusic() {
  NoSound();
}
