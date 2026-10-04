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

// Touch controls: one set for player 1 and another one (optional) for
// player 2 in VERSUS. Item ids of player 2 end in '2'.
const PADS = [
  { n: 1, suffix: '', title: 'Player 1', alpha: 'alpha' },
  { n: 2, suffix: '2', title: 'Player 2', alpha: 'alpha2' },
];

// Touch layout items. x / y are measured from the screen edge given by
// 'anchor' (vw from the side, vh from the bottom); size is in vmin.
// Positions are set by dragging the controls, sizes with sliders.
const ITEM_TYPES = [
  { type: 'dpad', label: 'Flechas ← →', anchor: 'left', size: [15, 60] },
  { type: 'a', label: 'Botón A', anchor: 'right', size: [8, 40] },
  { type: 'b', label: 'Botón B', anchor: 'right', size: [8, 40] },
  { type: 'act', label: 'Botón Acción ⇅', anchor: 'right', size: [6, 30] },
];
const LAYOUT_ITEMS = PADS.flatMap((p) => ITEM_TYPES.map((t) => ({ ...t, id: t.type + p.suffix, pad: p.n })));
const ALPHA_KEYS = PADS.map((p) => p.alpha);

// One layout per orientation, so portrait and landscape can differ.
// Player 2 starts above player 1.
const DEFAULT_LAYOUTS = {
  landscape: {
    alpha: 0.55,
    dpad: { x: 4, y: 6, size: 34 },
    a: { x: 4, y: 22, size: 19 },
    b: { x: 16, y: 6, size: 19 },
    act: { x: 17, y: 38, size: 12 },
    alpha2: 0.55,
    dpad2: { x: 4, y: 52, size: 28 },
    a2: { x: 4, y: 66, size: 15 },
    b2: { x: 14, y: 52, size: 15 },
    act2: { x: 15, y: 80, size: 10 },
  },
  portrait: {
    alpha: 0.55,
    dpad: { x: 4, y: 8, size: 34 },
    a: { x: 4, y: 16, size: 19 },
    b: { x: 26, y: 8, size: 19 },
    act: { x: 30, y: 23, size: 12 },
    alpha2: 0.55,
    dpad2: { x: 4, y: 36, size: 30 },
    a2: { x: 4, y: 44, size: 17 },
    b2: { x: 26, y: 36, size: 17 },
    act2: { x: 30, y: 50, size: 11 },
  },
};

const DEFAULT_TOUCH = {
  enabled: false,
  p2: false, // second set of controls for player 2 (VERSUS)
  layouts: DEFAULT_LAYOUTS,
};

const ORIENT_NAME = { portrait: 'vertical', landscape: 'horizontal' };
const orientation = () => (window.innerHeight > window.innerWidth * 1.1 ? 'portrait' : 'landscape');

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
  // saved touch layouts: { name, orientation, layout }
  touchTemplates: [],
};

// Layout currently in use (and being edited)
const layout = () => settings.touch.layouts[orientation()];

