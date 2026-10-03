// Level editor for Mario & Luigi (JS).
//
// The level is drawn by the game engine itself (render.js); the editor adds
// icons for the codes the engine does not draw (enemies, contents of ?
// blocks, pipe links...), the grid, the selection and the start position.

import { NV, W, H } from '../buffers.js';
import { RAW } from '../data.js';
import { optionsFromBytes } from '../buffers.js';
import * as L from '../levels.js';
import { loadArea, renderColumns, spriteToImageData, rgba } from './render.js';
import { GROUPS, itemFor, overlayItem, itemName, itemSprite } from './catalog.js';

const SP = 0x20;
const ROWS_PX = NV * H; // 182
const SESSION_KEY = 'mario-luigi-editor';

const $ = (id) => document.getElementById(id);
const viewport = $('viewport');
const spacer = $('spacer');
const view = $('view');
const vctx = view.getContext('2d');

// --- state -------------------------------------------------------------------

const S = {
  level: null,
  areaIndex: 0,
  source: { type: 'new' }, // { type: 'builtin', key } | { type: 'my', id } | { type: 'new' }
  dirty: false,
  zoom: 3,
  grid: true,
  tool: 'pencil',
  code: 0x41,
  item: null,
  selection: null, // { x0, y0, x1, y1 } inclusive
  clipboard: null, // { w, h, cells }
  pasting: false,
  hover: null,
  cursorX: 0,
  undo: [],
  redo: [],
};

const area = () => S.level.areas[S.areaIndex];
const cellAt = (x, y) => area().cells[x * NV + y];
const inside = (x, y) => x >= 0 && y >= 0 && x < area().width && y < NV;

// level image at 1:1 (one canvas pixel per game pixel)
const lvl = document.createElement('canvas');
const lctx = lvl.getContext('2d');
let img = null;
let img32 = null;

// --- helpers -------------------------------------------------------------------

let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const safeName = (s) => (s || 'nivel').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '').trim().replace(/\s+/g, '-') || 'nivel';

// --- rendering ------------------------------------------------------------------

const iconCache = new Map();

function iconFor(it) {
  const key = it.code + ':' + (typeof it.sprite === 'string' ? it.sprite : itemName(it, area().options));
  if (iconCache.has(key)) return iconCache.get(key);
  const sp = itemSprite(it, area().options);
  let c = null;
  if (sp) {
    c = document.createElement('canvas');
    c.width = sp.w;
    c.height = sp.h;
    c.getContext('2d').putImageData(spriteToImageData(sp.data, sp.w, sp.h, sp.mirror), 0, 0);
  }
  iconCache.set(key, c);
  return c;
}

let startIcon = null;

function refreshAll() {
  const a = area();
  loadArea(a, true);
  iconCache.clear();
  startIcon = document.createElement('canvas');
  startIcon.width = 20;
  startIcon.height = 28;
  startIcon.getContext('2d').putImageData(spriteToImageData(RAW.SWMAR000, 20, 28, true), 0, 0);
  const w = a.width * W;
  if (!img || img.width !== w) {
    lvl.width = w;
    lvl.height = ROWS_PX;
    img = lctx.createImageData(w, ROWS_PX);
    img32 = new Uint32Array(img.data.buffer);
  }
  renderColumns(0, a.width, img32, w);
  lctx.putImageData(img, 0, 0);
  sizeSpacer();
  buildPalette();
  updateUI();
  draw();
}

// Re-renders the columns around an edit (the ground edges depend on neighbours)
function refreshColumns(x0, x1) {
  const a = area();
  loadArea(a, false);
  const c0 = Math.max(0, x0 - 1);
  const c1 = Math.min(a.width, x1 + 2);
  renderColumns(c0, c1, img32, a.width * W);
  const p0 = Math.floor(c0 / 16) * 16 * W;
  const p1 = Math.min(a.width * W, Math.ceil(c1 / 16) * 16 * W);
  lctx.putImageData(img, 0, 0, p0, 0, p1 - p0, ROWS_PX);
  draw();
}

// Vertical position of the level: centred when it fits, scrolled otherwise
function viewTop() {
  const content = ROWS_PX * S.zoom;
  return content <= view.height ? Math.floor((view.height - content) / 2) : -viewport.scrollTop;
}

function sizeSpacer() {
  spacer.style.width = `${area().width * W * S.zoom}px`;
  spacer.style.height = `${ROWS_PX * S.zoom}px`;
}

function draw() {
  const z = S.zoom;
  const vw = view.width;
  const vh = view.height;
  const sx = viewport.scrollLeft;
  const top = viewTop();
  vctx.imageSmoothingEnabled = false;
  vctx.fillStyle = '#0a0b0e';
  vctx.fillRect(0, 0, vw, vh);
  vctx.drawImage(lvl, sx / z, 0, vw / z, ROWS_PX, 0, top, vw, ROWS_PX * z);

  const a = area();
  const cw = W * z;
  const chh = H * z;
  const c0 = Math.max(0, Math.floor(sx / cw));
  const c1 = Math.min(a.width - 1, Math.floor((sx + vw) / cw));
  const opt = a.options;

  // icons for codes the engine does not draw
  vctx.font = `bold ${Math.max(9, 4 * z)}px system-ui, sans-serif`;
  vctx.textAlign = 'center';
  vctx.textBaseline = 'middle';
  for (let x = c0; x <= c1; x++) {
    for (let y = 0; y < NV; y++) {
      const code = a.cells[x * NV + y];
      const below = y < NV - 1 ? a.cells[x * NV + y + 1] : 0;
      const it = overlayItem(code, below);
      if (!it || !it.overlay) continue;
      const px = x * cw - sx;
      const py = top + y * chh;
      const icon = iconFor(it);
      vctx.globalAlpha = 0.85;
      if (icon) {
        const dy = (icon.height - H) * z;
        vctx.drawImage(icon, px, py - dy, icon.width * z, icon.height * z);
      } else {
        vctx.fillStyle = 'rgba(20, 22, 30, 0.75)';
        vctx.fillRect(px + 1, py + 1, cw - 2, chh - 2);
      }
      vctx.globalAlpha = 1;
      if (it.badge) {
        vctx.lineWidth = 3;
        vctx.strokeStyle = '#000';
        vctx.fillStyle = '#ffe680';
        vctx.strokeText(it.badge, px + cw / 2, py + chh / 2);
        vctx.fillText(it.badge, px + cw / 2, py + chh / 2);
      }
    }
  }

  // player start
  if (startIcon) {
    vctx.globalAlpha = 0.8;
    vctx.drawImage(startIcon, opt.InitX * z - sx, top + opt.InitY * z, 20 * z, 28 * z);
    vctx.globalAlpha = 1;
  }

  // grid
  if (S.grid && z >= 2) {
    vctx.strokeStyle = 'rgba(255,255,255,0.12)';
    vctx.lineWidth = 1;
    vctx.beginPath();
    for (let x = c0; x <= c1 + 1; x++) {
      const px = Math.round(x * cw - sx) + 0.5;
      vctx.moveTo(px, top);
      vctx.lineTo(px, top + ROWS_PX * z);
    }
    for (let y = 0; y <= NV; y++) {
      const py = top + y * chh + 0.5;
      vctx.moveTo(0, py);
      vctx.lineTo(vw, py);
    }
    vctx.stroke();
    // every 16 columns (one screen)
    vctx.strokeStyle = 'rgba(255,230,128,0.35)';
    vctx.beginPath();
    for (let x = Math.ceil(c0 / 16) * 16; x <= c1 + 1; x += 16) {
      const px = Math.round(x * cw - sx) + 0.5;
      vctx.moveTo(px, top);
      vctx.lineTo(px, top + ROWS_PX * z);
    }
    vctx.stroke();
  }

  const rect = (x0, y0, x1, y1, color, fill) => {
    const px = Math.min(x0, x1) * cw - sx;
    const py = top + Math.min(y0, y1) * chh;
    const w = (Math.abs(x1 - x0) + 1) * cw;
    const h = (Math.abs(y1 - y0) + 1) * chh;
    if (fill) {
      vctx.fillStyle = fill;
      vctx.fillRect(px, py, w, h);
    }
    vctx.strokeStyle = color;
    vctx.lineWidth = 2;
    vctx.setLineDash([6, 4]);
    vctx.strokeRect(px + 1, py + 1, w - 2, h - 2);
    vctx.setLineDash([]);
  };

  if (S.selection) {
    const s = S.selection;
    rect(s.x0, s.y0, s.x1, s.y1, '#f5c542', 'rgba(245,197,66,0.12)');
  }
  if (drag && drag.kind === 'rect') rect(drag.x0, drag.y0, drag.x1, drag.y1, '#e0362c', 'rgba(224,54,44,0.15)');
  if (S.pasting && S.clipboard && S.hover) {
    const { w, h } = S.clipboard;
    rect(S.hover.x, S.hover.y, S.hover.x + w - 1, S.hover.y + h - 1, '#6fd36f', 'rgba(111,211,111,0.18)');
  } else if (S.hover && inside(S.hover.x, S.hover.y)) {
    vctx.strokeStyle = 'rgba(255,255,255,0.8)';
    vctx.lineWidth = 2;
    vctx.strokeRect(S.hover.x * cw - sx + 1, top + S.hover.y * chh + 1, cw - 2, chh - 2);
  }
}

