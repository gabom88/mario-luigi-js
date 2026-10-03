// Every block code of the engine, grouped for the editor palette.
//
// sprite: name of a RAW sprite (or a function returning the image data for
// the current level), w/h: its size. overlay: the code is not drawn by the
// engine (enemies, contents, links...), the editor draws its icon on top.
// badge: short text drawn on the cell.

import { RAW } from '../data.js';
import { FigList } from './render.js';

const ch = (s) => s.charCodeAt(0);

const designSprite = (n) => (opt) => {
  const map = {
    1: ['FALL000', 'FALL001'],
    2: ['TREE003', 'TREE002'],
    3: ['WINDOW001', 'WINDOW000'],
    4: ['LAVA000', 'LAVA001'],
    5: ['LAVA2001', 'LAVA2001'],
  }[opt.Design];
  return map ? RAW[map[n]] : null;
};

const designName = (n) => (opt) => ({
  1: ['Cascada (arriba)', 'Cascada'],
  2: ['Tronco de árbol', 'Copa de árbol'],
  3: ['Ventana (arriba)', 'Ventana'],
  4: ['Lava (superficie)', 'Lava'],
  5: ['Lava roja', 'Lava roja (animada)'],
}[opt.Design]?.[n] ?? (n ? 'Decoración %' : 'Decoración #'));