function validLayout(l, fallback) {
  const out = clone(fallback);
  if (!l || typeof l !== 'object') return out;
  for (const k of ALPHA_KEYS) if (typeof l[k] === 'number') out[k] = l[k];
  for (const it of LAYOUT_ITEMS) {
    for (const k of ['x', 'y', 'size']) {
      if (typeof l[it.id]?.[k] === 'number') out[it.id][k] = l[it.id][k];
    }
  }
  return out;
}

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
      if (typeof s.touch.enabled === 'boolean') settings.touch.enabled = s.touch.enabled;
      if (typeof s.touch.p2 === 'boolean') settings.touch.p2 = s.touch.p2;
      if (s.touch.layouts) {
        for (const o of ['portrait', 'landscape'])
          settings.touch.layouts[o] = validLayout(s.touch.layouts[o], DEFAULT_LAYOUTS[o]);
      } else if (typeof s.touch.alpha === 'number') {
        // older single layout: keep only its opacity
        for (const o of ['portrait', 'landscape']) settings.touch.layouts[o].alpha = s.touch.alpha;
      }
    }
    if (Array.isArray(s.touchTemplates)) {
      settings.touchTemplates = s.touchTemplates
        .filter((t) => t && typeof t.name === 'string')
        .map((t) => {
          const o = t.orientation === 'portrait' ? 'portrait' : 'landscape';
          return { name: t.name.slice(0, 24), orientation: o, layout: validLayout(t.layout, DEFAULT_LAYOUTS[o]) };
        });
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
let panelOpen = true;
let editing = false; // moving the controls (full screen, panel hidden)
let panelTab = 'game'; // tab of the settings panel: 'game' or 'touch'

// Elements of each set of controls: pads[n] = { root, dpad, a, b, act }
const pads = {};
const itemEl = (it) => pads[it.pad][it.type];
const padOn = (n) => n === 1 || settings.touch.p2;

const pointers = new Map(); // pointerId -> { kind, pad, actions: Set }

function rectOf(el, grow = 0) {
  const r = el.getBoundingClientRect();
  const gx = r.width * grow;
  const gy = r.height * grow;
  return { l: r.left - gx, t: r.top - gy, r: r.right + gx, b: r.bottom + gy, w: r.width, h: r.height };
}

const inside = (p, r) => p.x >= r.l && p.x <= r.r && p.y >= r.t && p.y <= r.b;

// Action id for a set of controls: player 2 uses its own actions
const act = (pad, id) => (pad === 2 ? `${id}2` : id);

function dpadActions(p, pad) {
  // Only left / right: up and down are rarely needed (pipes), see the
  // action button. In menus the arrows move the selection up and down.
  const r = rectOf(pads[pad].dpad);
  const nx = (p.x - (r.l + r.w / 2)) / (r.w / 2);
  const s = new Set();
  if (nx < -0.06) s.add(KB.K.menuMode ? 'up' : act(pad, 'left'));
  if (nx > 0.06) s.add(KB.K.menuMode ? 'down' : act(pad, 'right'));
  return s;
}

function buttonActions(p, pad) {
  const { a, b, act: x } = pads[pad];
  const s = new Set();
  if (inside(p, rectOf(a, 0.15))) s.add(act(pad, 'jump'));
  if (inside(p, rectOf(b, 0.15))) {
    s.add(act(pad, 'run'));
    s.add(act(pad, 'fire'));
  }
  // Action: up + down together enters a pipe from below or from above
  if (!KB.K.menuMode && inside(p, rectOf(x, 0.1))) {
    s.add(act(pad, 'up'));
    s.add(act(pad, 'down'));
  }
  return s;
}

function updatePointer(id, p) {
  const st = pointers.get(id);
  if (!st) return;
  const next = st.kind === 'dpad' ? dpadActions(p, st.pad) : buttonActions(p, st.pad);
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
  const menu = KB.K.menuMode;
  for (const pad of [1, 2]) {
    const all = new Set();
    for (const st of pointers.values()) if (st.pad === pad) for (const a of st.actions) all.add(a);
    const el = pads[pad];
    el.a.classList.toggle('on', all.has(act(pad, 'jump')));
    el.b.classList.toggle('on', all.has(act(pad, 'run')));
    el.act.classList.toggle('on', !menu && all.has(act(pad, 'up')) && all.has(act(pad, 'down')));
    el.dpad.querySelector('.left').classList.toggle('on', all.has(menu ? 'up' : act(pad, 'left')));
    el.dpad.querySelector('.right').classList.toggle('on', all.has(menu ? 'down' : act(pad, 'right')));
  }
}

// --- moving the controls by dragging them (while the panel is open) ---

let drag = null; // { id, it, x0, y0, px, py }

function startDrag(e, it) {
  e.preventDefault();
  const l = layout()[it.id];
  drag = { id: e.pointerId, it, x0: l.x, y0: l.y, px: e.clientX, py: e.clientY };
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // synthetic pointer
  }
  itemEl(it).classList.add('dragging');
}

function moveDrag(e) {
  if (!drag || drag.id !== e.pointerId) return;
  const { it } = drag;
  const dx = ((e.clientX - drag.px) / window.innerWidth) * 100;
  const dy = ((e.clientY - drag.py) / window.innerHeight) * 100;
  const clamp = (v) => Math.round(Math.max(0, Math.min(95, v)) * 10) / 10;
  const l = layout()[it.id];
  l.x = clamp(it.anchor === 'left' ? drag.x0 + dx : drag.x0 - dx);
  l.y = clamp(drag.y0 - dy);
  applyTouch();
}

function endDrag(e) {
  if (!drag || drag.id !== e.pointerId) return;
  itemEl(drag.it).classList.remove('dragging');
  drag = null;
  save();
}