function resizeView() {
  view.width = Math.max(1, viewport.clientWidth);
  view.height = Math.max(1, viewport.clientHeight);
  view.style.width = `${view.width}px`;
  view.style.height = `${view.height}px`;
  draw();
}

function setZoom(z, anchorPx = view.width / 2) {
  z = Math.max(1, Math.min(8, z));
  if (z === S.zoom) return;
  const worldX = (viewport.scrollLeft + anchorPx) / S.zoom;
  S.zoom = z;
  sizeSpacer();
  viewport.scrollLeft = worldX * z - anchorPx;
  resizeView();
  draw();
  saveSession();
}

// Largest zoom at which the 13 rows fit the height (at least 2 on phones,
// scrolling vertically if needed, so the cells are big enough to touch)
function fitZoom() {
  const h = $('main').clientHeight - 20;
  const min = window.innerWidth < 800 || window.innerHeight < 600 ? 2 : 1;
  S.zoom = Math.max(min, Math.min(6, Math.floor(h / ROWS_PX)));
  sizeSpacer();
}

// --- palette and tools -------------------------------------------------------------

const TOOLS = [
  { id: 'pencil', icon: '✏️', name: 'Pincel', key: 'b' },
  { id: 'eraser', icon: '🧽', name: 'Borrar', key: 'e' },
  { id: 'fill', icon: '🪣', name: 'Rellenar', key: 'f' },
  { id: 'rect', icon: '▭', name: 'Rectángulo', key: 'r' },
  { id: 'select', icon: '⬚', name: 'Seleccionar', key: 'm' },
  { id: 'picker', icon: '💧', name: 'Coger', key: 'i' },
  { id: 'start', icon: '🚩', name: 'Inicio', key: 'j' },
  { id: 'link', icon: '🔗', name: 'Enlace', key: 'l' },
  { id: 'hand', icon: '✋', name: 'Mover', key: 'h' },
];

function buildTools() {
  const box = $('tools');
  box.innerHTML = '';
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.dataset.tool = t.id;
    b.title = `${t.name} (${t.key.toUpperCase()})`;
    b.innerHTML = `${t.icon}<small>${t.name}</small>`;
    b.addEventListener('click', () => setTool(t.id));
    box.appendChild(b);
  }
}

function setTool(id) {
  S.tool = id;
  if (id !== 'select') S.pasting = false;
  for (const b of $('tools').children) b.classList.toggle('on', b.dataset.tool === id);
  view.style.cursor = id === 'hand' ? 'grab' : 'crosshair';
  draw();
}

function buildPalette() {
  const box = $('palette');
  box.innerHTML = '';
  const opt = area().options;
  for (const g of GROUPS) {
    const t = document.createElement('div');
    t.className = 'group-title';
    t.textContent = g.name;
    box.appendChild(t);
    const grid = document.createElement('div');
    grid.className = 'palette';
    for (const it of g.items) {
      const b = document.createElement('button');
      b.title = itemName(it, opt);
      const icon = iconFor(it);
      if (icon) {
        const c = document.createElement('canvas');
        c.width = icon.width;
        c.height = icon.height;
        c.getContext('2d').drawImage(icon, 0, 0);
        c.style.width = `${icon.width * 1.5}px`;
        b.appendChild(c);
      } else if (it.code === SP) {
        b.style.background = '#2a2d36';
        b.textContent = '∅';
      } else {
        b.style.background = '#2a2d36';
      }
      if (it.badge) {
        const s = document.createElement('span');
        s.className = 'badge';
        s.textContent = it.badge;
        b.appendChild(s);
      }
      b.addEventListener('click', () => selectItem(it));
      b._item = it;
      grid.appendChild(b);
    }
    box.appendChild(grid);
  }
  markPalette();
}

function markPalette() {
  for (const b of $('palette').querySelectorAll('button'))
    b.classList.toggle('on', b._item === S.item || (!S.item && b._item.code === S.code));
  const it = S.item || itemFor(S.code);
  const opt = area().options;
  $('info').innerHTML = it
    ? `<strong>${itemName(it, opt)}</strong>${it.help ? it.help : ''}<br><small>Código $${it.code.toString(16).toUpperCase().padStart(2, '0')}</small>`
    : `<strong>Código $${S.code.toString(16).toUpperCase()}</strong>`;
}

function selectItem(it) {
  S.code = it.code;
  S.item = it;
  if (!['pencil', 'fill', 'rect'].includes(S.tool)) setTool('pencil');
  markPalette();
  if (window.matchMedia('(max-width: 760px)').matches) $('side').classList.add('collapsed');
}

// --- editing -----------------------------------------------------------------------