export const GROUPS = [
  {
    name: 'Básico',
    items: [
      { code: 0x20, name: 'Vacío (borrar)', key: 'Espacio' },
      { code: ch('A'), name: 'Terreno A', sprite: () => FigList[1][2], help: 'Suelo con bordes automáticos (hierba arriba). Se une con otras A.' },
      { code: ch('B'), name: 'Terreno B', sprite: () => FigList[1][2], help: 'Igual que A, pero no se une con A: sirve para separar dos zonas de suelo.' },
      { code: ch('C'), name: 'Terreno C', sprite: () => FigList[1][2], help: 'Capa delantera: se une con A, B y D.' },
      { code: ch('D'), name: 'Terreno D', sprite: () => FigList[1][2], help: 'Como C, para separar dos zonas.' },
      { code: 0xB2, name: 'Terreno 2', sprite: () => FigList[2][2], help: 'Otro tipo de suelo en el mismo nivel: usa el «Suelo 2» de las opciones. Sus bordes son independientes del terreno A.' },
      { code: 0xB3, name: 'Terreno 2 (separado)', sprite: () => FigList[2][2], help: 'Como Terreno 2, pero no se une con él.' },
      { code: 0xB4, name: 'Terreno 3', sprite: () => FigList[3][2], help: 'Un tercer tipo de suelo: usa el «Suelo 3» de las opciones.' },
      { code: 0xB5, name: 'Terreno 3 (separado)', sprite: () => FigList[3][2], help: 'Como Terreno 3, pero no se une con él.' },
      { code: ch('*'), name: 'Moneda', sprite: 'COIN000' },
    ],
  },
  {
    name: 'Bloques',
    items: [
      { code: ch('?'), name: 'Bloque ?', sprite: 'QUEST000', help: 'Da lo que haya en la celda de ENCIMA (ver «Contenido de ?»). Si encima está vacío, da una moneda.' },
      { code: ch('@'), name: 'Bloque usado', sprite: 'QUEST001' },
      { code: ch('$'), name: 'Bloque invisible', sprite: 'QUEST000', overlay: true, badge: '?', help: 'No se ve hasta que lo golpeas desde abajo.' },
      { code: ch('J'), name: 'Ladrillo', sprite: 'BLOCK001', help: 'Mario grande lo rompe. Color: opción «Ladrillos».' },
      { code: ch('I'), name: 'Bloque de piedra', sprite: 'BLOCK000' },
      { code: ch('K'), name: 'Bloque nota', sprite: 'NOTE000', help: 'Rebota al pisarlo.' },
      { code: ch('X'), name: 'Bloque X', sprite: 'XBLOCK000' },
      { code: ch('W'), name: 'Madera', sprite: 'WOOD000' },
      { code: ch('='), name: 'Pinchos', sprite: 'PIN000', help: 'Dañan al tocarlos. Apuntan hacia el lado libre.' },
    ],
  },
  {
    name: 'Tuberías',
    items: [
      { code: ch('0'), name: 'Boca izquierda', sprite: 'PIPE000' },
      { code: ch('1'), name: 'Boca derecha', sprite: 'PIPE001' },
      { code: ch('2'), name: 'Tubo izquierdo', sprite: 'PIPE002' },
      { code: ch('3'), name: 'Tubo derecho', sprite: 'PIPE003' },
      { code: 0xE7, name: 'Salida del nivel', overlay: true, badge: 'FIN', help: 'En las DOS celdas sobre la boca de una tubería: al entrar (abajo) se supera el nivel. Lo más fácil: herramienta 🔗 Enlace.' },
    ],
  },
  {
    name: 'Enlaces de tubería (avanzado)',
    items: [
      { code: 0xE0, name: 'Ir a otra tubería de esta zona', overlay: true, badge: '→', help: 'Celda sobre la boca IZQUIERDA. La derecha lleva el número de pareja; se sale por la otra tubería con el mismo número. Más fácil: herramienta 🔗 Enlace. (En un bloque ? significa champiñón.)' },
      { code: 0xE1, name: 'Ir a la otra área (1⇄2)', overlay: true, badge: '⇄', help: 'Código del juego original para cambiar entre la zona 1 y la 2. (En un bloque ? significa vida extra.)' },
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({
        code: 0xC0 + n,
        name: `Ir a la zona ${n + 1}`,
        overlay: true,
        badge: `Z${n + 1}`,
        help: `Celda sobre la boca IZQUIERDA: lleva a la zona ${n + 1}, a la tubería con el mismo número de pareja.`,
      })),
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({
        code: 0xD0 + n,
        name: n === 1 ? 'Warp: siguiente nivel' : `Warp: avanzar ${n} niveles`,
        overlay: true,
        badge: `W${n}`,
        help: `Como la salida, pero en el modo de juego avanza ${n} nivel${n > 1 ? 'es' : ''} (warp zone). En niveles sueltos termina el nivel.`,
      })),
      { code: 0xEE, name: 'Solo llegada', overlay: true, badge: '◎', help: 'Celda sobre la boca IZQUIERDA de una tubería de llegada por la que no se puede entrar.' },
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({
        code: 0xE8 + n,
        name: `Pareja ${n + 1}`,
        overlay: true,
        badge: `#${n + 1}`,
        help: 'Celda sobre la boca DERECHA: identifica la pareja. Las dos tuberías conectadas llevan el mismo número.',
      })),
    ],
  },
  {
    name: 'Contenido de ?',
    items: [
      { code: 0xE0, name: 'Champiñón / flor', sprite: 'CHAMP000', overlay: true, help: 'Encima de un bloque ?: champiñón si Mario es pequeño, flor si es grande.' },
      { code: 0xE1, name: 'Vida extra', sprite: 'LIFE000', overlay: true, help: 'Encima de un bloque ?.' },
      { code: 0xE2, name: 'Estrella', sprite: 'STAR000', overlay: true, help: 'Encima de un bloque ?.' },
      { code: 0xED, name: 'Champiñón venenoso', sprite: 'POISON000', overlay: true, help: 'Encima de un bloque ?.' },
      { code: 0xE3, name: '10 monedas', sprite: 'COIN000', overlay: true, badge: 'x10', help: 'Encima de un bloque ? o ladrillo: da varias monedas.' },
      { code: 0xEF, name: 'Convertir en nota', sprite: 'NOTE000', overlay: true, badge: '♪', help: 'Encima de un bloque: al golpearlo se convierte en bloque nota.' },
    ],
  },
  {
    name: 'Enemigos',
    items: [
      { code: 0x80, name: 'Goomba', sprite: 'CHIBIBO000', overlay: true },
      { code: 0x83, name: 'Goomba (variante)', sprite: 'CHIBIBO002', overlay: true },
      { code: 0x87, name: 'Erizo', sprite: 'RED000', overlay: true, mirror: true },
      { code: 0x88, name: 'Koopa verde', sprite: 'GRKOOPA000', w: 20, h: 24, overlay: true, help: 'Cae por los bordes.' },
      { code: 0x89, name: 'Koopa rojo', sprite: 'RDKOOPA000', w: 20, h: 24, overlay: true, help: 'Se da la vuelta en los bordes.' },
      { code: 0x84, name: 'Piraña (tímida)', sprite: 'PPLANT002', w: 24, h: 20, overlay: true, help: 'Colócala 2 filas ENCIMA de la boca izquierda de una tubería. No sale si estás cerca.' },
      { code: 0x85, name: 'Piraña', sprite: 'PPLANT002', w: 24, h: 20, overlay: true, help: '2 filas encima de la boca izquierda. No sale si estás justo encima.' },
      { code: 0x86, name: 'Piraña de fuego', sprite: 'PPLANT000', w: 24, h: 20, overlay: true, help: '2 filas encima de la boca izquierda. Sale siempre.' },
      { code: 0x81, name: 'Pez saltarín', sprite: 'FISH001', overlay: true, help: 'Salta desde el fondo de la pantalla en esta columna.' },
      { code: 0x82, name: 'Bola de lava', sprite: 'F000', overlay: true, help: 'Salta desde el fondo de la pantalla en esta columna.' },
      { code: 0xB0, name: 'Plataforma móvil', sprite: 'LIFT1000', overlay: true, help: 'Se mueve en horizontal si toca un bloque a un lado; si no, en vertical.' },
      { code: 0xB1, name: 'Plataforma que cae', sprite: 'DONUT000', overlay: true },
    ],
  },
  {
    name: 'Decoración',
    items: [
      { code: 0xF7, name: 'Hierba', sprite: 'GRASS2000' },
      { code: 0xF0, name: 'Valla / arbusto', sprite: (o) => RAW[o.Design === 1 ? 'FENCE000' : 'SMTREE000'], help: 'Valla con el diseño 1; arbusto con el 2.' },
      { code: 0xF6, name: 'Tronco de palmera', sprite: 'WPALM000', help: 'Con el diseño 1.' },
      { code: 0xFA, name: 'Palmera (centro)', sprite: 'PALM0000', help: 'Copa de palmera (diseño 1): centro.' },
      { code: 0xF4, name: 'Palmera (izquierda)', sprite: 'PALM1000' },
      { code: 0xF9, name: 'Palmera (hoja)', sprite: 'PALM2000' },
      { code: 0xF5, name: 'Palmera (derecha)', sprite: 'PALM3000' },
      { code: ch('#'), name: designName(0), sprite: designSprite(0), help: 'Depende del diseño del nivel (opciones).' },
      { code: ch('%'), name: designName(1), sprite: designSprite(1), help: 'Depende del diseño del nivel (opciones).' },
      { code: 0xFE, name: 'Puerta EXIT', sprite: 'EXIT000', help: 'Decoración: dos celdas una encima de otra.' },
    ],
  },
  {
    name: 'Especiales',
    items: [
      { code: 0xFC, name: 'Moneda alta', overlay: true, badge: '*↑', help: 'Pone una moneda 2 filas más arriba.' },
      { code: 0xFD, name: '? con vida alta', overlay: true, badge: '?↑', help: 'Pone un bloque ? con vida extra 5 filas más arriba.' },
      { code: 0xAD, name: 'Copiar hacia arriba', overlay: true, badge: '⤒', help: 'Rellena la columna hacia arriba con la celda de debajo.' },
      { code: 0xAE, name: 'Tope de scroll ←', overlay: true, badge: '|←', help: 'La cámara no vuelve atrás de esta columna.' },
      { code: 0xAF, name: 'Tope de scroll →', overlay: true, badge: '→|', help: 'La cámara no avanza más allá de esta columna.' },
      { code: ch('z'), name: 'Modo turbo', overlay: true, badge: 'T', help: 'Al tocarlo se activa el modo turbo.' },
    ],
  },
];

