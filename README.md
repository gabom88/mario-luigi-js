# Mario & Luigi — port a JavaScript

[![Deploy to GitHub Pages](https://github.com/gabom88/mario-luigi-js/actions/workflows/pages.yml/badge.svg)](https://github.com/gabom88/mario-luigi-js/actions/workflows/pages.yml)

### ▶ **[Jugar ahora: gabom88.github.io/mario-luigi-js](https://gabom88.github.io/mario-luigi-js/)**

Port al navegador de **Mario & Luigi**, el juego de plataformas que
**Mike Wiering** programó en 1994 en Turbo Pascal para PC con VGA.
Funciona en el ordenador y en el móvil (vertical u horizontal), con teclado,
mando o controles táctiles, se puede **instalar como app** y se juega **sin
conexión**.

Web oficial del juego original: **<https://wieringsoftware.nl/mario/index.html>**

| | |
|---|---|
| ![Menú principal](docs/screenshots/menu.png) | ![Nivel 1](docs/screenshots/level1.png) |
| ![Nivel 3, con Koopas](docs/screenshots/level3.png) | ![Nivel 6, el castillo](docs/screenshots/level6.png) |
| ![Nivel 2, subterráneo](docs/screenshots/level2.png) | ![LEVEL SELECT](docs/screenshots/level-select.png) |

---

## Índice

1. [El juego original](#el-juego-original)
2. [Qué ofrece este port](#qué-ofrece-este-port)
3. [Cómo jugar](#cómo-jugar)
4. [Controles](#controles)
5. [Panel de ajustes](#panel-de-ajustes)
6. [Menú del juego y LEVEL SELECT](#menú-del-juego-y-level-select)
7. [Trucos del original](#trucos-del-original)
8. [Partidas guardadas y datos locales](#partidas-guardadas-y-datos-locales)
9. [Cómo está hecho](#cómo-está-hecho)
10. [Fidelidad y diferencias con el original](#fidelidad-y-diferencias-con-el-original)
11. [Desarrollo](#desarrollo)
12. [Estructura del repositorio](#estructura-del-repositorio)
13. [Créditos y licencia](#créditos-y-licencia)

---

## El juego original

*Mario & Luigi* es un clon de *Super Mario Bros.* con **seis niveles** que
Mike Wiering escribió en 1994 para practicar la programación de la VGA. Su
objetivo era un juego de PC con **scroll parallax en varias capas** que se
moviera con suavidad en su 486 a 25 MHz. El ejecutable ocupaba **menos de
64 KB**.

Algunos detalles técnicos del original, todos reproducidos en este port:

- Modo VGA 320×200 a 256 colores en **modo planar** ("modo X"), con
  **doble página** y una pantalla virtual 40 píxeles más ancha que la
  visible, de modo que al avanzar un píxel se dibuja un bloque entero nuevo.
- La memoria de vídeo sobrante se usa como **pila para guardar el fondo**
  detrás de cada sprite, copiando con los *latches* de la VGA.
- **Parallax** de dos formas: las colinas se mueven redibujando solo los
  píxeles que cambian, y los ladrillos y columnas del fondo se animan
  **rotando la paleta**.
- Los niveles están escritos a mano en el código (`WORLDS.PAS`): cada
  carácter es un bloque.
- Los sprites se hicieron con el editor **GRED** del propio autor.
- La música y los efectos suenan por el **altavoz del PC**.

El autor publicó después el **código fuente completo** (para Turbo Pascal
6/7, y una versión para TP 5.5) en la web oficial:

- Presentación: <https://wieringsoftware.nl/mario/index.html>
- Código fuente: <https://wieringsoftware.nl/mario/source.html>
- Otros juegos del autor: <https://wieringsoftware.nl/mario/games.html>

Este repositorio incluye ese código fuente original (ver
[Estructura del repositorio](#estructura-del-repositorio)).

---

## Qué ofrece este port

- **El juego completo**: menú, los 6 niveles con sus áreas secundarias,
  la segunda vuelta "turbo", 1 o 2 jugadores, partidas guardadas y la demo
  automática de la pantalla de título.
- **Fiel al original**: la VGA se emula a nivel de memoria y el código
  Pascal se tradujo casi línea a línea. La demo grabada en 1994 se
  reproduce exactamente igual, frame a frame.
- **Controles remapeables** (dos teclas por acción), **mando** y
  **controles táctiles** ajustables en posición, tamaño y opacidad.
- **Mario o Luigi** a elegir para cada jugador.
- **LEVEL SELECT** con todos los niveles, incluidos los que el juego no deja
  elegir.
- **Extras opcionales**: filtro CRT, sonido mejorado y vibración en móviles.
- **App instalable (PWA)** con iconos hechos con los sprites del juego;
  funciona sin conexión.
- **Scroll suave** sincronizado con el monitor y escalado sin parpadeo.

---

## Cómo jugar

### En el navegador

Abre **<https://gabom88.github.io/mario-luigi-js/>**, revisa los ajustes si
quieres y pulsa **Jugar** (o Enter).

### Instalarlo como app

| Dispositivo | Cómo |
|---|---|
| Android (Chrome) | Menú ⋮ → **Instalar aplicación** / *Añadir a pantalla de inicio* |
| iPhone / iPad (Safari) | Compartir → **Añadir a pantalla de inicio** |
| Ordenador (Chrome, Edge) | Icono de instalar en la barra de direcciones |

Instalado se abre a pantalla completa, sin barras del navegador, y funciona
sin internet. En iPhone, Safari no permite pantalla completa en una página
normal: la forma de tenerla es instalar la app.

### En local

Hace falta [Node.js](https://nodejs.org/) (cualquier versión reciente) y no
hay dependencias que instalar:

```
cd web
npm start
```

y abre <http://localhost:8080/>. El juego usa módulos de JavaScript, así que
debe servirse por http; abrir `index.html` con doble clic no funciona.

---

## Controles

### Teclado (por defecto)

| Acción | Tecla |
|---|---|
| Moverse | **W A S D** |
| Saltar | **M** |
| Correr **y** disparar | **N** (estilo NES: un mismo botón) |
| Apuntar el disparo | W / S mientras disparas |
| Entrar en una tubería | **S** sobre ella, o **W** saltando hacia una de arriba |

| Sistema | Tecla |
|---|---|
| Aceptar en los menús | **Enter** |
| Pausa | **P** |
| Mostrar u ocultar el marcador | **I** |
| Sonido sí/no | **Q** |
| Salir del nivel / atrás en menús | **Esc** |
| Pantalla completa | **F** |

En los menús también funcionan las flechas. Todas las teclas se pueden
cambiar en el [panel de ajustes](#panel-de-ajustes). El original usaba
flechas, **Alt** (saltar), **Ctrl** (correr) y **Espacio** (disparar);
puedes volver a asignarlas si lo prefieres.

### Mando

Cruceta o stick para moverse, **A / Y** para saltar y **B / X** para correr
y disparar (Gamepad API, sin configuración).

### Controles táctiles

Se activan en el panel (vienen activados en dispositivos táctiles):

- **← →**: flechas grandes para caminar; puedes deslizar el dedo entre ellas.
- **A**: saltar. **B**: correr y disparar. Deslizando el pulgar entre A y B
  se pulsan los dos.
- **⇅**: entrar en tuberías, hacia abajo o saltando hacia una de arriba.
- **START**, **PAUSA**, **ESC** y **⛶** (pantalla completa), abajo en el centro.
- En los menús, ← → mueven la selección y **B** o **START** eligen.

En vertical la pantalla del juego queda arriba y los controles debajo; en
horizontal los controles quedan a los lados.

---

## Panel de ajustes

Es la pantalla inicial. Durante la partida se vuelve a abrir con el botón
**⚙** de la esquina superior derecha. Todo se guarda automáticamente.

| Sección | Opciones |
|---|---|
| **Personajes** | Mario o Luigi para Player 1 y Player 2 (por defecto Mario y Luigi). Cambia los sprites, el nombre en el marcador y los carteles. Pueden ser el mismo. |
| **Controles de teclado** | Dos teclas por acción. Clic en una casilla y pulsa la tecla nueva; **Supr** la borra y **Esc** cancela. Una tecla con varias acciones se muestra en **amarillo**. Las acciones de juego pueden compartir tecla (como N para correr y disparar), pero las de **Sistema** no. Esc y Tab no se pueden asignar. |
| **Pantalla** | *Sincronización*: **Suave** (un frame del juego por refresco del monitor; scroll sin tirones, pero a 60 Hz el juego va un 14% más lento que el original) u **Original** (70 fps exactos, como un monitor VGA). *Escalado*: **Nítido sin parpadeo** (ampliación entera más un filtrado final, todos los píxeles del mismo tamaño) o **Píxel exacto**. |
| **Extras** | **Filtro CRT** (líneas de barrido alineadas con las 200 líneas de la VGA, máscara de fósforo, viñeta). **Sonido mejorado** (notas con envolvente, filtro y eco en lugar del pitido del altavoz). **Vibración** en móviles al recibir daño, pisar enemigos y romper bloques. |
| **Controles táctiles** | Activar/desactivar; posición y tamaño de las flechas y de los botones, y opacidad, con vista previa en vivo. |

---

## Menú del juego y LEVEL SELECT

El menú es el del original, con una opción añadida:

- **START**: *No save* (partida sin guardar, 1 o 2 jugadores),
  *Game select* (3 ranuras de partida guardada) y *Erase*.
- **LEVEL SELECT**: empezar en cualquier nivel (nuevo en este port).
- **OPTIONS**: sonido y marcador.
- **END**: vuelve al título (en el navegador no hay DOS al que salir).

Si no tocas nada durante unos segundos empieza la **demo**: la partida que
grabó el autor en 1994.

### LEVEL SELECT

Incluye todo lo que hay en `WORLDS.PAS`, también lo que el juego normal no
deja elegir:

| Entrada | Qué es |
|---|---|
| **LEVEL 1 … LEVEL 6** | Los seis niveles; al superar uno se sigue con el siguiente. |
| **LEVEL 1/4/5/6 AREA 2** | Las zonas secundarias, a las que normalmente solo se llega por una tubería; su tubería de salida lleva al área principal. |
| **LEVEL 1 … 6 TURBO** | La segunda vuelta que el juego desbloquea al terminarlo: enemigos y jugador más rápidos y variantes propias de los niveles. |
| **TITLE MAP** | El pequeño escenario de la pantalla de título, jugable (Esc para salir). |

Las áreas secundarias de los niveles 2 y 3 existen en el código fuente pero
están vacías (no tienen datos), por eso no aparecen. Desde LEVEL SELECT la
partida es de un jugador y no se guarda.

> Curiosidad: el orden de juego no coincide con los nombres del código. Los
> niveles 4, 5 y 6 del juego son `Level_5`, `Level_6` y `Level_4` de
> `WORLDS.PAS`.

---

## Trucos del original

El código fuente original tiene trucos ocultos y funcionan igual en este
port. Para usarlos:

1. Pulsa **P** para pausar y suelta la tecla.
2. Pulsa **Tab**.
3. Escribe el código. Termina al completarse uno válido o al pulsar una
   tecla que no sea letra ni número.

| Código | Efecto |
|---|---|
| `03E8` | Una vida extra |
| `B172` | 10000 vidas |
| `F1F2` | Champiñón (crecer) |
| `FFB5` | Flor de fuego |
| `9C32` | Estrella (invencible) |
| `1UP` | Hace caer un champiñón de vida… y la siguiente vez, uno venenoso |
| `D235` | Activa/desactiva el modo turbo |
| `2305` | Pasar al siguiente nivel |
| `MONO` | Colores en blanco y negro |
| `EGAMODE` | Colores reducidos, estilo EGA |
| `VGAMODE` o `COLOR` | Colores normales |
| `CREDITS` | Muestra el crédito del autor |
| `TEST` o `0044` | Herramienta de depuración: marca el tiempo de retrazado |
| `76DD` | Grabar una demo |
| `C7B4` | Reproducir la demo grabada |
| `208D` | Guardar la demo grabada (en el navegador se descarga un archivo) |

---

## Partidas guardadas y datos locales

Todo se guarda en el `localStorage` del navegador, en tu dispositivo:

- Ajustes del panel: teclas, personajes, pantalla, extras y controles táctiles.
- Sonido y marcador (también si los cambias jugando con Q o I).
- Las 3 ranuras de partida (*Game select*), que se actualizan después de
  cada nivel superado.

Borrar los datos del sitio en el navegador reinicia todo.

---

## Cómo está hecho

El port no reimplementa el juego desde cero: **emula el hardware que usaba**
y traduce el código Pascal casi línea a línea. Así se conservan la física,
las colisiones y hasta los pequeños fallos del original.

### 1. Extracción de datos

[`web/tools/convert.mjs`](web/tools/convert.mjs) lee los archivos originales
(`.PAS`, `.$00`…, `.BK`, `MPAL256`, `DEMOKEYS.OBJ`) y genera
`web/src/data.js` con:

- **204 bloques de datos**: sprites (en el formato planar original de la
  VGA), niveles y sus opciones, mapas de las colinas y la paleta.
- Las **dos fuentes** de texto de `TXT.PAS`.
- La **demo grabada**, extraída del archivo objeto OMF `DEMOKEYS.OBJ`.

### 2. Emulación de la VGA

[`web/src/vga256.js`](web/src/vga256.js) reproduce el modo X que usaba el
juego: 4 planos de 64 KB, pantalla virtual de 360 píxeles, dos páginas,
registro de inicio de pantalla, desplazamiento fino horizontal, paleta DAC
de 6 bits y copias con *latches*. Las rutinas en ensamblador
(`PutImage`, `DrawImage`, `PushBackGr`…) se tradujeron respetando su
aritmética de direcciones de 16 bits, incluido el desbordamiento. Cada
frame se convierte a RGBA y se dibuja en un `<canvas>`.

### 3. Traducción de las unidades Pascal

Cada unidad tiene su módulo JavaScript:

| Pascal | JavaScript | Contenido |
|---|---|---|
| `MARIO.PAS` | `mario.js` | Programa principal, menú, demo, secuencia de niveles |
| `PLAY.PAS` | `play.js` | Bucle de un nivel, scroll, pausa y trucos |
| `PLAYERS.PAS` | `players.js` | Movimiento, física y colisiones del jugador |
| `ENEMIES.PAS` | `enemies.js` | Enemigos, power-ups, bolas de fuego, plataformas |
| `FIGURES.PAS` | `figures.js` | Bloques del nivel, cielo, construcción del mundo |
| `BACKGR.PAS` | `backgr.js` | Fondos parallax y animación por paleta |
| `PALETTES.PAS` | `palettes.js` | Paleta, fundidos, animaciones de color |
| `BLOCKS.PAS`, `TMPOBJ.PAS`, `GLITTER.PAS` | `blocks.js`, `tmpobj.js`, `glitter.js` | Bloques golpeados, monedas y fragmentos, destellos |
| `TXT.PAS`, `STATUS.PAS` | `txt.js`, `status.js` | Texto y marcador |
| `MUSIC.PAS` | `music.js` + `sound.js` | Melodías y altavoz del PC (Web Audio) |
| `KEYBOARD.PAS`, `JOYSTICK.PAS` | `keyboard.js`, `joystick.js` | Teclado remapeable y demo; mando (Gamepad API) |
| `BUFFERS.PAS`, `VGA256.PAS` | `buffers.js`, `vga256.js` | Estado compartido, mapa del mundo; VGA |
| — | `pascal.js` | `Random` de Turbo Pascal 7, `Round`, `div`… |
| — | `ui.js`, `extras.js`, `main.js` | Panel de ajustes, controles táctiles, CRT, PWA |

### 4. Bucles bloqueantes con `async/await`

El original espera al retrazado vertical dentro de sus bucles (`ShowPage`,
fundidos, menús). En el navegador esas esperas son `await` sobre un reloj de
retrazado emulado, así que el flujo de control de cada procedimiento queda
como en el original.

---

## Fidelidad y diferencias con el original

**Prueba de fidelidad.** La demo de la pantalla de título reproduce las
teclas que grabó el autor; cualquier diferencia en la física o en los
enemigos haría que Mario muriera o se desviara. En este port la demo
recorre sus ~1500 frames y termina entrando exactamente en la tubería
prevista.

Diferencias conocidas:

- **Demo**: se grabó con una versión anterior del juego que leía ← y → dos
  veces por frame (todos sus contadores son pares). Al reproducirla se leen
  dos veces; con el código publicado tal cual, Mario moría a los pocos
  segundos.
- **Nubes, estrellas y los fondos de tipo 5 y 7** estaban escritos para el
  modo VGA lineal y ningún nivel los usa: se dejaron como funciones vacías.
- **END** vuelve al título.
- **Velocidad**: con la sincronización *Suave* en monitores de 60 Hz el
  juego va al 86% de la velocidad original; la opción *Original* da los
  70 fps exactos.
- **Partidas y ajustes** se guardan en `localStorage` en lugar del archivo
  `MARIO.CFG`.
- **Añadido**: remapeo de teclas, controles táctiles, mando, elección de
  personaje, LEVEL SELECT, extras y PWA.

---

## Desarrollo

Todo está en `web/` y no tiene dependencias externas.

| Comando (desde `web/`) | Qué hace |
|---|---|
| `npm start` | Servidor local en <http://localhost:8080/> (`serve.mjs`) |
| `npm run convert` | Regenera `src/data.js` a partir de los archivos originales |
| `node tools/icons.mjs` | Regenera los iconos de la app a partir de los sprites |
| `node tools/snap.mjs level1 <carpeta>` | Ejecuta el juego sin navegador y guarda capturas PNG (`LEVEL=0..5` elige nivel, `LUIGI=1` usa a Luigi) |
| `node tools/snap.mjs intro\|levelselect\|demo <carpeta>` | Recorre el menú, el LEVEL SELECT o la demo y guarda capturas |

**Publicación.** Cada `push` a `main` publica `web/` en GitHub Pages
mediante [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

**Caché sin conexión.** `web/sw.js` guarda en caché los archivos de la
lista `FILES`. Si añades archivos, inclúyelos ahí y sube la versión de
`CACHE` (por ejemplo `mario-luigi-v2`).

**Archivos originales.** `.gitattributes` los marca como binarios para que
git no altere sus finales de línea ni su contenido.

---

## Estructura del repositorio

```
├── web/                     El port a JavaScript (lo que se publica)
│   ├── index.html           Página, panel de ajustes y estilos
│   ├── manifest.webmanifest Manifiesto de la app (PWA)
│   ├── sw.js                Service worker (juego sin conexión)
│   ├── serve.mjs            Servidor local
│   ├── icons/               Iconos generados con los sprites
│   ├── src/                 Código del juego (ver "Cómo está hecho")
│   └── tools/               Conversor de datos, iconos y arnés de pruebas
├── docs/screenshots/        Capturas para este README
├── *.PAS                    Código fuente original en Turbo Pascal
├── *.$00, *.$01 …           Sprites originales como código incluible (planar)
├── *.000, *.001 …           Sprites originales en el formato de GRED
├── *.BK, BOGEN7, BOGEN26    Perfiles de las colinas del fondo
├── MPAL256, DEFAULT.PAL     Paleta de colores
├── DEMOKEYS.OBJ             Demo grabada (archivo objeto)
├── README.TXT               README original del código fuente
├── MARIO.TXT                Instrucciones originales del juego
└── GRED.TXT                 Manual del editor de sprites GRED
```

No se incluyen `MARIOSRC.ZIP` ni los ejecutables de DOS (`GRED.EXE`,
`BIN2PAS.EXE`); se pueden descargar de la
[web oficial](https://wieringsoftware.nl/mario/source.html).

---

## Créditos y licencia

- **Juego original, gráficos y código fuente**: © 1994-2001
  **Mike Wiering** — <https://wieringsoftware.nl/mario/index.html>.
  Su [`README.TXT`](README.TXT) permite estudiar el código, reutilizar
  fragmentos dándole crédito y **portar el juego a otra plataforma o
  lenguaje** (pidiendo que se le avise). No permite distribuirlo como obra
  propia.
- **Port a JavaScript**: Gabo
  ([@gabom88](https://github.com/gabom88)), desarrollado con Claude
  (Anthropic).
- *Mario* y *Luigi* son marcas registradas de **Nintendo**. Este es un
  proyecto de aficionado, sin ánimo de lucro y sin relación con Nintendo.

Otros juegos de Mike Wiering hechos con el mismo motor o en la misma época:
[Charlie the Duck](http://www.wieringsoftware.nl/charlie/),
[Charlie II](http://www.wieringsoftware.nl/ch2/),
[Super Angelo](http://www.wieringsoftware.nl/angelo/),
[Sint Nicolaas](http://www.wieringsoftware.nl/sint/) y
[Super Worms](http://www.wieringsoftware.nl/sw/).