function snapshot() {
  return { level: L.cloneLevel(S.level), areaIndex: S.areaIndex };
}

function beginEdit() {
  S.undo.push(snapshot());
  if (S.undo.length > 150) S.undo.shift();
  S.redo = [];
  setDirty(true);
}

function restore(snap) {
  const widthChanged = snap.level.areas[snap.areaIndex].width !== area().width;
  const optionsChanged = JSON.stringify(snap.level.areas[snap.areaIndex].options) !== JSON.stringify(area().options);
  const areaChanged = snap.areaIndex !== S.areaIndex;
  S.level = snap.level;
  S.areaIndex = snap.areaIndex;
  S.selection = null;
  if (widthChanged || optionsChanged || areaChanged) refreshAll();
  else refreshColumns(0, area().width);
  updateUI();
}

function undo() {
  if (!S.undo.length) return;
  S.redo.push(snapshot());
  restore(S.undo.pop());
  setDirty(true);
}

function redo() {
  if (!S.redo.length) return;
  S.undo.push(snapshot());
  restore(S.redo.pop());
  setDirty(true);
}

function setCell(x, y, code) {
  if (!inside(x, y)) return false;
  const a = area();
  if (a.cells[x * NV + y] === code) return false;
  a.cells[x * NV + y] = code;
  return true;
}

function paintLine(x0, y0, x1, y1, code) {
  let changed = false;
  let minX = Math.min(x0, x1);
  let maxX = Math.max(x0, x1);
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    changed = setCell(x, y, code) || changed;
  }
  if (changed) refreshColumns(minX, maxX);
}

function fillRect(x0, y0, x1, y1, code) {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (let x = ax; x <= bx; x++) for (let y = ay; y <= by; y++) setCell(x, y, code);
  refreshColumns(ax, bx);
}

function floodFill(x, y, code) {
  const a = area();
  const target = cellAt(x, y);
  if (target === code) return;
  const stack = [[x, y]];
  let minX = x;
  let maxX = x;
  let count = 0;
  while (stack.length && count < 8000) {
    const [cx, cy] = stack.pop();
    if (!inside(cx, cy) || a.cells[cx * NV + cy] !== target) continue;
    a.cells[cx * NV + cy] = code;
    count++;
    minX = Math.min(minX, cx);
    maxX = Math.max(maxX, cx);
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  refreshColumns(minX, maxX);
}

function setStart(x, y) {
  const o = area().options;
  // the clicked cell is where Mario's feet are; he is two cells tall
  o.InitX = x * W + 10;
  o.InitY = Math.max(0, y - 1) * H;
  draw();
}

// selection / clipboard
function normSel() {
  const s = S.selection;
  return { x0: Math.min(s.x0, s.x1), y0: Math.min(s.y0, s.y1), x1: Math.max(s.x0, s.x1), y1: Math.max(s.y0, s.y1) };
}

function copySel() {
  if (!S.selection) return toast('Primero selecciona una zona (herramienta ⬚).');
  const s = normSel();
  const w = s.x1 - s.x0 + 1;
  const h = s.y1 - s.y0 + 1;
  const cells = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) cells[x * h + y] = cellAt(s.x0 + x, s.y0 + y);
  S.clipboard = { w, h, cells };
  toast(`Copiado: ${w}×${h} celdas.`);
}

function deleteSel() {
  if (!S.selection) return;
  beginEdit();
  const s = normSel();
  fillRect(s.x0, s.y0, s.x1, s.y1, SP);
}

function cutSel() {
  if (!S.selection) return toast('Primero selecciona una zona (herramienta ⬚).');
  copySel();
  deleteSel();
}

function startPaste() {
  if (!S.clipboard) return toast('No hay nada copiado.');
  setTool('select');
  S.pasting = true;
  toast('Haz clic donde quieras pegar (Esc cancela).');
  draw();
}

function placePaste(x, y) {
  const { w, h, cells } = S.clipboard;
  beginEdit();
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) setCell(x + i, y + j, cells[i * h + j]);
  refreshColumns(x, x + w - 1);
  S.selection = { x0: x, y0: y, x1: x + w - 1, y1: y + h - 1 };
  S.pasting = false;
  draw();
}

const MIRROR = new Map([['0', '1'], ['1', '0'], ['2', '3'], ['3', '2'], ['\xF4', '\xF5'], ['\xF5', '\xF4']]
  .map(([a, b]) => [a.charCodeAt(0), b.charCodeAt(0)]));

function flipSel() {
  if (!S.selection) return toast('Primero selecciona una zona (herramienta ⬚).');
  beginEdit();
  const s = normSel();
  const a = area();
  for (let y = s.y0; y <= s.y1; y++) {
    const row = [];
    for (let x = s.x0; x <= s.x1; x++) row.push(a.cells[x * NV + y]);
    row.reverse();
    row.forEach((c, i) => { a.cells[(s.x0 + i) * NV + y] = MIRROR.get(c) ?? c; });
  }
  refreshColumns(s.x0, s.x1);
}

// columns
// The new column is a copy of the one on its left (handy to extend ground)
function insertColumn(at) {
  const a = area();
  if (a.width >= L.MAX_WIDTH) return toast('Ancho máximo alcanzado.');
  beginEdit();
  at = Math.max(0, Math.min(a.width, at));
  const src = Math.max(0, at - 1);
  const cells = new Uint8Array((a.width + 1) * NV);
  cells.set(a.cells.subarray(0, at * NV), 0);
  cells.set(a.cells.subarray(src * NV, src * NV + NV), at * NV);
  cells.set(a.cells.subarray(at * NV), (at + 1) * NV);
  a.cells = cells;
  a.width += 1;
  refreshAll();
  toast(`Columna insertada en ${at}.`);
}

function deleteColumn(at) {
  const a = area();
  if (a.width <= L.MIN_WIDTH) return toast(`El ancho mínimo es ${L.MIN_WIDTH}.`);
  beginEdit();
  at = Math.max(0, Math.min(a.width - 1, at));
  const cells = new Uint8Array((a.width - 1) * NV);
  cells.set(a.cells.subarray(0, at * NV), 0);
  cells.set(a.cells.subarray((at + 1) * NV), at * NV);
  a.cells = cells;
  a.width -= 1;
  refreshAll();
  toast(`Columna ${at} borrada.`);
}

// --- pointer input -------------------------------------------------------------------

let drag = null;
const pointers = new Map();
let gesture = null;

function cellFromEvent(e) {
  const r = view.getBoundingClientRect();
  const px = e.clientX - r.left + viewport.scrollLeft;
  const py = e.clientY - r.top - viewTop();
  return { x: Math.floor(px / (W * S.zoom)), y: Math.floor(py / (H * S.zoom)) };
}

