// PC speaker emulation (Crt.Sound / Crt.NoSound) with Web Audio.
//
// Two modes:
//  - original: one square wave, switched on and off exactly like the
//    speaker (the game's tunes are short blips of one frame each).
//  - enhanced: every new tone starts a short "note" with an envelope that
//    rings out after NoSound, through a low-pass filter and a soft echo.

let ctx = null;
let osc = null;
let gain = null;
let current = 0;
let enhanced = false;

// Audio timeline. The game switches the speaker on and off once per frame
// (about 14 ms). On phones ctx.currentTime advances in big steps (20-40 ms),
// so scheduling at "currentTime" put the on and off of a note at the same
// instant and the note was never heard. Events are placed on a timeline
// driven by the real clock instead, slightly in the future.
const LOOKAHEAD = 0.05;
let audioBase = 0;
let perfBase = 0;

let lastWhen = 0;

function when() {
  let t = audioBase + (performance.now() - perfBase) / 1000 + LOOKAHEAD;
  const now = ctx.currentTime;
  if (t < now + 0.005 || t > now + 0.25) { // drifted: resynchronise
    audioBase = now;
    perfBase = performance.now();
    t = now + LOOKAHEAD;
  }
  // never schedule before an earlier event (keeps on/off in order)
  lastWhen = Math.max(t, lastWhen);
  return lastWhen;
}

// enhanced mode
let bus = null;
let voices = [];
let lastFreq = 0;
let silent = true;

export function setEnhancedSound(v) {
  enhanced = !!v;
  if (gain && ctx) gain.gain.setValueAtTime(0, when());
  current = 0;
}

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  audioBase = ctx.currentTime;
  perfBase = performance.now();

  // original speaker
  gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 440;
  osc.connect(gain);
  osc.start();

  // enhanced: filter -> (dry + echo) -> master
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 3200;
  filter.Q.value = 0.7;
  filter.connect(master);
  const delay = ctx.createDelay(0.5);
  delay.delayTime.value = 0.11;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.22;
  const wet = ctx.createGain();
  wet.gain.value = 0.25;
  filter.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(master);
  bus = filter;
}

function playNote(freq) {
  const t = when();
  const o = ctx.createOscillator();
  // a pulse-ish timbre: square for low notes, triangle for high pitches
  o.type = freq < 700 ? 'square' : 'triangle';
  o.frequency.setValueAtTime(freq, t);
  const g = ctx.createGain();
  const peak = freq < 700 ? 0.05 : 0.09;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0005, t + 0.22);
  o.connect(g);
  g.connect(bus);
  o.start(t);
  o.stop(t + 0.25);
  voices.push(o);
  o.onended = () => {
    voices = voices.filter((v) => v !== o);
    g.disconnect();
  };
  if (voices.length > 10) voices[0].stop();
}

export function Sound(freq) {
  if (!ctx) return;
  if (freq < 20) freq = 20;
  if (enhanced) {
    // a new tone after silence or a change of pitch starts a new note
    if (silent || freq !== lastFreq) playNote(Math.min(freq, 12000));
    lastFreq = freq;
    silent = false;
    return;
  }
  const t = when();
  osc.frequency.setValueAtTime(Math.min(freq, 20000), t);
  gain.gain.setValueAtTime(0.06, t);
  current = freq;
}

export function NoSound() {
  if (!ctx) return;
  if (enhanced) {
    silent = true;
    return;
  }
  if (current === 0) return;
  gain.gain.setValueAtTime(0, when());
  current = 0;
}
