// Port of KEYBOARD.PAS. The original installs an INT 9 handler that stores
// the last scan code in Key and tracks 9 keys in KeyMap. Here browser key
// events are translated to PC scan codes (set 1).

import { MACRO } from './data.js';
import { setRandSeed } from './pascal.js';

export const kb1 = 2, kb2 = 3, kb3 = 4, kb4 = 5, kb5 = 6, kb6 = 7, kb7 = 8, kb8 = 9, kb9 = 10, kb0 = 11;
export const kbQ = 16, kbW = 17, kbE = 18, kbR = 19, kbT = 20, kbY = 21, kbU = 22, kbI = 23, kbO = 24, kbP = 25;
export const kbA = 30, kbS = 31, kbD = 32, kbF = 33, kbG = 34, kbH = 35, kbJ = 36, kbK = 37, kbL = 38;
export const kbZ = 44, kbX = 45, kbC = 46, kbV = 47, kbB = 48, kbN = 49, kbM = 50;

export const kbEsc = 1;
export const kbBS = 14;
export const kbTab = 15;
export const kbEnter = 28;
export const kbSP = 57;
export const kbUpArrow = 72;
export const kbLeftArrow = 75;
export const kbRightArrow = 77;
export const kbDownArrow = 80;

// menuMode: the title menu is active (touch arrows navigate it)
export const K = { Key: 0, menuMode: false, cheatMode: false };

const MaxKeys = 9;
const keyLeft = 1, keyRight = 2, keyUp = 3, keyDown = 4, keyAlt = 5,
  keyCtrl = 6, keyShiftL = 7, keyShiftR = 8, keySpace = 9;

const MAX_SEQ_LEN = 100;

const Sequence = Array.from({ length: MaxKeys + 1 }, () => new Uint16Array(MAX_SEQ_LEN));
const SeqPos = new Uint16Array(MaxKeys + 1);

let Recording = false;
let Playing = false;

const KeyMap = new Array(MaxKeys + 1).fill(false);
const PressCode = [0, 0x4B, 0x4D, 0x48, 0x50, 0x38, 0x1D, 0x2A, 0x36, 0x39];

let KeyHit = false;

// KeyboardEvent.code -> scan code
const SCAN = {
  Escape: 1, Digit1: 2, Digit2: 3, Digit3: 4, Digit4: 5, Digit5: 6, Digit6: 7,
  Digit7: 8, Digit8: 9, Digit9: 10, Digit0: 11, Minus: 12, Equal: 13,
  Backspace: 14, Tab: 15, KeyQ: 16, KeyW: 17, KeyE: 18, KeyR: 19, KeyT: 20,
  KeyY: 21, KeyU: 22, KeyI: 23, KeyO: 24, KeyP: 25, BracketLeft: 26,
  BracketRight: 27, Enter: 28, NumpadEnter: 28, ControlLeft: 29, ControlRight: 29,
  KeyA: 30, KeyS: 31, KeyD: 32, KeyF: 33, KeyG: 34, KeyH: 35, KeyJ: 36,
  KeyK: 37, KeyL: 38, Semicolon: 39, Quote: 40, Backquote: 41, ShiftLeft: 42,
  Backslash: 43, KeyZ: 44, KeyX: 45, KeyC: 46, KeyV: 47, KeyB: 48, KeyN: 49,
  KeyM: 50, Comma: 51, Period: 52, Slash: 53, ShiftRight: 54, AltLeft: 56,
  AltRight: 56, Space: 57, F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64,
  F7: 65, F8: 66, F9: 67, F10: 68, ArrowUp: 72, ArrowLeft: 75, ArrowRight: 77,
  ArrowDown: 80, Numpad8: 72, Numpad4: 75, Numpad6: 77, Numpad2: 80,
  Pause: 0x45,
};

// --- Remappable game actions ------------------------------------------------
// Each action is a key of the original game (its scan code). Any browser key
// (or touch button) bound to an action presses that original key. A key can
// be bound to several actions (e.g. run and fire on the same key, NES style).