function pointerDown(e) {
  try {
    view.setPointerCapture(e.pointerId);
  } catch {
    // synthetic pointer
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    // two fingers: pan and zoom; undo the stroke the first finger started
    if (drag && drag.edited) {
      const snap = S.undo.pop();
      if (snap) restore(snap);
    }
    drag = null;
    const [p1, p2] = [...pointers.values()];
    gesture = { mid: (p1.x + p2.x) / 2, dist: Math.hypot(p1.x - p2.x, p1.y - p2.y), zoom: S.zoom };
    return;
  }
  if (pointers.size > 2) return;
  const c = cellFromEvent(e);
  S.cursorX = Math.max(0, Math.min(area().width - 1, c.x));
  let tool = S.tool;
  if (e.button === 1 || (e.button === 0 && keysDown.has(' '))) tool = 'hand';
  else if (e.button === 2) tool = 'eraser';
  else if (e.altKey) tool = 'picker';
  e.preventDefault();

  if (tool === 'hand') {
    drag = { kind: 'hand', startX: e.clientX, startY: e.clientY, scroll: viewport.scrollLeft, scrollY: viewport.scrollTop };
    view.style.cursor = 'grabbing';
    return;
  }
  if (!inside(c.x, c.y)) return;
  switch (tool) {
    case 'pencil':
    case 'eraser': {
      beginEdit();
      const code = tool === 'eraser' ? SP : S.code;
      drag = { kind: 'paint', code, last: c, edited: true };
      paintLine(c.x, c.y, c.x, c.y, code);
      break;
    }
    case 'fill':
      beginEdit();
      floodFill(c.x, c.y, S.code);
      break;
    case 'rect':
      drag = { kind: 'rect', x0: c.x, y0: c.y, x1: c.x, y1: c.y };
      draw();
      break;
    case 'select':
      if (S.pasting) placePaste(c.x, c.y);
      else {
        drag = { kind: 'select' };
        S.selection = { x0: c.x, y0: c.y, x1: c.x, y1: c.y };
        draw();
      }
      break;
    case 'picker': {
      const code = cellAt(c.x, c.y);
      S.code = code;
      S.item = overlayItem(code, c.y < NV - 1 ? cellAt(c.x, c.y + 1) : 0) || itemFor(code) || null;
      markPalette();
      toast(`Cogido: ${S.item ? itemName(S.item, area().options) : `código $${code.toString(16)}`}`);
      if (S.tool === 'picker') setTool('pencil');
      break;
    }
    case 'start':
      beginEdit();
      setStart(c.x, c.y);
      break;
    case 'link':
      linkClick(c.x, c.y);
      break;
  }
}

function pointerMove(e) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture && pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    const mid = (p1.x + p2.x) / 2;
    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const midY = (p1.y + p2.y) / 2;
    viewport.scrollLeft -= mid - gesture.mid;
    viewport.scrollTop -= midY - (gesture.midY ?? midY);
    gesture.mid = mid;
    gesture.midY = midY;
    const z = Math.round(gesture.zoom * (dist / gesture.dist));
    if (z !== S.zoom) setZoom(z, mid - view.getBoundingClientRect().left);
    return;
  }
  const c = cellFromEvent(e);
  const changedHover = !S.hover || S.hover.x !== c.x || S.hover.y !== c.y;
  S.hover = c;
  if (changedHover) updateStatus();
  if (!drag) {
    if (changedHover) draw();
    return;
  }
  switch (drag.kind) {
    case 'hand':
      viewport.scrollLeft = drag.scroll - (e.clientX - drag.startX);
      viewport.scrollTop = drag.scrollY - (e.clientY - drag.startY);
      break;
    case 'paint':
      if (c.x !== drag.last.x || c.y !== drag.last.y) {
        paintLine(drag.last.x, drag.last.y, c.x, c.y, drag.code);
        drag.last = c;
      }
      break;
    case 'rect':
      drag.x1 = Math.max(0, Math.min(area().width - 1, c.x));
      drag.y1 = Math.max(0, Math.min(NV - 1, c.y));
      draw();
      break;
    case 'select':
      S.selection.x1 = Math.max(0, Math.min(area().width - 1, c.x));
      S.selection.y1 = Math.max(0, Math.min(NV - 1, c.y));
      draw();
      break;
  }
}

function pointerUp(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) gesture = null;
  if (!drag) return;
  if (drag.kind === 'rect') {
    beginEdit();
    fillRect(drag.x0, drag.y0, drag.x1, drag.y1, S.code);
  }
  if (drag.kind === 'hand') view.style.cursor = S.tool === 'hand' ? 'grab' : 'crosshair';
  if (drag.kind !== 'hand') saveSession();
  drag = null;
  draw();
}

// --- UI state --------------------------------------------------------------------------

function setDirty(v) {
  S.dirty = v;
  $('dirty').textContent = v ? '●' : '';
  saveSessionSoon();
}

function updateStatus() {
  const a = area();
  const h = S.hover;
  if (h && inside(h.x, h.y)) {
    const code = cellAt(h.x, h.y);
    const it = overlayItem(code, h.y < NV - 1 ? cellAt(h.x, h.y + 1) : 0) || itemFor(code);
    $('st-cell').textContent = `${h.x}, ${h.y}`;
    $('st-code').textContent = code === SP ? 'vacío' : it ? itemName(it, a.options) : `código $${code.toString(16).toUpperCase()}`;
  } else {
    $('st-cell').textContent = '—';
    $('st-code').textContent = '—';
  }
  $('st-width').textContent = `${a.width} col.`;
}

function renderZones() {
  const box = $('zones');
  box.innerHTML = '';
  S.level.areas.forEach((a, i) => {
    if (!a) return;
    const b = document.createElement('button');
    b.textContent = `${i + 1}`;
    b.title = `Zona ${i + 1}${i === 0 ? ' (inicio del nivel)' : ''}`;
    b.classList.toggle('on', i === S.areaIndex);
    b.addEventListener('click', () => switchArea(i));
    box.appendChild(b);
  });
  if (S.level.areas.length < L.MAX_ZONES || S.level.areas.some((a) => !a)) {
    const add = document.createElement('button');
    add.textContent = '+';
    add.title = 'Nueva zona (se conecta con la herramienta 🔗 Enlace)';
    add.addEventListener('click', addZone);
    box.appendChild(add);
  }
}

function addZone() {
  let i = S.level.areas.findIndex((a) => !a);
  if (i < 0) i = S.level.areas.length;
  if (i >= L.MAX_ZONES) return toast(`Máximo ${L.MAX_ZONES} zonas.`);
  beginEdit();
  const z = L.newArea(40, area().options);
  z.options.InitX = 2 * W + 10;
  z.options.InitY = 9 * H;
  S.level.areas[i] = z;
  switchArea(i);
  toast(`Zona ${i + 1} creada. Conéctala con la herramienta 🔗 Enlace.`);
}

function updateUI() {
  $('level-name').value = S.level.name;
  renderZones();
  $('btn-undo').disabled = !S.undo.length;
  $('btn-redo').disabled = !S.redo.length;
  $('btn-grid').classList.toggle('on', S.grid);
  updateStatus();
}

// --- session (survives reloads and the play test) ----------------------------------

