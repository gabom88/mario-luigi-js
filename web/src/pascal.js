// Small helpers that reproduce Turbo Pascal 7 runtime behaviour.

export const ch = (s) => s.charCodeAt(0);

// Pascal 'div' and 'mod' truncate towards zero, like JS for integers.
export const div = (a, b) => Math.trunc(a / b);

// Round: halves away from zero (software real, $N-).
export function round(x) {
  return x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
}

export const byte = (b) => (b ? 1 : 0);

export const toInt16 = (v) => (v << 16) >> 16;
export const toByte = (v) => v & 0xFF;
export const toShortInt = (v) => (v << 24) >> 24;

// --- Random: TP7 linear congruential generator ------------------------------

let randSeed = 0;

export function getRandSeed() { return randSeed; }
export function setRandSeed(v) { randSeed = v >>> 0; }

function nextRand() {
  randSeed = (Math.imul(randSeed, 134775813) + 1) >>> 0;
  return randSeed;
}

// Random(Range): high word of the new seed times Range, high word of result.
export function random(range) {
  nextRand();
  return ((randSeed >>> 16) * (range & 0xFFFF)) >>> 16;
}

export function randomize() {
  setRandSeed(Date.now() & 0xFFFFFFFF);
}

// --- Crt -------------------------------------------------------------------

export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Str(N: Width, S)
export function strWidth(n, width) {
  return String(n).padStart(width, ' ');
}