export const ACTIONS = [
  { id: 'left', label: 'Izquierda', scan: 0x4B },
  { id: 'right', label: 'Derecha', scan: 0x4D },
  { id: 'up', label: 'Arriba', scan: 0x48 },
  { id: 'down', label: 'Abajo', scan: 0x50 },
  { id: 'jump', label: 'Saltar', scan: 0x38 },
  { id: 'run', label: 'Correr', scan: 0x1D },
  { id: 'fire', label: 'Disparar', scan: 0x39 },
  // Player 2 in VERSUS: not keys of the original, read through p2Keys()
  { id: 'left2', label: 'Izquierda', p2: 'left', group: 'Player 2 (START VERSUS)' },
  { id: 'right2', label: 'Derecha', p2: 'right', group: 'Player 2 (START VERSUS)' },
  { id: 'up2', label: 'Arriba', p2: 'up', group: 'Player 2 (START VERSUS)' },
  { id: 'down2', label: 'Abajo', p2: 'down', group: 'Player 2 (START VERSUS)' },
  { id: 'jump2', label: 'Saltar', p2: 'jump', group: 'Player 2 (START VERSUS)' },
  { id: 'run2', label: 'Correr', p2: 'run', group: 'Player 2 (START VERSUS)' },
  { id: 'fire2', label: 'Disparar', p2: 'fire', group: 'Player 2 (START VERSUS)' },
  // System keys of the original (they never move Mario)
  { id: 'accept', label: 'Aceptar (menús)', scan: 28, sys: true },
  { id: 'pause', label: 'Pausa', scan: 25, sys: true },
  { id: 'status', label: 'Marcador', scan: 31, sys: true },
  { id: 'sound', label: 'Sonido', scan: 16, sys: true },
  { id: 'quit', label: 'Salir / atrás', scan: 1, sys: true },
  // Not a key of the original game: handled by the browser front end
  { id: 'fullscreen', label: 'Pantalla completa', scan: null, sys: true },
];

const handlers = {};
// Function called when an action without a scan code is pressed
export function setActionHandler(id, fn) {
  handlers[id] = fn;
}

export const DEFAULT_BINDINGS = {
  left: ['KeyA', null],
  right: ['KeyD', null],
  up: ['KeyW', null],
  down: ['KeyS', null],
  jump: ['KeyM', null],
  run: ['KeyN', null],
  fire: ['KeyN', null],
  left2: ['ArrowLeft', null],
  right2: ['ArrowRight', null],
  up2: ['ArrowUp', null],
  down2: ['ArrowDown', null],
  jump2: ['Period', 'Numpad0'],
  run2: ['Comma', 'NumpadDecimal'],
  fire2: ['Comma', 'NumpadDecimal'],
  accept: ['Enter', 'NumpadEnter'],
  pause: ['KeyP', null],
  status: ['KeyI', null],
  sound: ['KeyQ', null],
  quit: ['Escape', null],
  fullscreen: ['KeyF', null],
};

let bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));

export function getBindings() {
  return JSON.parse(JSON.stringify(bindings));
}

export function setBindings(b) {
  releaseAll();
  bindings = JSON.parse(JSON.stringify(b));
}

function actionsForCode(code) {
  return ACTIONS.filter((a) => (bindings[a.id] || []).includes(code));
}

// Scan codes that drive the game's KeyMap: only bound keys may set them.
const ACTION_SCANS = new Set(ACTIONS.filter((a) => !a.sys && a.scan != null).map((a) => a.scan));
const SYS_SCANS = new Set(ACTIONS.filter((a) => a.sys && a.scan != null).map((a) => a.scan));

// action id -> set of sources (key codes, touch pointers) holding it
const active = new Map(ACTIONS.map((a) => [a.id, new Set()]));

