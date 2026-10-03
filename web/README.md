# web/ — el port a JavaScript

Esta carpeta es el juego que se publica en
<https://gabom88.github.io/mario-luigi-js/>. La documentación completa
(controles, ajustes, trucos, arquitectura y desarrollo) está en el
[README principal](../README.md).

Resumen rápido:

```
npm start                              # servidor local en http://localhost:8080/
npm run convert                        # regenera src/data.js desde los archivos originales
node tools/icons.mjs                   # regenera los iconos de la app
node tools/snap.mjs level1 <carpeta>   # prueba sin navegador con capturas PNG
```

Sin dependencias externas. Si añades archivos, inclúyelos en `sw.js`
(lista `FILES`) y sube la versión de `CACHE`.
