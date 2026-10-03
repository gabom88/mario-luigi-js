// Settings panel (key remapping, touch controls) and the touch overlay.

import * as KB from './keyboard.js';
import * as VGA from './vga256.js';
import { B } from './buffers.js';
import { extras, applyExtras, toggleFullscreen } from './extras.js';
import { initEaster } from './easter.js';

const STORE_KEY = 'mario-luigi-controls';
// Version 2 changed the default keys (WASD, N, M): older saved key
// bindings are discarded once, the other settings are kept.
const STORE_VERSION = 2;

const DEFAULT_TOUCH = {
  enabled: false,
  alpha: 0.55,
  dpad: { x: 4, y: 6, size: 34 },
  buttons: { x: 4, y: 6, size: 30 },
};

const isTouchDevice = () =>
  'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;

const clone = (o) => JSON.parse(JSON.stringify(o));

export const settings = {
  bindings: KB.getBindings(),
  touch: { ...clone(DEFAULT_TOUCH), enabled: isTouchDevice() },
  video: { clock: 'smooth', scale: 'sharp' },
  // character of player 1 and player 2: 0 = Mario, 1 = Luigi
  characters: [0, 1],
  extras: { crt: false, enhancedSound: false, vibration: true },
};

function applyCharacters() {
  B.Character[0] = settings.characters[0];
  B.Character[1] = settings.characters[1];
}

let hooks = {};

function applyVideo() {
  VGA.setClockMode(settings.video.clock);
  hooks.setScaleMode?.(settings.video.scale);
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!s) return;
    if (Array.isArray(s.characters) && s.characters.length === 2)
      settings.characters = s.characters.map((c) => (c === 1 ? 1 : 0));
    if (s.bindings && (s.version || 1) >= STORE_VERSION) {
      for (const a of KB.ACTIONS)
        if (Array.isArray(s.bindings[a.id])) settings.bindings[a.id] = s.bindings[a.id].slice(0, 2);
    }
    if (s.video) settings.video = { ...settings.video, ...s.video };
    if (s.extras) settings.extras = { ...settings.extras, ...s.extras };
    if (s.touch) {
      settings.touch = {
        ...clone(DEFAULT_TOUCH),
        ...s.touch,
        dpad: { ...DEFAULT_TOUCH.dpad, ...s.touch.dpad },
        buttons: { ...DEFAULT_TOUCH.buttons, ...s.touch.buttons },
      };
    }
  } catch {
    // corrupted or unavailable storage: keep defaults
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ version: STORE_VERSION, ...settings }));
  } catch {
    // storage unavailable: settings last for this session only
  }
}

// --- key names -------------------------------------------------------------

const NAMES = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc',
  Space: 'Espacio', Enter: 'Enter', NumpadEnter: 'Enter (num)',
  ControlLeft: 'Ctrl izq.', ControlRight: 'Ctrl der.',
  AltLeft: 'Alt', AltRight: 'Alt Gr', ShiftLeft: 'Mayús izq.', ShiftRight: 'Mayús der.',
  Tab: 'Tab', Backspace: 'Retroceso', CapsLock: 'Bloq Mayús',
  Comma: ',', Period: '.', Slash: '/', Semicolon: 'Ñ', Quote: "'", Backquote: 'º',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=',
  IntlBackslash: '<',
};