// code -> item for the cell overlays (first match wins, so E0/E1 show the
// contextual meaning chosen in overlayItem)
const BY_CODE = new Map();
for (const g of GROUPS) for (const it of g.items) if (!BY_CODE.has(it.code)) BY_CODE.set(it.code, it);

export function itemFor(code) {
  return BY_CODE.get(code);
}

// E0 / E1 mean "power-up / 1-up" above a ? block and "pipe link" above a pipe.
export function overlayItem(code, below) {
  if (code === 0xE0 || code === 0xE1) {
    const pipe = below === ch('0') || below === ch('1');
    const group = GROUPS.find((g) => g.name === (pipe ? 'Enlaces de tubería (avanzado)' : 'Contenido de ?'));
    return group.items.find((i) => i.code === code);
  }
  if (code >= 0xE8 && code <= 0xEF)
    return GROUPS.find((g) => g.name === 'Enlaces de tubería (avanzado)').items.find((i) => i.code === code);
  return BY_CODE.get(code);
}

export function itemName(it, opt) {
  return typeof it.name === 'function' ? it.name(opt) : it.name;
}

export function itemSprite(it, opt) {
  if (!it.sprite) return null;
  const data = typeof it.sprite === 'function' ? it.sprite(opt) : RAW[it.sprite];
  if (!data) return null;
  return { data, w: it.w || 20, h: it.h || 14, mirror: !!it.mirror };
}
