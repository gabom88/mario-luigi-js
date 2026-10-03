# Mario & Luigi — port a JavaScript

**▶ Jugar: https://gabom88.github.io/mario-luigi-js/**

Port al navegador del juego *Mario & Luigi* que Mike Wiering programó en
1994 en Turbo Pascal para DOS. Se puede instalar como app (PWA) y jugar sin
conexión, con teclado, mando o controles táctiles.

- Emulación de la VGA en modo X del original (planos, doble página, scroll
  por hardware, efectos de paleta) y traducción casi línea a línea de cada
  unidad Pascal: la física y los enemigos coinciden frame a frame, como
  demuestra la demo grabada original, que se reproduce exacta.
- Controles remapeables, controles táctiles ajustables, Mario o Luigi por
  jugador, LEVEL SELECT con niveles ocultos, filtro CRT, sonido mejorado.

Detalles del port, controles y cómo ejecutarlo en local: [`web/README.md`](web/README.md).

## Contenido del repositorio

| Carpeta / archivos | Qué es |
|---|---|
| `web/` | El port a JavaScript (lo que se publica en GitHub Pages) |
| `*.PAS`, `*.$00`…, `*.000`…, `*.BK`, `MPAL256`, `DEMOKEYS.OBJ` | Código fuente y gráficos originales de Mike Wiering |
| `README.TXT`, `MARIO.TXT`, `GRED.TXT` | Documentación original del autor |

## Créditos y licencia

Juego original y código fuente © 1994-2001 **Mike Wiering**. Su
[`README.TXT`](README.TXT) permite portar el juego a otro lenguaje o
plataforma (pidiendo que se le avise) y no permite distribuirlo como obra
propia. Este port conserva su nombre y créditos.

*Mario* y *Luigi* son marcas registradas de Nintendo. Proyecto de
aficionado, sin ánimo de lucro y sin relación con Nintendo.