let sessionTimer = 0;
function saveSessionSoon() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(saveSession, 400);
}

function saveSession() {
  clearTimeout(sessionTimer);
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      data: L.serialize(S.level),
      source: S.source,
      areaIndex: S.areaIndex,
      dirty: S.dirty,
      zoom: S.zoom,
      scroll: viewport.scrollLeft,
      grid: S.grid,
    }));
  } catch {
    // storage unavailable
  }
}

function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!s) return false;
    S.level = L.deserialize(s.data);
    S.source = s.source || { type: 'new' };
    S.areaIndex = s.areaIndex === 1 && S.level.areas[1] ? 1 : 0;
    S.dirty = !!s.dirty;
    S.zoom = s.zoom || 3;
    S.grid = s.grid !== false;
    S._scroll = s.scroll || 0;
    return true;
  } catch {
    return false;
  }
}

function openLevel(level, source) {
  S.level = level;
  S.source = source;
  S.areaIndex = 0;
  S.undo = [];
  S.redo = [];
  S.selection = null;
  S.pasting = false;
  setDirty(false);
  fitZoom();
  viewport.scrollLeft = 0;
  refreshAll();
  viewport.scrollTop = viewport.scrollHeight;
  saveSession();
}

// --- dialogs ----------------------------------------------------------------------------

function openDialog(id) {
  const d = $(id);
  if (!d.open) d.showModal();
}

for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => b.closest('dialog').close());

function fillOpenDialog() {
  const mine = $('open-mine');
  mine.innerHTML = '';
  const list = L.listMyLevels().sort((a, b) => b.updated - a.updated);
  if (!list.length) mine.innerHTML = '<div class="hint">Todavía no has guardado niveles.</div>';
  for (const it of list) {
    const row = document.createElement('div');
    row.className = 'item';
    const date = new Date(it.updated).toLocaleString();
    row.innerHTML = `<span class="name">${escapeHtml(it.name)}</span><small>${date}</small>`;
    const open = document.createElement('button');
    open.textContent = 'Abrir';
    open.addEventListener('click', () => {
      $('dlg-open').close();
      openLevel(L.getMyLevel(it.id), { type: 'my', id: it.id });
      toast(`Abierto «${it.name}».`);
    });
    const del = document.createElement('button');
    del.textContent = 'Borrar';
    del.addEventListener('click', () => {
      if (!confirm(`¿Borrar «${it.name}» de Mis niveles?`)) return;
      L.deleteMyLevel(it.id);
      if (S.source.type === 'my' && S.source.id === it.id) S.source = { type: 'new' };
      fillOpenDialog();
    });
    row.append(open, del);
    mine.appendChild(row);
  }
  const builtin = $('open-builtin');
  builtin.innerHTML = '';
  for (const b of L.builtinList()) {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `<span class="name">${b.name}</span>`;
    const open = document.createElement('button');
    open.textContent = 'Abrir';
    open.addEventListener('click', () => {
      $('dlg-open').close();
      openLevel(L.loadBuiltin(b.key), { type: 'builtin', key: b.key });
      toast(`Abierto ${b.name}. Al guardar se crea una copia en Mis niveles.`);
    });
    row.appendChild(open);
    builtin.appendChild(row);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Options form
const SKY = ['Azul con horizonte', 'Gris claro', 'Degradado turquesa', 'Noche', 'Azul pálido',
  'Atardecer amarillo', 'Ladrillo marrón', 'Ladrillo gris', 'Ladrillo oscuro', 'Atardecer naranja',
  'Degradado azul', 'Degradado blanco', 'Degradado celeste'];
const BACKGR = { 0: 'Ninguno (color liso)', 1: 'Colinas redondas', 2: 'Colinas (2)', 3: 'Montañas', 4: 'Ladrillos animados',
  6: 'Columnas', 9: 'Colinas bajas', 10: 'Colinas altas' };
const WALLS = { 0: 'Verde', 1: 'Arena', 2: 'Verde con colores «Suelo»', 3: 'Marrón', 4: 'Hierba', 5: 'Desierto',
  100: 'Ladrillos 1', 101: 'Ladrillos 2', 102: 'Ladrillos 3' };
const WALLS_EXTRA = { 0: 'Verde', 1: 'Arena', 2: 'Verde con colores «Suelo»', 3: 'Marrón', 4: 'Hierba', 5: 'Desierto' };

// Every look used by the game (options of each level, area and turbo round)
const THEMES = [
  { raw: 'OPTIONS_0', name: 'Título: colinas al atardecer' },
  { raw: 'OPTIONS_1A', name: 'Nivel 1: praderas y palmeras' },
  { raw: 'OPT_1A', name: 'Nivel 1 turbo: atardecer' },
  { raw: 'OPTIONS_1B', name: 'Nivel 1 área 2: ladrillo' },
  { raw: 'OPTIONS_2A', name: 'Nivel 2: ladrillo oscuro' },
  { raw: 'OPT_2A', name: 'Nivel 2 turbo: columnas' },
  { raw: 'OPTIONS_3A', name: 'Nivel 3: cielo y palmeras' },
  { raw: 'OPT_3A', name: 'Nivel 3 turbo: cielo celeste' },
  { raw: 'OPTIONS_5A', name: 'Nivel 4: montañas' },
  { raw: 'OPT_5A', name: 'Nivel 4 turbo: tarde naranja' },
  { raw: 'OPTIONS_5B', name: 'Nivel 4 área 2: columnas y lava' },
  { raw: 'OPTIONS_6A', name: 'Nivel 5: colinas y árboles' },
  { raw: 'OPT_6A', name: 'Nivel 5 turbo: noche' },
  { raw: 'OPTIONS_6B', name: 'Nivel 5 área 2: colinas bajas' },
  { raw: 'OPTIONS_4A', name: 'Nivel 6: castillo gris' },
  { raw: 'OPT_4A', name: 'Nivel 6 turbo: castillo' },
  { raw: 'OPTIONS_4B', name: 'Nivel 6 área 2: castillo marrón' },
];

// Applies the look of a theme to the current zone: sky, background, main
// ground, decoration and colours. The start position and the extra
// terrains (2 and 3, chosen by the user) are kept.
function applyLook(src) {
  beginEdit();
  const o = area().options;
  const keep = { InitX: o.InitX, InitY: o.InitY, WallType2: o.WallType2, WallType3: o.WallType3 };
  Object.assign(o, src, keep);
  refreshAll();
}

const DESIGN = { 0: 'Ninguno', 1: 'Palmeras, vallas y cascadas', 2: 'Árboles y arbustos', 3: 'Ventanas', 4: 'Lava', 5: 'Lava roja' };

function selectHtml(id, options, value) {
  const opts = Object.entries(options).map(([v, n]) => `<option value="${v}"${Number(v) === value ? ' selected' : ''}>${n}</option>`).join('');
  return `<select id="${id}">${opts}</select>`;
}

function swatch(base) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 10;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    const v = rgba[(base + i) & 0xFF];
    x.fillStyle = `rgb(${v & 0xFF},${(v >> 8) & 0xFF},${(v >> 16) & 0xFF})`;
    x.fillRect(i * 8, 0, 8, 10);
  }
  c.style.verticalAlign = 'middle';
  c.style.marginLeft = '6px';
  return c;
}

