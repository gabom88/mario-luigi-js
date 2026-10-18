# CLAUDE.md

Contexto para continuar este proyecto con Claude Code en cualquier equipo.
La documentación para usuarios está en `README.md`; aquí va lo que necesita
quien programa.

## El proyecto

Port a JavaScript de *Mario & Luigi* (Mike Wiering, 1994, Turbo Pascal).
El juego publicado está en `web/` y se despliega en GitHub Pages
(<https://gabom88.github.io/mario-luigi-js/>) con cada push a `main`. En la
raíz están los fuentes originales (`*.PAS`, sprites `*.$00`/`*.000`…), que
**no se tocan**.

- Sin dependencias: solo Node.js. Servidor local: `cd web && npm start`
  (<http://localhost:8080/>).
- El port emula la VGA (`vga256.js`) y traduce cada unidad Pascal casi línea
  a línea (`PLAYERS.PAS` → `players.js`, etc.; tabla en el README, sección
  «Cómo está hecho»). El código nuevo imita el estilo del original: estado
  en variables de módulo, nombres de Pascal (`XView`, `GameDone`…),
  comentarios en inglés.
- La interfaz del juego y la documentación están en **español**; los textos
  que se ven dentro del juego (menús en la pantalla VGA), en **inglés y
  mayúsculas**, como el original.

## Cómo trabaja el usuario (Gabo)

- Habla en español; responder en español.
- **Git**: no hacer commit ni push sin que lo pida. Para cambios de código,
  rama nueva + pull request + merge a `main` cuando lo aprueba (el merge
  publica el juego). Autor de los commits: `Gabo <gabo.m88@gmail.com>` (en
  algunos equipos git no tiene usuario configurado: usar
  `git -c user.name=... -c user.email=...`).
- A veces edita el README directamente en GitHub: hacer `git fetch` y
  revisar `main` antes de tocar el README, y no borrar sus bloques sin
  preguntar (quiere conservar el GIF de gameplay arriba del todo).
- Al terminar una función: actualizar el README (y sus capturas si cambia
  algo visible) en el mismo cambio.

## Reglas al cambiar el juego

- **Caché offline**: si cambia cualquier archivo de `web/`, subir la versión
  de `CACHE` en `web/sw.js`; si se añade un archivo, incluirlo en `FILES`.
- **Prueba de fidelidad**: la demo grabada de 1994 debe seguir saliendo
  idéntica. Compara `node tools/snap.mjs demo <dir>` con el mismo comando en
  la versión anterior (`git worktree add`) y `cmp` de los PNG.
- **Pruebas sin navegador** (`web/tools/snap.mjs`, guardan PNG):
  `level1`, `intro`, `levelselect`, `smbmenu`, `mylevel`, `smb` (con
  `EXIT=1`, `VERSUS=1`), `versus`, `versusdeath`, `versuspipe`, `savegame`,
  `titlep2`, `demo`. Para el README: `readmeshots` (capturas del menú) y
  `versusrec` (fotogramas del GIF; se monta con ffmpeg a 23,33 fps, escala
  ×2 con `flags=neighbor`, sin los fotogramas negros del fundido).
- En Chrome automatizado la pestaña suele ir a cámara lenta (animaciones
  pausadas en segundo plano): sirve para el panel HTML, no para jugar.

## Estado actual (octubre 2026)

Hecho y publicado en `main` (PR #1):

- **Menú**: modo (1 PLAYER / 2 PLAYERS / 2 PLAYERS VERSUS) → partida
  guardada (NO SAVE / GAME SELECT / ERASE) → qué jugar (ORIGINAL / SMB 1 /
  LEVEL SELECT con todos los niveles y los del editor). Las ranuras guardan
  `Package` y `Versus`. END abre el panel de ajustes (`PS.onEnd`). Con el
  cursor en VERSUS, el personaje de Player 2 entra caminando junto a Mario
  (`TitleP2` en `mario.js`).
- **2 PLAYERS VERSUS** (`versus.js`, contextos por jugador en `players.js`
  con `selectPlayer`): vidas/monedas/puntos compartidos (`dataSlot()`),
  reaparición a los 2,5 s, con la última vida la partida sigue y el caído
  espera una vida (`VS.respawn < 0`, se mantiene entre niveles), cámara
  centrada entre los dos, tuberías y salida llevan a ambos.
- **Controles**: teclas de Player 2 (`p2Keys()` en `keyboard.js`), un mando
  por jugador, segundo juego de botones táctiles (verdes), posición por
  arrastre y tamaño por deslizador.
- **Panel de ajustes** con pestañas Juego, Teclado y Táctil.

Pendiente al escribir esto:

- Cambio del README sin subir (en el equipo original): los GIFs del bloque
  de Gabo se cargan desde `docs/screenshots/versus.gif` en vez de la rama
  `modo-versus`, se quitó un GIF duplicado antes de la galería y se
  corrigieron datos de su bloque. Si no está en `main`, rehacerlo.
- La rama `modo-versus` ya está fusionada; se puede borrar.