// Keys held by player 2 (VERSUS)
const P2 = { left: false, right: false, up: false, down: false, jump: false, run: false, fire: false };
export function p2Keys() {
  return P2;
}

export function setAction(id, source, pressed) {
  const set = active.get(id);
  if (!set) return;
  const { scan, sys, p2 } = ACTIONS.find((a) => a.id === id);
  const was = set.size > 0;
  if (pressed) set.add(source);
  else set.delete(source);
  if (p2) {
    P2[p2] = set.size > 0;
    return;
  }
  if (scan === null) {
    if (pressed && !was) handlers[id]?.();
    return;
  }
  if (pressed) scanEvent(scan, true, !sys); // also repeats, like typematic
  else if (was && set.size === 0) scanEvent(scan, false, !sys);
}

export function releaseAll() {
  for (const [id, set] of active) {
    if (set.size) {
      set.clear();
      const a = ACTIONS.find((x) => x.id === id);
      if (a.p2) P2[a.p2] = false;
      else if (a.scan !== null) scanEvent(a.scan, false, !a.sys);
    }
  }
  held.clear();
}

// Presses a plain key of the original keyboard (used by touch START/PAUSE).
export function tapScan(scan, pressed) {
  scanEvent(scan, pressed, false);
}

const held = new Set();

// While the settings panel is open the game receives no keys; a capture
// handler (key remapping) gets them instead.
const input = { suspended: false, capture: null };
export function suspendInput(v) {
  input.suspended = v;
  if (v) releaseAll();
}
export function setKeyCapture(fn) {
  input.capture = fn;
}

function scanEvent(code, pressed, affectMap = true) {
  K.Key = pressed ? code : (code | 0x80);
  KeyHit = true;
  const idx = PressCode.indexOf(code);
  if (idx > 0 && affectMap) {
    KeyMap[idx] = pressed;
    if (!pressed) KeyHit = false;
  }
}

function handleKey(e, pressed) {
  if (input.capture) {
    if (pressed) {
      e.preventDefault();
      input.capture(e);
    }
    return;
  }
  if (input.suspended) return;
  const acts = actionsForCode(e.code);
  const natural = SCAN[e.code];
  if (!acts.length && natural === undefined) return;
  e.preventDefault();
  if (e.code === 'Pause') {
    if (pressed) {
      K.Key = 0xC5;
      KeyHit = true;
    }
    return;
  }
  if (pressed) held.add(e.code);
  else if (!held.delete(e.code)) return; // pressed while the panel was open
  if (K.cheatMode && natural !== undefined) {
    // Typing a cheat code during the pause: letters are letters
    scanEvent(natural, pressed, false);
    return;
  }
  if (acts.length) {
    for (const a of acts) setAction(a.id, e.code, pressed);
    // Player 2 keys (arrows by default) still move through the menus
    if (acts.every((a) => a.p2) && natural !== undefined && !SYS_SCANS.has(natural))
      scanEvent(natural, pressed, false);
  } else {
    // Unbound key: still reaches menus and cheat codes, but if it is one of
    // the original game keys (arrows, Alt, Ctrl, Space) it does not move
    // Mario, and original system keys (P, S, Q, Esc, Enter) only work while
    // typing a cheat code, so a remapped pause key really replaces P.
    if (SYS_SCANS.has(natural) && !K.cheatMode) return;
    scanEvent(natural, pressed, !ACTION_SCANS.has(natural));
  }
}

const installed = new WeakSet();

export function InitKeyBoard(target = window) {
  if (installed.has(target)) return;
  installed.add(target);
  target.addEventListener('keydown', (e) => handleKey(e, true));
  target.addEventListener('keyup', (e) => handleKey(e, false));
  target.addEventListener('blur', () => {
    releaseAll();
    for (let i = 1; i <= MaxKeys; i++) KeyMap[i] = false;
  });
}

export function KeyBoardDone() {}

