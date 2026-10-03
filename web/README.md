# Mario & Luigi — port a JavaScript

Port del juego de Mike Wiering (1994, Turbo Pascal 6/7, DOS) al navegador.

## Jugar

```
cd web
npm start          # o: node serve.mjs 8080
```

Abre http://localhost:8080/ y haz clic para empezar. Los módulos ES requieren
servirse por http (no funciona abriendo `index.html` con doble clic).

Controles por defecto: W A S D moverse, M saltar, N correr **y** disparar
(estilo NES; W/S apuntan el disparo, S entra en tuberías). Sistema: Enter
aceptar, P pausa, I marcador, Q sonido, Esc salir, F pantalla completa. Todo se remapea desde el
panel inicial (o el botón ⚙ durante el juego). Una tecla con varias acciones
se marca en amarillo; las teclas de sistema no se pueden compartir. También
funciona con mando.

**Personajes**: en el panel se elige Mario o Luigi para Player 1 y Player 2.

Todos los ajustes (teclas, personajes, pantalla, táctil, sonido, marcador y
partidas guardadas, que se actualizan tras cada nivel superado) se guardan
en `localStorage`.

**LEVEL SELECT** (menú principal): los 6 niveles, sus versiones TURBO
(segunda vuelta con otras opciones), las áreas secundarias de los niveles
1, 4, 5 y 6 (las del 2 y 3 están vacías en el fuente original) y el mapa de
la pantalla de título.

**Pantalla**: sincronización «Suave» (un frame por refresco del monitor, sin
tirones; a 60 Hz el juego va un 14% más lento) u «Original» (70 fps exactos),
y escalado «Nítido sin parpadeo» (ampliación entera + filtrado final) o
«Píxel exacto».

Controles táctiles (se activan en el panel): flechas ←/→, A = saltar,
B = correr y disparar, ⇅ = entrar en tuberías, y START/PAUSA/ESC. Posición,
tamaño y opacidad se ajustan con vista previa. Los ajustes se guardan en
`localStorage`.

**Extras** (panel inicial): filtro CRT, sonido mejorado (notas con
envolvente y eco en lugar del pitido del altavoz) y vibración en móviles.

**Móvil**: se juega en vertical (pantalla arriba, controles debajo) y en
horizontal.

## Instalar como app (PWA)

El juego es instalable y funciona sin conexión (`manifest.webmanifest`,
`sw.js`). Los iconos de `icons/` se generan a partir de los sprites del juego:
`node tools/icons.mjs`. El navegador solo ofrece instalarlo desde `https://`
o `localhost`: para instalarlo en el móvil hay que publicarlo en un hosting
con https (GitHub Pages, Netlify, itch.io…); basta con subir la carpeta `web/`.
Al añadir archivos nuevos, inclúyelos en la lista de `sw.js` y sube la
versión de `CACHE`.

## Cómo está hecho

- **`tools/convert.mjs`** extrae todos los datos de los fuentes originales
  (`.$00`…, `.BK`, `MPAL256`, niveles en `WORLDS.PAS`, fuentes de `TXT.PAS`,
  demo de `DEMOKEYS.OBJ`) a `src/data.js`. Los sprites se conservan en el
  formato planar original de la VGA.
- **`src/vga256.js`** emula la VGA en modo X que usaba el juego: 4 planos de
  64 KB, pantalla virtual de 360 px, dos páginas, scroll por hardware,
  paleta DAC y copias con latches (pila de fondos `PushBackGr`/`PopBackGr`).
  Reproduce la aritmética de direcciones de 16 bits del ensamblador original.
- El resto de módulos son traducciones casi línea a línea de cada unidad
  Pascal (`PLAY.PAS` → `play.js`, `PLAYERS.PAS` → `players.js`, etc.).
  Los bucles bloqueantes se convierten en `async/await` sobre el retrazado
  vertical emulado a 70 Hz, así el flujo de control original se mantiene.
- El altavoz del PC se emula con Web Audio; las partidas guardadas y opciones
  van a `localStorage`.

## Diferencias con el original

- La demo grabada se hizo con una versión anterior que leía ←/→ dos veces
  por frame; al reproducirla se leen dos veces para que salga como se grabó.
- Nubes, estrellas y los fondos tipo 5/7 (código para modo 13h lineal) no los
  usa ningún nivel y se dejaron como funciones vacías.
- "END" en el menú vuelve al título (no hay DOS al que salir).

## Pruebas

`node tools/snap.mjs level1|intro|demo <dir>` ejecuta el juego sin navegador
con entradas simuladas y guarda capturas PNG (`LEVEL=0..5` elige el nivel).

Código original © Mike Wiering — ver `../README.TXT` para las condiciones de
uso (el autor permite ports y pide que se le avise).