function fillOptionsDialog() {
  const o = area().options;
  const f = $('opt-form');
  const looks = THEMES.map((t) => `<option value="${t.raw}">${t.name}</option>`).join('');
  f.innerHTML = `
    <label>Copiar aspecto de</label><select id="o-copy"><option value="">—</option>${looks}</select>
    <label>Cielo</label>${selectHtml('o-SkyType', Object.fromEntries(SKY.map((n, i) => [i, n])), o.SkyType)}
    <label>Fondo</label>${selectHtml('o-BackGrType', BACKGR, o.BackGrType)}
    <label>Suelo (terreno A–D)</label>${selectHtml('o-WallType1', WALLS, o.WallType1)}
    <label>Suelo 2 (terreno 2)</label>${selectHtml('o-WallType2', WALLS_EXTRA, WALLS_EXTRA[o.WallType2] ? o.WallType2 : 0)}
    <label>Suelo 3 (terreno 3)</label>${selectHtml('o-WallType3', WALLS_EXTRA, WALLS_EXTRA[o.WallType3] ? o.WallType3 : 0)}
    <label>Decoración # y %</label>${selectHtml('o-Design', DESIGN, o.Design)}
    <label>Horizonte (px)</label><input id="o-Horizon" type="number" min="0" max="255" value="${o.Horizon}">
    <label>Color tuberías</label><div><input id="o-PipeColor" type="number" min="0" max="255" value="${o.PipeColor}"></div>
    <label>Color suelo 1</label><div><input id="o-GroundColor1" type="number" min="0" max="255" value="${o.GroundColor1}"></div>
    <label>Color suelo 2</label><div><input id="o-GroundColor2" type="number" min="0" max="255" value="${o.GroundColor2}"></div>
    <label>Color ladrillos</label><div><input id="o-BrickColor" type="number" min="0" max="255" value="${o.BrickColor}"></div>
    <label>Color madera</label><div><input id="o-WoodColor" type="number" min="0" max="255" value="${o.WoodColor}"></div>
    <label>Color bloque X</label><div><input id="o-XBlockColor" type="number" min="0" max="255" value="${o.XBlockColor}"></div>
    <label>Color fondo 1 / 2</label><div><input id="o-BackGrColor1" type="number" min="0" max="255" value="${o.BackGrColor1}"> <input id="o-BackGrColor2" type="number" min="0" max="255" value="${o.BackGrColor2}"></div>
    <label>Hierba clara (R G B)</label><div class="rgb"><input id="o-C2r" type="number" min="0" max="63" value="${o.C2r}"><input id="o-C2g" type="number" min="0" max="63" value="${o.C2g}"><input id="o-C2b" type="number" min="0" max="63" value="${o.C2b}"></div>
    <label>Hierba oscura (R G B)</label><div class="rgb"><input id="o-C3r" type="number" min="0" max="63" value="${o.C3r}"><input id="o-C3g" type="number" min="0" max="63" value="${o.C3g}"><input id="o-C3b" type="number" min="0" max="63" value="${o.C3b}"></div>
  `;
  for (const n of ['PipeColor', 'GroundColor1', 'GroundColor2', 'BrickColor', 'WoodColor', 'XBlockColor'])
    $(`o-${n}`).parentElement.appendChild(swatch(o[n]));
  for (const el of f.querySelectorAll('select, input')) {
    el.addEventListener('change', () => {
      if (el.id === 'o-copy') {
        if (!el.value) return;
        applyLook(optionsFromBytes(RAW[el.value]));
        fillOptionsDialog();
        return;
      } else {
        const name = el.id.slice(2);
        let v = Number(el.value) | 0;
        v = Math.max(0, Math.min(name.startsWith('C') ? 63 : 255, v));
        beginEdit();
        area().options[name] = v;
      }
      refreshAll();
      fillOptionsDialog();
    });
  }
  $('opt-width').value = area().width;
  $('zone-delete').disabled = S.areaIndex === 0;
}

// --- pipe links (warp zones) ------------------------------------------------------------

const PIPE_L = 0x30;
const PIPE_R = 0x31;
let link = null; // { zone, mx, codeY } origin while choosing the destination

// Finds the pipe mouth for a clicked cell: returns { mx, codeY } where the
// two link codes go (above a pipe opening upwards, below one opening down).
function pipeAt(x, y) {
  const a = area();
  const c = (cx, cy) => (inside(cx, cy) ? a.cells[cx * NV + cy] : 0);
  let mx = -1;
  let my = -1;
  for (const [dx, dy] of [[0, 0], [-1, 0], [0, 1], [-1, 1], [0, -1], [-1, -1]]) {
    if (c(x + dx, y + dy) === PIPE_L && c(x + dx + 1, y + dy) === PIPE_R) {
      mx = x + dx;
      my = y + dy;
      break;
    }
  }
  if (mx < 0) return null;
  const body = (cy) => c(mx, cy) === 0x32 || c(mx, cy) === 0x33;
  const codeY = body(my + 1) || !body(my - 1) ? my - 1 : my + 1;
  if (codeY < 0 || codeY >= NV) return null;
  return { mx, codeY, down: codeY > my };
}

function linkClick(x, y) {
  const p = pipeAt(x, y);
  if (!p) return toast('Haz clic en la boca de una tubería (las piezas de arriba, «Boca izquierda/derecha»).');
  if (link && link.choosing) return linkArrival(p);
  link = { zone: S.areaIndex, ...p };
  const sel = $('link-dest');
  const cur = area().cells[p.mx * NV + p.codeY];
  sel.innerHTML = '';
  const add = (value, text) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    sel.appendChild(o);
  };
  add('none', 'Nada (tubería decorativa)');
  add('exit', 'Salida del nivel (FIN)');
  S.level.areas.forEach((a, i) => {
    if (!a) return;
    add(`zone:${i}`, i === S.areaIndex ? `Otra tubería de esta zona (${i + 1})` : `Zona ${i + 1}`);
  });
  for (let n = 1; n <= 7; n++) add(`warp:${n}`, n === 1 ? 'Warp: siguiente nivel' : `Warp: avanzar ${n} niveles`);
  // preselect the current destination
  let v = 'none';
  if (cur === 0xE7) v = 'exit';
  else if (cur >= 0xC0 && cur <= 0xC7) v = `zone:${cur - 0xC0}`;
  else if (cur === 0xE0) v = `zone:${S.areaIndex}`;
  else if (cur === 0xE1) v = `zone:${S.areaIndex === 0 ? 1 : 0}`;
  else if (cur >= 0xD1 && cur <= 0xD7) v = `warp:${cur - 0xD0}`;
  sel.value = [...sel.options].some((o) => o.value === v) ? v : 'none';
  $('link-where').textContent = `Tubería en la columna ${p.mx}, zona ${S.areaIndex + 1}.`;
  linkHelp();
  openDialog('dlg-link');
}