export function keyName(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

// Keys the game itself needs (menus, pause...) cannot be bound.
// Escape cancels the key capture, Tab starts cheat codes in the pause.
const RESERVED = new Set(['Escape', 'Tab', 'Pause']);

// --- touch overlay ---------------------------------------------------------

let touchLayer;
let dpadEl;
let btnA;
let btnB;
let btnAct;
let panelOpen = true;

const pointers = new Map(); // pointerId -> { kind, actions: Set }

function rectOf(el, grow = 0) {
  const r = el.getBoundingClientRect();
  const gx = r.width * grow;
  const gy = r.height * grow;
  return { l: r.left - gx, t: r.top - gy, r: r.right + gx, b: r.bottom + gy, w: r.width, h: r.height };
}

const inside = (p, r) => p.x >= r.l && p.x <= r.r && p.y >= r.t && p.y <= r.b;

function dpadActions(p) {
  // Only left / right: up and down are rarely needed (pipes), see the
  // action button. In menus the arrows move the selection up and down.
  const r = rectOf(dpadEl);
  const nx = (p.x - (r.l + r.w / 2)) / (r.w / 2);
  const s = new Set();
  if (nx < -0.06) s.add(KB.K.menuMode ? 'up' : 'left');
  if (nx > 0.06) s.add(KB.K.menuMode ? 'down' : 'right');
  return s;
}

function buttonActions(p) {
  const s = new Set();
  if (inside(p, rectOf(btnA, 0.15))) s.add('jump');
  if (inside(p, rectOf(btnB, 0.15))) {
    s.add('run');
    s.add('fire');
  }
  // Action: up + down together enters a pipe from below or from above
  if (!KB.K.menuMode && inside(p, rectOf(btnAct, 0.1))) {
    s.add('up');
    s.add('down');
  }
  return s;
}

function updatePointer(id, p) {
  const st = pointers.get(id);
  if (!st) return;
  const next = st.kind === 'dpad' ? dpadActions(p) : buttonActions(p);
  const src = `touch${id}`;
  for (const a of st.actions) if (!next.has(a)) KB.setAction(a, src, false);
  for (const a of next) if (!st.actions.has(a)) KB.setAction(a, src, true);
  st.actions = next;
  refreshPressed();
}

function endPointer(id) {
  const st = pointers.get(id);
  if (!st) return;
  for (const a of st.actions) KB.setAction(a, `touch${id}`, false);
  pointers.delete(id);
  refreshPressed();
}

function refreshPressed() {
  const all = new Set();
  for (const st of pointers.values()) for (const a of st.actions) all.add(a);
  btnA.classList.toggle('on', all.has('jump'));
  btnB.classList.toggle('on', all.has('run'));
  const menu = KB.K.menuMode;
  btnAct.classList.toggle('on', !menu && all.has('up') && all.has('down'));
  dpadEl.querySelector('.left').classList.toggle('on', all.has(menu ? 'up' : 'left'));
  dpadEl.querySelector('.right').classList.toggle('on', all.has(menu ? 'down' : 'right'));
}

function buildTouch() {
  touchLayer = document.createElement('div');
  touchLayer.id = 'touch';
  touchLayer.innerHTML = `
    <div class="dpad" data-kind="dpad">
      <div class="arm left"></div><div class="arm right"></div>
    </div>
    <div class="ab" data-kind="buttons">
      <div class="btn act" title="Entrar en tubería"><span>&#8661;</span></div>
      <div class="btn b"><span>B</span></div>
      <div class="btn a"><span>A</span></div>
    </div>
    <div class="sys">
      <button data-scan="28">START</button>
      <button data-scan="25">PAUSA</button>
      <button data-scan="1">ESC</button>
      <button data-fullscreen title="Pantalla completa">&#x26F6;</button>
    </div>`;
  document.body.appendChild(touchLayer);
  dpadEl = touchLayer.querySelector('.dpad');
  btnA = touchLayer.querySelector('.btn.a');
  btnB = touchLayer.querySelector('.btn.b');
  btnAct = touchLayer.querySelector('.btn.act');

  for (const el of [dpadEl, touchLayer.querySelector('.ab')]) {
    el.addEventListener('pointerdown', (e) => {
      if (panelOpen) return;
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // synthetic or already released pointer
      }
      pointers.set(e.pointerId, { kind: el.dataset.kind, actions: new Set() });
      updatePointer(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    el.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) updatePointer(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
      el.addEventListener(ev, (e) => endPointer(e.pointerId));
  }

  touchLayer.querySelector('[data-fullscreen]').addEventListener('click', () => {
    if (!panelOpen) toggleFullscreen();
  });
  for (const b of touchLayer.querySelectorAll('.sys button[data-scan]')) {
    const scan = Number(b.dataset.scan);
    b.addEventListener('pointerdown', (e) => {
      if (panelOpen) return;
      e.preventDefault();
      b.classList.add('on');
      KB.tapScan(scan, true);
    });
    const up = () => {
      if (!b.classList.contains('on')) return;
      b.classList.remove('on');
      KB.tapScan(scan, false);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  }

  // No scrolling, zooming or context menus on the controls
  touchLayer.addEventListener('contextmenu', (e) => e.preventDefault());
}

function applyTouch() {
  const t = settings.touch;
  document.body.classList.toggle('touch-on', t.enabled);
  touchLayer.style.display = t.enabled ? '' : 'none';
  touchLayer.style.setProperty('--alpha', t.alpha);
  touchLayer.style.setProperty('--dpad-x', `${t.dpad.x}vw`);
  touchLayer.style.setProperty('--dpad-y', `${t.dpad.y}vh`);
  touchLayer.style.setProperty('--dpad-size', `${t.dpad.size}vmin`);
  touchLayer.style.setProperty('--btn-x', `${t.buttons.x}vw`);
  touchLayer.style.setProperty('--btn-y', `${t.buttons.y}vh`);
  touchLayer.style.setProperty('--btn-size', `${t.buttons.size}vmin`);
  touchLayer.classList.toggle('preview', panelOpen);
  if (!t.enabled) for (const id of [...pointers.keys()]) endPointer(id);
}

// --- settings panel --------------------------------------------------------

let onPlay = () => {};
let started = false;
let capturing = null; // { action, slot, button }

const $ = (id) => document.getElementById(id);

// Number of actions a key is bound to
function keyUses(code) {
  return KB.ACTIONS.filter((a) => settings.bindings[a.id].includes(code)).length;
}

function renderCharacters() {
  for (const p of [0, 1]) {
    for (const b of document.querySelectorAll(`[data-player="${p}"] button`))
      b.classList.toggle('sel', Number(b.dataset.char) === settings.characters[p]);
  }
}

function renderBindings() {
  const tbody = $('bindings');
  tbody.innerHTML = '';
  let prevSys = false;
  for (const a of KB.ACTIONS) {
    if (a.sys && !prevSys) {
      const sep = document.createElement('tr');
      sep.innerHTML = '<td colspan="3" class="sep">Sistema</td>';
      tbody.appendChild(sep);
    }
    prevSys = !!a.sys;
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = a.label;
    tr.appendChild(th);
    for (let slot = 0; slot < 2; slot++) {
      const td = document.createElement('td');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'key';
      const code = settings.bindings[a.id][slot];
      b.textContent = keyName(code);
      if (code && keyUses(code) > 1) {
        b.classList.add('dup');
        b.title = 'Esta tecla tiene varias acciones';
      }
      if (capturing && capturing.action === a.id && capturing.slot === slot) {
        b.textContent = 'Pulsa una tecla…';
        b.classList.add('capturing');
      }
      b.addEventListener('click', () => startCapture(a.id, slot));
      td.appendChild(b);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function startCapture(action, slot) {
  capturing = { action, slot };
  $('key-msg').textContent = 'Pulsa la nueva tecla. Supr la borra, Esc cancela.';
  KB.setKeyCapture(onCapture);
  renderBindings();
}

function stopCapture(msg = '') {
  capturing = null;
  KB.setKeyCapture(null);
  $('key-msg').textContent = msg;
  renderBindings();
}

function onCapture(e) {
  if (!capturing) return;
  const { action, slot } = capturing;
  if (e.code === 'Escape') {
    stopCapture();
    return;
  }
  if (e.code === 'Delete' || e.code === 'Backspace') {
    settings.bindings[action][slot] = null;
    commitBindings();
    stopCapture();
    return;
  }
  if (RESERVED.has(e.code)) {
    $('key-msg').textContent = `${keyName(e.code)} no se puede asignar (Esc cancela, Tab es para trucos). Elige otra.`;
    return;
  }
  const isSys = (id) => !!KB.ACTIONS.find((a) => a.id === id).sys;
  const users = KB.ACTIONS.filter((a) => a.id !== action
    && settings.bindings[a.id].includes(e.code));
  // System keys (accept, pause, status, sound, quit) cannot be shared;
  // game actions can share a key (e.g. run + fire, NES style).
  const blocked = users.filter((a) => isSys(action) || a.sys);
  if (blocked.length) {
    $('key-msg').textContent = `${keyName(e.code)} ya se usa en: ${blocked.map((a) => a.label.toLowerCase()).join(', ')}. `
      + 'Las teclas de sistema no se pueden compartir. Elige otra.';
    return;
  }
  const bind = settings.bindings[action];
  if (bind[1 - slot] === e.code) bind[1 - slot] = null; // same key twice in one action
  bind[slot] = e.code;
  commitBindings();
  stopCapture(users.length
    ? `Aviso: ${keyName(e.code)} también hace ${users.map((a) => a.label.toLowerCase()).join(', ')} (en amarillo).`
    : '');
}

function commitBindings() {
  KB.setBindings(settings.bindings);
  save();
}

function bindSlider(id, get, set) {
  const el = $(id);
  const out = el.parentElement.querySelector('output');
  el.value = get();
  if (out) out.textContent = el.value;
  el.addEventListener('input', () => {
    set(Number(el.value));
    if (out) out.textContent = el.value;
    applyTouch();
    save();
  });
}

function syncTouchForm() {
  const t = settings.touch;
  $('touch-on').checked = t.enabled;
  $('touch-opts').hidden = !t.enabled;
  const vals = {
    'dpad-x': t.dpad.x, 'dpad-y': t.dpad.y, 'dpad-size': t.dpad.size,
    'btn-x': t.buttons.x, 'btn-y': t.buttons.y, 'btn-size': t.buttons.size,
    alpha: Math.round(t.alpha * 100),
  };
  for (const [id, v] of Object.entries(vals)) {
    $(id).value = v;
    $(id).parentElement.querySelector('output').textContent = v;
  }
}

export function openPanel() {
  panelOpen = true;
  KB.suspendInput(true);
  for (const id of [...pointers.keys()]) endPointer(id);
  $('start').hidden = false;
  $('gear').hidden = true;
  $('play').textContent = started ? 'Continuar' : 'Jugar';
  applyTouch();
  $('play').focus();
}

function closePanel() {
  if (capturing) stopCapture();
  panelOpen = false;
  $('start').hidden = true;
  $('gear').hidden = false;
  KB.suspendInput(false);
  applyTouch();
  document.getElementById('screen').focus();
}

function play() {
  closePanel();
  if (!started) {
    started = true;
    if (settings.touch.enabled && document.documentElement.requestFullscreen && isTouchDevice()) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    onPlay();
  }
}

export function initUI(playCallback, uiHooks = {}) {
  onPlay = playCallback;
  hooks = uiHooks;
  load();
  applyVideo();
  applyCharacters();
  const extrasMap = { 'x-crt': 'crt', 'x-sound': 'enhancedSound', 'x-vibration': 'vibration' };
  const applyX = () => {
    Object.assign(extras, settings.extras);
    applyExtras();
  };
  applyX();
  for (const [id, key] of Object.entries(extrasMap)) {
    $(id).checked = settings.extras[key];
    $(id).addEventListener('change', () => {
      settings.extras[key] = $(id).checked;
      applyX();
      save();
      if (key === 'vibration' && settings.extras.vibration) navigator.vibrate?.(40);
    });
  }
  renderCharacters();
  for (const b of document.querySelectorAll('[data-player] button')) {
    b.addEventListener('click', () => {
      const p = Number(b.closest('[data-player]').dataset.player);
      settings.characters[p] = Number(b.dataset.char);
      applyCharacters();
      renderCharacters();
      save();
    });
  }
  for (const id of ['clock', 'scale']) {
    $(id).value = settings.video[id];
    $(id).addEventListener('change', () => {
      settings.video[id] = $(id).value;
      applyVideo();
      save();
    });
  }
  KB.setBindings(settings.bindings);
  buildTouch();
  initEaster($('easter'));
  // The touch preview would cover the easter egg at the bottom of the panel
  new IntersectionObserver((entries) => {
    const seen = entries.some((e) => e.isIntersecting);
    touchLayer.classList.toggle('egg-view', seen);
  }, { threshold: 0.25 }).observe($('easter'));

  renderBindings();
  $('reset-keys').addEventListener('click', () => {
    settings.bindings = clone(KB.DEFAULT_BINDINGS);
    commitBindings();
    stopCapture('Teclas restablecidas.');
  });

  $('touch-on').addEventListener('change', () => {
    settings.touch.enabled = $('touch-on').checked;
    $('touch-opts').hidden = !settings.touch.enabled;
    applyTouch();
    save();
  });
  const t = () => settings.touch;
  bindSlider('dpad-x', () => t().dpad.x, (v) => { t().dpad.x = v; });
  bindSlider('dpad-y', () => t().dpad.y, (v) => { t().dpad.y = v; });
  bindSlider('dpad-size', () => t().dpad.size, (v) => { t().dpad.size = v; });
  bindSlider('btn-x', () => t().buttons.x, (v) => { t().buttons.x = v; });
  bindSlider('btn-y', () => t().buttons.y, (v) => { t().buttons.y = v; });
  bindSlider('btn-size', () => t().buttons.size, (v) => { t().buttons.size = v; });
  bindSlider('alpha', () => Math.round(t().alpha * 100), (v) => { t().alpha = v / 100; });
  $('reset-touch').addEventListener('click', () => {
    const enabled = settings.touch.enabled;
    settings.touch = { ...clone(DEFAULT_TOUCH), enabled };
    syncTouchForm();
    applyTouch();
    save();
  });
  syncTouchForm();

  $('play').addEventListener('click', play);
  $('gear').addEventListener('click', openPanel);

  window.addEventListener('keydown', (e) => {
    if (!panelOpen || capturing) return;
    if (e.code === 'Escape' && started) {
      e.preventDefault();
      play();
    } else if ((e.code === 'Enter' || e.code === 'NumpadEnter')
      && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLInputElement)
      && !(e.target instanceof HTMLSelectElement)) {
      e.preventDefault();
      play();
    }
  }, { capture: true });

  openPanel();
}