export function ResetKeyBoard() {
  Recording = false;
  Playing = false;
  for (let i = 1; i <= MaxKeys; i++) KeyMap[i] = false;
  K.Key = 0;
}

export function RecordMacro() {
  Recording = true;
  Playing = false;
  SeqPos.fill(0);
  // (sic) the original clears only SizeOf (SeqPos) bytes of Sequence
  const bytes = new Uint8Array(Sequence[1].buffer);
  bytes.fill(0, 0, Math.min(bytes.length, SeqPos.byteLength));
  setRandSeed(0);
}

export function PlayMacro() {
  Playing = true;
  Recording = false;
  SeqPos.fill(0);
  for (let k = 1; k <= MaxKeys; k++) {
    for (let i = 0; i < MAX_SEQ_LEN; i++) {
      const o = ((k - 1) * MAX_SEQ_LEN + i) * 2;
      Sequence[k][i] = MACRO[o] | (MACRO[o + 1] << 8);
    }
  }
  setRandSeed(0);
}

export function StopMacro() {
  Playing = false;
  Recording = false;
}

// Original: writes the recorded demo to file '$'. Here: download it.
export function SaveMacro() {
  const out = new Uint8Array(MaxKeys * MAX_SEQ_LEN * 2);
  for (let k = 1; k <= MaxKeys; k++)
    for (let i = 0; i < MAX_SEQ_LEN; i++) {
      const o = ((k - 1) * MAX_SEQ_LEN + i) * 2;
      out[o] = Sequence[k][i] & 0xFF;
      out[o + 1] = Sequence[k][i] >> 8;
    }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out]));
    a.download = 'demokeys.bin';
    a.click();
  } catch (e) {
    console.warn(e);
  }
  Recording = false;
  SeqPos.fill(0);
}

export function PlayingMacro() {
  return Playing;
}

function Check(KeyNr, Press) {
  let result = Press;
  if (Playing || Recording) {
    if (Recording) {
      if (Press !== (SeqPos[KeyNr] % 2 === 1)) {
        SeqPos[KeyNr]++;
        if (SeqPos[KeyNr] >= MAX_SEQ_LEN) SeqPos[KeyNr] = MAX_SEQ_LEN - 1;
      }
      Sequence[KeyNr][SeqPos[KeyNr]]++;
    }
    if (Playing) {
      if (Sequence[KeyNr][SeqPos[KeyNr]] === 0) Playing = false;
      else {
        Sequence[KeyNr][SeqPos[KeyNr]]--;
        if (Sequence[KeyNr][SeqPos[KeyNr]] === 0) SeqPos[KeyNr]++;
        result = SeqPos[KeyNr] % 2 === 1;
      }
    }
  }
  return result;
}

export function kbHit() {
  const r = KeyHit;
  KeyHit = false;
  return r;
}

export const kbLeft = () => Check(keyLeft, KeyMap[keyLeft]);
export const kbRight = () => Check(keyRight, KeyMap[keyRight]);
export const kbUp = () => Check(keyUp, KeyMap[keyUp]);
export const kbDown = () => Check(keyDown, KeyMap[keyDown]);
export const kbAlt = () => Check(keyAlt, KeyMap[keyAlt]);
export const kbCtrl = () => Check(keyCtrl, KeyMap[keyCtrl]);
export const kbLeftShift = () => Check(keyShiftL, KeyMap[keyShiftL]);
export const kbRightShift = () => Check(keyShiftR, KeyMap[keyShiftR]);
export const kbSpace = () => Check(keySpace, KeyMap[keySpace]);

export function GetAsciiCode(c) {
  const kbTable = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  if (c >= 2 && c <= 11) return kbTable[0].charCodeAt(c - 2);
  if (c >= 16 && c <= 25) return kbTable[1].charCodeAt(c - 16);
  if (c >= 30 && c <= 38) return kbTable[2].charCodeAt(c - 30);
  if (c >= 44 && c <= 50) return kbTable[3].charCodeAt(c - 44);
  return 0;
}