function linkHelp() {
  const v = $('link-dest').value;
  const zone = v.startsWith('zone:');
  $('link-both').disabled = !zone;
  $('link-help').textContent = zone
    ? 'Al aceptar, haz clic en la tubería de llegada (en la zona elegida). Mario saldrá por ella.'
    : v.startsWith('warp:')
      ? 'En el modo de juego avanza varios niveles (como las warp zones de SMB). En un nivel suelto, termina el nivel.'
      : v === 'exit' ? 'Al entrar se supera el nivel.' : 'La tubería no lleva a ningún sitio.';
}

// Pair numbers ($E8..$EF) already used as arrival marks in a zone
function usedPairs(zone) {
  const a = S.level.areas[zone];
  const used = new Set();
  for (let x = 0; x < a.width - 1; x++)
    for (let y = 0; y < NV; y++) {
      const r = a.cells[(x + 1) * NV + y];
      if (r >= 0xE8 && r <= 0xEF && (a.cells[(x + 1) * NV + y + 1] === PIPE_R || a.cells[(x + 1) * NV + y - 1] === PIPE_R)) used.add(r);
    }
  return used;
}

function linkConfirm() {
  const v = $('link-dest').value;
  $('dlg-link').close();
  const a = area();
  const set = (l, r) => {
    a.cells[link.mx * NV + link.codeY] = l;
    a.cells[(link.mx + 1) * NV + link.codeY] = r;
  };
  if (v === 'none' || v === 'exit' || v.startsWith('warp:')) {
    beginEdit();
    if (v === 'none') set(SP, SP);
    else if (v === 'exit') set(0xE7, 0xE7);
    else set(0xD0 + Number(v.slice(5)), 0xE7);
    refreshColumns(link.mx, link.mx + 1);
    link = null;
    return;
  }
  const target = Number(v.slice(5));
  link.target = target;
  link.both = $('link-both').checked;
  link.choosing = true;
  if (target !== S.areaIndex) switchArea(target);
  setTool('link');
  toast(`Ahora haz clic en la tubería de llegada de la zona ${target + 1} (Esc cancela).`);
}

function linkArrival(p) {
  const origin = link;
  const zoneA = S.level.areas[origin.zone];
  const zoneB = area();
  if (origin.zone === S.areaIndex && p.mx === origin.mx && p.codeY === origin.codeY)
    return toast('Elige otra tubería distinta de la de entrada.');
  // a pair number free in both zones
  const used = new Set([...usedPairs(origin.zone), ...usedPairs(S.areaIndex)]);
  for (const code of [zoneA.cells[(origin.mx + 1) * NV + origin.codeY], zoneB.cells[(p.mx + 1) * NV + p.codeY]]) used.delete(code);
  let pair = 0;
  for (let c = 0xE8; c <= 0xEF; c++) if (!used.has(c)) { pair = c; break; }
  if (!pair) return toast('No quedan números de pareja libres (máximo 8 por zona).');
  beginEdit();
  const sameZone = origin.zone === S.areaIndex;
  const goCode = sameZone ? 0xE0 : 0xC0 + S.areaIndex;
  const backCode = !origin.both ? 0xEE : sameZone ? 0xE0 : 0xC0 + origin.zone;
  const A = S.level.areas[origin.zone];
  A.cells[origin.mx * NV + origin.codeY] = goCode;
  A.cells[(origin.mx + 1) * NV + origin.codeY] = pair;
  zoneB.cells[p.mx * NV + p.codeY] = backCode;
  zoneB.cells[(p.mx + 1) * NV + p.codeY] = pair;
  link = null;
  refreshColumns(0, area().width);
  toast(`Enlazadas (pareja ${pair - 0xE7})${origin.both ? ', ida y vuelta' : ''}.`);
}

// --- play test ------------------------------------------------------------------------------

function playTest() {
  if (!L.setPlaytest(S.level)) return toast('No se pudo preparar la prueba (almacenamiento lleno).');
  saveSession();
  location.href = 'index.html?test=1';
}

// --- save -----------------------------------------------------------------------------------------

function save(asNew = false) {
  S.level.name = $('level-name').value.trim() || S.level.name || 'Nivel';
  if (asNew || S.source.type !== 'my') {
    const name = prompt('Nombre del nivel:', S.source.type === 'my' && asNew ? `${S.level.name} (copia)` : S.level.name);
    if (name === null) return;
    S.level.name = name.trim().slice(0, 40) || 'Nivel';
    try {
      const id = L.saveMyLevel(S.level);
      S.source = { type: 'my', id };
    } catch (e) {
      return toast(e.message);
    }
  } else {
    try {
      L.saveMyLevel(S.level, S.source.id);
    } catch (e) {
      return toast(e.message);
    }
  }
  setDirty(false);
  updateUI();
  saveSession();
  toast(`Guardado en Mis niveles: «${S.level.name}». Juégalo desde LEVEL SELECT.`);
}

// --- wiring ---------------------------------------------------------------------------------------

const keysDown = new Set();

