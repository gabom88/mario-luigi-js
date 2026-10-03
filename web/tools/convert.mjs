// Extracts all game data (sprites, levels, palettes, fonts, demo keys)
// from the original Turbo Pascal sources into web/src/data.js.
//
//   node web/tools/convert.mjs
//
// Data in the original game lives in "assembler procedures" made only of
// db/dw directives, either inline in the .PAS units or in included files
// (.$00, .$01, ..., .BK, MPAL256). Bytes are kept exactly as in the original
// (sprites stay in the 4-plane VGA layout the game code expects).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..', '..');
const OUT = path.resolve(here, '..', 'src', 'data.js');

const CONSTS = { W: 20, H: 14 };

function readLatin1(file) {
  return fs.readFileSync(file).toString('latin1');
}

function stripComments(s) {
  // Pascal comments do not nest: '{ a { b }' ends at the first '}'.
  return s.replace(/\{[^}]*\}/g, ' ').replace(/\(\*[\s\S]*?\*\)/g, ' ');
}

// Split a directive argument list on commas that are not inside quotes.
function splitArgs(s) {
  const out = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") {
      if (inStr && s[i + 1] === "'") { cur += "''"; i++; continue; }
      inStr = !inStr;
      cur += c;
    } else if (c === ',' && !inStr) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

function evalNumber(expr) {
  let e = expr.trim();
  e = e.replace(/\$([0-9a-fA-F]+)/g, (_, h) => String(parseInt(h, 16)));
  e = e.replace(/\b([0-9][0-9a-fA-F]*)[hH]\b/g, (_, h) => String(parseInt(h, 16)));
  e = e.replace(/\b([WH])\b/g, (_, c) => String(CONSTS[c]));
  if (!/^[0-9+\-*/() ]+$/.test(e)) throw new Error(`Cannot evaluate '${expr}'`);
  // eslint-disable-next-line no-new-func
  return Function(`return (${e.replace(/\//g, '/')});`)();
}

// Parse the body of an asm block made of db/dw directives (and optional
// '@Label:' lines). Returns { bytes, labels } or null if it contains code.
function parseDataBlock(body) {
  const bytes = [];
  const labels = {};
  const fixups = []; // dw @Label
  const text = stripComments(body);
  for (let raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    const lab = /^@(\w+):\s*(.*)$/.exec(line);
    if (lab) {
      labels[lab[1].toLowerCase()] = bytes.length;
      line = lab[2].trim();
      if (!line) continue;
    }
    const m = /^(db|dw)\s+(.*)$/i.exec(line);
    if (!m) return null;
    const kind = m[1].toLowerCase();
    for (const arg of splitArgs(m[2])) {
      if (arg === '') continue;
      if (arg.startsWith("'")) {
        const str = arg.slice(1, -1).replace(/''/g, "'");
        for (const ch of str) bytes.push(ch.charCodeAt(0) & 0xFF);
        continue;
      }
      if (kind === 'dw' && arg.startsWith('@')) {
        fixups.push({ pos: bytes.length, label: arg.slice(1).toLowerCase() });
        bytes.push(0, 0);
        continue;
      }
      const v = evalNumber(arg);
      if (kind === 'db') bytes.push(v & 0xFF);
      else bytes.push(v & 0xFF, (v >> 8) & 0xFF);
    }
  }
  return { bytes, labels, fixups };
}

const blocks = {};    // NAME -> Uint8Array
const labelled = {};  // NAME -> { bytes, labels, fixups }

function scanText(text, origin) {
  const re = /procedure\s+(\w+)\s*;\s*assembler\s*;\s*asm\b([\s\S]*?)\bend\s*;/gi;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1].toUpperCase();
    const parsed = parseDataBlock(m[2]);
    if (!parsed) continue;
    if (parsed.fixups.length) {
      labelled[name] = parsed;
    } else {
      if (blocks[name] && origin.endsWith('.PAS')) continue;
      blocks[name] = Uint8Array.from(parsed.bytes);
    }
  }
}

const files = fs.readdirSync(SRC);
for (const f of files) {
  const full = path.join(SRC, f);
  if (!fs.statSync(full).isFile()) continue;
  const up = f.toUpperCase();
  if (/\.\$\d\d$/.test(up) || up.endsWith('.BK') || up === 'MPAL256' || up.endsWith('.PAS')) {
    scanText(readLatin1(full), up);
  }
}

// Fonts: a table of dw @Glyph pointers followed by the glyphs
// (each glyph: width, height, then a packed LSB-first bit stream).
function extractFont(name) {
  const f = labelled[name];
  if (!f) throw new Error(`Font ${name} not found`);
  const glyphs = [];
  const starts = Object.values(f.labels).sort((a, b) => a - b);
  for (const fx of f.fixups) {
    const start = f.labels[fx.label];
    if (start === undefined) throw new Error(`Missing label ${fx.label}`);
    const next = starts.find((s) => s > start) ?? f.bytes.length;
    glyphs.push(f.bytes.slice(start, next));
  }
  return glyphs;
}

// DEMOKEYS.OBJ: an OMF object file holding the recorded demo key sequence.
function extractMacro() {
  const buf = fs.readFileSync(path.join(SRC, 'DEMOKEYS.OBJ'));
  const data = new Uint8Array(9 * 100 * 2);
  let p = 0;
  while (p < buf.length) {
    const type = buf[p];
    const len = buf[p + 1] | (buf[p + 2] << 8);
    const body = buf.subarray(p + 3, p + 3 + len);
    if (type === 0xA0) {
      let q = 0;
      q += body[q] & 0x80 ? 2 : 1; // segment index
      const offset = body[q] | (body[q + 1] << 8);
      q += 2;
      const chunk = body.subarray(q, body.length - 1); // drop checksum
      data.set(chunk.subarray(0, Math.max(0, Math.min(chunk.length, data.length - offset))), offset);
    }
    p += 3 + len;
  }
  return data;
}

const required = [
  'PAL256', 'BOGEN', 'BOGEN7', 'BOGEN26', 'MOUNT', 'LEVEL_1A', 'OPTIONS_1A',
  'GREEN000', 'SWMAR000', 'INTRO000', 'START001', 'FIRE001', 'PALPILL002',
];
for (const r of required) {
  if (!blocks[r]) throw new Error(`Missing data block ${r}`);
}

const b64 = (arr) => Buffer.from(arr).toString('base64');

let out = '';
out += '// Generated by web/tools/convert.mjs from the original Mario & Luigi\n';
out += '// sources by Mike Wiering. Do not edit by hand.\n\n';
out += 'function d(s) {\n';
out += '  const b = atob(s);\n';
out += '  const a = new Uint8Array(b.length);\n';
out += '  for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);\n';
out += '  return a;\n';
out += '}\n\n';
out += 'export const RAW = {\n';
for (const name of Object.keys(blocks).sort()) {
  out += `  ${name}: d('${b64(blocks[name])}'),\n`;
}
out += '};\n\n';
for (const font of ['SWISSFONT', 'FONT8X8']) {
  out += `export const ${font} = [\n`;
  for (const g of extractFont(font)) out += `  d('${b64(g)}'),\n`;
  out += '];\n\n';
}
out += `export const MACRO = d('${b64(extractMacro())}');\n`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log(`Wrote ${OUT}: ${Object.keys(blocks).length} data blocks, ${(out.length / 1024).toFixed(0)} KB`);