function buildPad(n) {
  const root = document.createElement('div');
  root.className = `pad p${n}`;
  root.innerHTML = `
    <div class="dpad" data-kind="dpad">
      <div class="arm left"></div><div class="arm right"></div>
    </div>
    <div class="btn act" data-kind="buttons" title="Entrar en tubería"><span>&#8661;</span></div>
    <div class="btn b" data-kind="buttons"><span>B</span></div>
    <div class="btn a" data-kind="buttons"><span>A</span></div>`;
  touchLayer.appendChild(root);
  pads[n] = {
    root,
    dpad: root.querySelector('.dpad'),
    a: root.querySelector('.btn.a'),
    b: root.querySelector('.btn.b'),
    act: root.querySelector('.btn.act'),
  };
  for (const it of LAYOUT_ITEMS.filter((x) => x.pad === n)) {
    const el = itemEl(it);
    el.addEventListener('pointerdown', (e) => {
      if (panelOpen) {
        startDrag(e, it);
        return;
      }
      // A pointer that starts on any of A / B / action can slide between them
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // synthetic or already released pointer
      }
      pointers.set(e.pointerId, { kind: el.dataset.kind, pad: n, actions: new Set() });
      updatePointer(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    el.addEventListener('pointermove', (e) => {
      if (drag) moveDrag(e);
      else if (pointers.has(e.pointerId)) updatePointer(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      el.addEventListener(ev, (e) => {
        endDrag(e);
        endPointer(e.pointerId);
      });
    }
  }
}

function buildTouch() {
  touchLayer = document.createElement('div');
  touchLayer.id = 'touch';
  document.body.appendChild(touchLayer);
  buildPad(1);
  buildPad(2);
  touchLayer.insertAdjacentHTML('beforeend', `
    <div class="sys">
      <button data-scan="28">START</button>
      <button data-scan="25">PAUSA</button>
      <button data-scan="1">ESC</button>
      <button data-fullscreen title="Pantalla completa">&#x26F6;</button>
    </div>
    <div class="edit-bar">
      <span>Arrastra los controles para colocarlos</span>
      <button type="button" data-edit-done>Listo</button>
    </div>`);

  touchLayer.querySelector('[data-edit-done]').addEventListener('click', stopEditing);
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
  const l = layout();
  document.body.classList.toggle('touch-on', t.enabled);
  touchLayer.style.display = t.enabled ? '' : 'none';
  touchLayer.style.setProperty('--alpha', l.alpha);
  for (const p of PADS) {
    pads[p.n].root.style.opacity = l[p.alpha];
    pads[p.n].root.hidden = !padOn(p.n);
  }
  for (const it of LAYOUT_ITEMS) {
    const el = itemEl(it);
    const v = l[it.id];
    el.style.setProperty('--s', `${v.size}vmin`);
    el.style[it.anchor] = `calc(${v.x}vw + env(safe-area-inset-${it.anchor}))`;
    el.style.bottom = `calc(${v.y}vh + env(safe-area-inset-bottom))`;
  }
  touchLayer.classList.toggle('preview', panelOpen);
  // the preview of the controls is only shown in the Táctil tab
  touchLayer.classList.toggle('off-tab', panelOpen && panelTab !== 'touch' && !editing);
  touchLayer.classList.toggle('editing', editing);
  if (!t.enabled) for (const id of [...pointers.keys()]) endPointer(id);
  // player 2 controls switched off: release whatever they were holding
  if (!t.p2) for (const [id, st] of pointers) if (st.pad === 2) endPointer(id);
}

// Full screen editing: the panel hides so every control can be reached
function startEditing() {
  editing = true;
  $('start').hidden = true;
  applyTouch();
}

function stopEditing() {
  if (!editing) return;
  editing = false;
  $('start').hidden = false;
  applyTouch();
  $('touch-move').focus();
}

// --- settings panel --------------------------------------------------------

function showTab(name) {
  panelTab = name;
  for (const b of document.querySelectorAll('.tabs [role="tab"]')) {
    const on = b.dataset.tab === name;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    $(`tab-${b.dataset.tab}`).hidden = !on;
  }
  applyTouch();
}

function initTabs() {
  const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
  for (const b of tabs) {
    b.addEventListener('click', () => showTab(b.dataset.tab));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const i = (tabs.indexOf(b) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      showTab(tabs[i].dataset.tab);
      tabs[i].focus();
    });
  }
}

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
  let prevGroup = null;
  for (const a of KB.ACTIONS) {
    const group = a.sys ? 'Sistema' : a.group || null;
    if (group && group !== prevGroup) {
      const sep = document.createElement('tr');
      sep.innerHTML = `<td colspan="3" class="sep">${group}</td>`;
      tbody.appendChild(sep);
    }
    prevGroup = group;
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

// Sliders: the size of every control and the opacity of each set
function buildTouchSliders() {
  for (const p of PADS) {
    const box = $(`touch-sliders${p.suffix}`);
    box.innerHTML = '';
    const add = (label, key, min, max, step = 1) => {
      const lab = document.createElement('label');
      lab.innerHTML = `${label} <input type="range" min="${min}" max="${max}" step="${step}"> <output></output>`;
      const input = lab.querySelector('input');
      input.dataset.key = key;
      input.addEventListener('input', () => {
        const v = Number(input.value);
        if (ALPHA_KEYS.includes(key)) layout()[key] = v / 100;
        else layout()[key].size = v;
        lab.querySelector('output').textContent = input.value;
        applyTouch();
        save();
      });
      box.appendChild(lab);
    };
    const group = document.createElement('div');
    group.className = 'group';
    group.textContent = `${p.title}: tamaño`;
    box.appendChild(group);
    for (const it of LAYOUT_ITEMS.filter((x) => x.pad === p.n)) add(it.label, it.id, it.size[0], it.size[1]);
    add('Opacidad (todos) %', p.alpha, 10, 100, 5);
  }
}

function syncTouchForm() {
  const t = settings.touch;
  const l = layout();
  $('touch-on').checked = t.enabled;
  $('touch-p2').checked = t.p2;
  $('touch-opts').hidden = !t.enabled;
  $('touch-sliders2').hidden = !t.p2;
  $('orient-name').textContent = ORIENT_NAME[orientation()];
  for (const input of document.querySelectorAll('#touch-opts .sliders input')) {
    const { key } = input.dataset;
    input.value = ALPHA_KEYS.includes(key) ? Math.round(l[key] * 100) : l[key].size;
    input.parentElement.querySelector('output').textContent = input.value;
  }
}

// --- touch layout templates ---

function renderTemplates() {
  const ul = $('tpl-list');
  ul.innerHTML = '';
  if (!settings.touchTemplates.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Aún no hay plantillas guardadas.';
    ul.appendChild(li);
    return;
  }
  settings.touchTemplates.forEach((tpl, i) => {
    const li = document.createElement('li');
    const title = document.createElement('span');
    title.className = 'tpl-title';
    title.textContent = tpl.name;
    const tag = document.createElement('span');
    tag.className = 'tpl-tag';
    tag.textContent = ORIENT_NAME[tpl.orientation];
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'secondary';
    apply.textContent = 'Aplicar';
    apply.addEventListener('click', () => {
      settings.touch.layouts[orientation()] = clone(tpl.layout);
      syncTouchForm();
      applyTouch();
      save();
      $('tpl-msg').textContent = `«${tpl.name}» aplicada al modo ${ORIENT_NAME[orientation()]}.`;
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'secondary';
    del.textContent = 'Borrar';
    del.addEventListener('click', () => {
      settings.touchTemplates.splice(i, 1);
      save();
      renderTemplates();
      $('tpl-msg').textContent = `«${tpl.name}» borrada.`;
    });
    li.append(title, tag, apply, del);
    ul.appendChild(li);
  });
}

function saveTemplate() {
  let name = $('tpl-name').value.trim().slice(0, 24);
  if (!name) name = `Plantilla ${settings.touchTemplates.length + 1}`;
  const tpl = { name, orientation: orientation(), layout: clone(layout()) };
  const i = settings.touchTemplates.findIndex((t) => t.name === name);
  if (i >= 0) settings.touchTemplates[i] = tpl;
  else settings.touchTemplates.push(tpl);
  save();
  renderTemplates();
  $('tpl-name').value = '';
  $('tpl-msg').textContent = i >= 0 ? `«${name}» actualizada.` : `«${name}» guardada.`;
}

export function openPanel() {
  panelOpen = true;
  editing = false;
  KB.suspendInput(true);
  for (const id of [...pointers.keys()]) endPointer(id);
  $('start').hidden = false;
  $('gear').hidden = true;
  $('play').textContent = started ? 'Continuar' : hooks.testMode ? 'Probar nivel' : 'Jugar';
  applyTouch();
  $('play').focus();
}

function closePanel() {
  if (capturing) stopCapture();
  editing = false;
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
  initTabs();
  showTab(panelTab);
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
  $('touch-p2').addEventListener('change', () => {
    settings.touch.p2 = $('touch-p2').checked;
    syncTouchForm();
    applyTouch();
    save();
  });
  $('touch-move').addEventListener('click', startEditing);
  buildTouchSliders();
  $('reset-touch').addEventListener('click', () => {
    const o = orientation();
    settings.touch.layouts[o] = clone(DEFAULT_LAYOUTS[o]);
    syncTouchForm();
    applyTouch();
    save();
    $('tpl-msg').textContent = `Distribución ${ORIENT_NAME[o]} restablecida.`;
  });
  $('tpl-save').addEventListener('click', saveTemplate);
  $('tpl-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTemplate();
    }
  });
  renderTemplates();
  syncTouchForm();
  // Rotating the device switches to the other orientation's layout
  let lastOrient = orientation();
  window.addEventListener('resize', () => {
    if (orientation() === lastOrient) return;
    lastOrient = orientation();
    syncTouchForm();
    applyTouch();
  });

  $('play').addEventListener('click', play);
  $('gear').addEventListener('click', openPanel);

  window.addEventListener('keydown', (e) => {
    if (!panelOpen || capturing) return;
    if (editing) {
      if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        stopEditing();
      }
      return;
    }
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
