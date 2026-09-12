// Copia el runtime de OpenCV.js a public/ como archivo estático.
//
// El paquete @techstark/opencv-js es un UMD pensado para cargarse con un
// <script> clásico (asigna `window.cv`), no para pasar por el empaquetador de
// Next. Importarlo con `import()` dinámico rompe en Turbopack: el wrapper de
// interop que genera para este CommonJS/UMD mixto no es compatible con cómo
// Emscripten construye su promesa de inicialización, y falla en tiempo de
// ejecución con "Method Promise.prototype.then called on incompatible
// receiver [object Module]".
//
// Se corre en cada `npm install` (postinstall) y antes de cada build, para
// que el archivo servido nunca quede desincronizado de la versión del
// paquete fijada en package.json.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raizProyecto = dirname(dirname(fileURLToPath(import.meta.url)));
const origen = join(raizProyecto, "node_modules/@techstark/opencv-js/dist/opencv.js");
const destino = join(raizProyecto, "public/opencv.js");

if (!existsSync(origen)) {
  console.warn(
    "[copiar-opencv] No se encontró @techstark/opencv-js en node_modules; " +
      "se omite la copia (¿falta `npm install`?).",
  );
  process.exit(0);
}

mkdirSync(dirname(destino), { recursive: true });

// Evita recopiar si ya está igual, para no ensuciar el mtime en cada install.
if (existsSync(destino) && statSync(destino).size === statSync(origen).size) {
  process.exit(0);
}

copyFileSync(origen, destino);
console.log(`[copiar-opencv] Copiado a public/opencv.js (${(statSync(destino).size / 1024 / 1024).toFixed(1)} MB).`);