function bind() {
  view.addEventListener('pointerdown', pointerDown);
  view.addEventListener('pointermove', pointerMove);
  view.addEventListener('pointerup', pointerUp);
  view.addEventListener('pointercancel', pointerUp);
  view.addEventListener('pointerleave', () => {
    if (!drag) {
      S.hover = null;
      updateStatus();
      draw();
    }
  });
  view.addEventListener('contextmenu', (e) => e.preventDefault());
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      setZoom(S.zoom + (e.deltaY < 0 ? 1 : -1), e.clientX - view.getBoundingClientRect().left);
    } else {
      if (e.shiftKey) viewport.scrollTop += e.deltaY;
      else viewport.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    }
  }, { passive: false });
  viewport.addEventListener('scroll', () => {
    draw();
    saveSessionSoon();
  });
  window.addEventListener('resize', resizeView);

  $('level-name').addEventListener('change', () => {
    S.level.name = $('level-name').value.trim().slice(0, 40) || 'Nivel';
    setDirty(true);
  });
  $('btn-open').addEventListener('click', () => { fillOpenDialog(); openDialog('dlg-open'); });
  $('btn-new').addEventListener('click', () => {
    if (S.dirty && !confirm('Hay cambios sin guardar en Mis niveles. ¿Empezar un nivel nuevo?')) return;
    openLevel(L.newLevel(), { type: 'new' });
  });
  $('btn-save').addEventListener('click', () => save(false));
  $('btn-saveas').addEventListener('click', () => save(true));
  $('btn-play').addEventListener('click', playTest);
  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);
  $('btn-zoom-in').addEventListener('click', () => setZoom(S.zoom + 1));
  $('btn-zoom-out').addEventListener('click', () => setZoom(S.zoom - 1));
  $('btn-grid').addEventListener('click', () => { S.grid = !S.grid; updateUI(); draw(); saveSession(); });
  // themes: the look of every level and area of the game
  for (const t of THEMES) {
    const o = document.createElement('option');
    o.value = t.raw;
    o.textContent = t.name;
    $('theme').appendChild(o);
  }
  $('theme').addEventListener('change', () => {
    const raw = $('theme').value;
    $('theme').value = '';
    if (!raw) return;
    applyLook(optionsFromBytes(RAW[raw]));
    toast(`Tema aplicado a la zona ${S.areaIndex + 1}.`);
  });
  $('link-ok').addEventListener('click', linkConfirm);
  $('link-dest').addEventListener('change', linkHelp);
  $('btn-options').addEventListener('click', () => { fillOptionsDialog(); openDialog('dlg-options'); });
  $('btn-export').addEventListener('click', () => openDialog('dlg-file'));

  $('btn-copy').addEventListener('click', copySel);
  $('btn-cut').addEventListener('click', cutSel);
  $('btn-paste').addEventListener('click', startPaste);
  $('btn-del').addEventListener('click', deleteSel);
  $('btn-flip').addEventListener('click', flipSel);

  // options dialog extras
  $('opt-width-apply').addEventListener('click', () => {
    const w = Number($('opt-width').value) | 0;
    beginEdit();
    S.level.areas[S.areaIndex] = L.resizeArea(area(), w);
    refreshAll();
    fillOptionsDialog();
  });
  $('col-insert').addEventListener('click', () => insertColumn(S.cursorX));
  $('col-delete').addEventListener('click', () => deleteColumn(S.cursorX));
  $('zone-delete').addEventListener('click', () => {
    const i = S.areaIndex;
    if (i === 0) return toast('La zona 1 es donde empieza el nivel: no se puede eliminar.');
    if (!confirm(`¿Eliminar la zona ${i + 1}? Las tuberías que lleven a ella dejarán de funcionar.`)) return;
    beginEdit();
    if (i === S.level.areas.length - 1) S.level.areas.pop();
    else S.level.areas[i] = null; // keep the numbers of the other zones
    while (S.level.areas.length > 2 && !S.level.areas[S.level.areas.length - 1]) S.level.areas.pop();
    $('dlg-options').close();
    switchArea(0);
    toast(`Zona ${i + 1} eliminada.`);
  });

  // export / import
  $('exp-json').addEventListener('click', () => download(`${safeName(S.level.name)}.json`, JSON.stringify(L.serialize(S.level), null, 1)));
  $('exp-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(L.serialize(S.level)));
      toast('JSON copiado al portapapeles.');
    } catch {
      $('imp-text').value = JSON.stringify(L.serialize(S.level));
      toast('No se pudo copiar: el JSON está en el cuadro de texto.');
    }
  });
  $('exp-pas').addEventListener('click', () => {
    const ident = safeName(S.level.name).replace(/[^A-Za-z0-9]/g, '') || 'Custom';
    download(`${safeName(S.level.name)}.pas`, L.toPascal(S.level, ident), 'text/plain');
  });
  const importText = (text) => {
    try {
      const level = L.deserialize(JSON.parse(text));
      $('dlg-file').close();
      openLevel(level, { type: 'new' });
      setDirty(true);
      toast(`Importado «${level.name}». Guárdalo para tenerlo en Mis niveles.`);
    } catch (e) {
      toast(`No se pudo importar: ${e.message}`);
    }
  };
  $('imp-file').addEventListener('click', () => $('imp-input').click());
  $('imp-input').addEventListener('change', async () => {
    const f = $('imp-input').files[0];
    if (f) importText(await f.text());
    $('imp-input').value = '';
  });
  $('imp-paste').addEventListener('click', () => importText($('imp-text').value));

  // palette drawer on phones
  $('side').addEventListener('click', (e) => {
    if (e.target === $('side') || e.target.classList.contains('group-title')) $('side').classList.toggle('collapsed');
  });

  window.addEventListener('keydown', (e) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      || e.target instanceof HTMLSelectElement;
    if (typing || document.querySelector('dialog[open]')) return;
    keysDown.add(e.key);
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (mod && k === 's') { e.preventDefault(); save(false); return; }
    if (mod && k === 'c') { e.preventDefault(); copySel(); return; }
    if (mod && k === 'x') { e.preventDefault(); cutSel(); return; }
    if (mod && k === 'v') { e.preventDefault(); startPaste(); return; }
    if (mod) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSel(); return; }
    if (e.key === 'Escape') {
      if (link && link.choosing) toast('Enlace cancelado.');
      link = null;
      S.pasting = false;
      S.selection = null;
      draw();
      return;
    }
    if (e.key === '+' || e.key === '=') { setZoom(S.zoom + 1); return; }
    if (e.key === '-') { setZoom(S.zoom - 1); return; }
    if (k === 'g') { S.grid = !S.grid; updateUI(); draw(); return; }
    if (k === 'p') { playTest(); return; }
    if (e.key === ' ') { e.preventDefault(); return; }
    const t = TOOLS.find((x) => x.key === k);
    if (t) setTool(t.id);
    if (e.key === 'ArrowRight') viewport.scrollLeft += W * S.zoom * 4;
    if (e.key === 'ArrowLeft') viewport.scrollLeft -= W * S.zoom * 4;
  });
  window.addEventListener('keyup', (e) => keysDown.delete(e.key));
  window.addEventListener('blur', () => keysDown.clear());
  window.addEventListener('pagehide', saveSession);
}

function switchArea(i) {
  if (!S.level.areas[i] || i === S.areaIndex) return;
  S.areaIndex = i;
  S.selection = null;
  S.pasting = false;
  fitZoom();
  viewport.scrollLeft = 0;
  refreshAll();
  saveSession();
}

// --- start --------------------------------------------------------------------------------------------

function init() {
  buildTools();
  bind();
  const params = new URLSearchParams(location.search);
  const restored = loadSession();
  if (params.get('open')) {
    const key = params.get('open');
    const lv = key.startsWith('my:') ? L.getMyLevel(key.slice(3)) : L.loadBuiltin(key);
    if (lv) {
      S.level = lv;
      S.source = key.startsWith('my:') ? { type: 'my', id: key.slice(3) } : { type: 'builtin', key };
      S.areaIndex = 0;
      S.dirty = false;
      S._scroll = 0;
    }
  } else if (!restored) {
    S.level = L.loadBuiltin('smb:1-1');
    S.source = { type: 'builtin', key: 'smb:1-1' };
  }
  setTool('pencil');
  S.item = itemFor(S.code);
  resizeView();
  // the zoom always fits the screen in use (it may be another device)
  fitZoom();
  refreshAll();
  viewport.scrollLeft = S._scroll || 0;
  viewport.scrollTop = viewport.scrollHeight; // start at the ground
  setDirty(S.dirty);
  resizeView();
  if (!restored) toast('Bienvenido al editor. Abre un nivel o empieza uno nuevo.');
}

init();

// For tests in the browser console
window.EDITOR = { S, refreshAll, setTool, selectItem, undo, redo, save, L };
