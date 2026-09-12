/**
 * Medición automática de sobrantes a partir de una foto con una hoja A4 de
 * referencia.
 *
 * El principio es simple: la hoja A4 tiene un tamaño real conocido (29,7 ×
 * 21,0 cm), así que su tamaño en píxeles dentro de la foto da la escala
 * cm/píxel, y esa escala se aplica al rectángulo del sobrante.
 *
 * OpenCV.js corre entero en el navegador; este módulo nunca se importa desde
 * el servidor. Se carga bajo demanda (`cargarOpenCv`) porque el runtime WASM
 * pesa varios MB y sólo hace falta cuando alguien va a medir una foto.
 */

import type { CV, Mat, MatVector, Rect } from "@techstark/opencv-js";

/** Ruta del script, copiado a public/ en cada build (ver scripts/copiar-opencv.mjs). */
const RUTA_SCRIPT_OPENCV = "/opencv.js";

// El propio paquete ya declara `declare global { var cv: ... }` en sus tipos
// (_cv.d.ts), así que basta con importar algo de él para que esa declaración
// esté en efecto; no hace falta repetirla aquí. Antes de que el script
// termine de inicializar, `window.cv` es la promesa de Emscripten, no el
// objeto `cv` final, así que se lee a través de este tipo más laxo.
type VentanaConCv = typeof window & { cv?: CV | Promise<CV> };

/** Formas de referencia soportadas. "regla" queda reservada para una fase 2:
 * requiere leer las marcas impresas (OCR), no sólo su contorno. */
export type TipoReferencia = "a4_horizontal" | "a4_vertical";

/** Tamaño real de una hoja A4, en centímetros. */
const A4_LARGO_CM = 29.7;
const A4_CORTO_CM = 21.0;
/** Proporción largo/corto de un A4 — usada para reconocerlo entre contornos. */
const A4_PROPORCION = A4_LARGO_CM / A4_CORTO_CM;

/** Lado mayor al que se reescala la imagen antes de procesar, en píxeles. */
const LADO_MAXIMO_PROCESO = 1200;

/** Área mínima de un contorno para considerarlo candidato, en px². */
const AREA_MINIMA_PX = 5000;

/** Cuánto puede desviarse la proporción de un candidato del A4 esperado. */
const TOLERANCIA_PROPORCION = 0.18;

export interface RectanguloDetectado {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MeasureResult {
  anchoCm: number | null;
  altoCm: number | null;
  colorHex: string | null;
  rectanguloReferencia: RectanguloDetectado | null;
  rectanguloSobrante: RectanguloDetectado | null;
  /** JPEG en base64 con los rectángulos dibujados, para que el usuario vea qué se detectó. */
  imagenProcesada: string;
  /** 0 a 1. Baja cuando la proporción del candidato se aleja del A4 esperado. */
  confianza: number;
  /** Presente cuando no se pudo medir; la interfaz lo muestra tal cual. */
  error: string | null;
}

let cargaOpenCv: Promise<CV> | null = null;

/**
 * Carga el runtime de OpenCV.js una sola vez por sesión de página, inyectando
 * un `<script>` clásico en vez de usar `import()`.
 *
 * @techstark/opencv-js es un UMD pensado para `<script>`: sin AMD ni
 * `module.exports` presentes, se limita a `window.cv = factory()`. Pasarlo por
 * el empaquetador de Next con `import()` dinámico falla en tiempo de
 * ejecución con "Method Promise.prototype.then called on incompatible
 * receiver [object Module]" — el wrapper de interop que Turbopack genera para
 * este CommonJS/UMD mixto no es compatible con cómo Emscripten construye su
 * promesa de inicialización. Cargarlo como script evita el empaquetador por
 * completo; el archivo se copia a `public/opencv.js` en cada build (ver
 * `scripts/copiar-opencv.mjs`), así que sigue quedando fuera del bundle de la
 * app y sólo se pide cuando esta función se invoca de verdad.
 */
async function cargarOpenCv(): Promise<CV> {
  if (typeof window === "undefined") {
    throw new Error("OpenCV.js sólo puede cargarse en el navegador.");
  }

  if (cargaOpenCv) return cargaOpenCv;

  cargaOpenCv = new Promise<CV>((resolve, reject) => {
    const existente = document.querySelector<HTMLScriptElement>(
      `script[src="${RUTA_SCRIPT_OPENCV}"]`,
    );

    const esperarInicializacion = async () => {
      // `window.cv` es la promesa de Emscripten hasta que el runtime WASM
      // termina de inicializar, momento en el que ella misma se resuelve al
      // objeto `cv` completo.
      const candidato = (window as VentanaConCv).cv;
      if (!candidato) {
        reject(new Error("OpenCV.js no expuso `window.cv` tras cargar."));
        return;
      }
      resolve(await candidato);
    };

    if (existente) {
      esperarInicializacion().catch(reject);
      return;
    }

    const script = document.createElement("script");
    script.src = RUTA_SCRIPT_OPENCV;
    script.async = true;
    script.onload = () => esperarInicializacion().catch(reject);
    script.onerror = () =>
      reject(new Error("No se pudo cargar OpenCV.js. Revisa tu conexión."));
    document.head.appendChild(script);
  });

  return cargaOpenCv;
}

/** Dibuja un archivo de imagen en un canvas, reescalándolo al lado máximo. */
async function archivoACanvas(archivo: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO_PROCESO / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const contexto = canvas.getContext("2d");
  if (!contexto) throw new Error("El navegador no admite canvas 2D.");
  contexto.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  return canvas;
}

interface Candidato {
  rect: Rect;
  areaPx: number;
  proporcion: number;
  /** Qué tan cerca está la proporción del candidato de la de un A4. */
  distanciaAlA4: number;
  colorMedio: [number, number, number];
}

/** true si el color es cercano a blanco: así se distingue el A4 de un sobrante claro. */
function esBlancuzco([r, g, b]: [number, number, number]): boolean {
  return r > 170 && g > 170 && b > 170 && Math.max(r, g, b) - Math.min(r, g, b) < 30;
}

/**
 * Mide un sobrante a partir de una foto con una hoja A4 como referencia.
 *
 * @param imageFile Foto ya comprimida (ver `comprimirFoto`); esta función la
 *   reescala igualmente a `LADO_MAXIMO_PROCESO` para que el procesamiento sea
 *   rápido en un celular de gama media.
 * @param referencia Orientación en la que se colocó la hoja A4 en la foto.
 */
export async function medirSobrante(
  imageFile: File,
  referencia: TipoReferencia,
): Promise<MeasureResult> {
  const cv = await cargarOpenCv();
  const canvas = await archivoACanvas(imageFile);

  const src = cv.imread(canvas);
  const gris = new cv.Mat();
  const difuminada = new cv.Mat();
  const bordes = new cv.Mat();
  const dilatada = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  const contornos = new cv.MatVector();
  const jerarquia = new cv.Mat();

  // Mats de vida corta que se crean dentro del bucle de contornos: se liberan
  // ahí mismo en vez de acumularlos en esta lista.
  const liberarAlFinal: Mat[] = [src, gris, difuminada, bordes, dilatada, kernel, jerarquia];

  try {
    cv.cvtColor(src, gris, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gris, difuminada, new cv.Size(5, 5), 0);
    cv.Canny(difuminada, bordes, 50, 150);
    cv.dilate(bordes, dilatada, kernel, new cv.Point(-1, -1), 2);
    cv.findContours(dilatada, contornos, jerarquia, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const candidatos = extraerCandidatos(cv, contornos, src);
    contornos.delete();

    if (candidatos.length < 2) {
      return resultadoVacio(
        canvas,
        "No se pudieron detectar los rectángulos. Asegúrate de que la hoja de referencia y el sobrante sean visibles, bien iluminados y con buen contraste contra el fondo.",
      );
    }

    // El candidato con la proporción más parecida al A4 y de color blancuzco
    // es la referencia; si dos calzan por proporción, el blanco desempata.
    const ordenados = [...candidatos].sort((a, b) => {
      const puntajeA = a.distanciaAlA4 - (esBlancuzco(a.colorMedio) ? 0.05 : 0);
      const puntajeB = b.distanciaAlA4 - (esBlancuzco(b.colorMedio) ? 0.05 : 0);
      return puntajeA - puntajeB;
    });

    const refCandidato = ordenados[0];
    if (refCandidato.distanciaAlA4 > TOLERANCIA_PROPORCION) {
      return resultadoVacio(
        canvas,
        "No se encontró un rectángulo con la proporción de una hoja A4. Verifica que la hoja esté completa y plana en la foto.",
      );
    }

    // El sobrante es el candidato más grande entre el resto, sea cual sea su
    // proporción: puede ser cualquier forma rectangular.
    const restantes = ordenados.slice(1).sort((a, b) => b.areaPx - a.areaPx);
    const sobranteCandidato = restantes[0];
    if (!sobranteCandidato) {
      return resultadoVacio(
        canvas,
        "Se detectó la hoja de referencia pero no un segundo rectángulo. Aleja un poco la cámara para que el sobrante quede completo en la foto.",
      );
    }

    const { rect: refRect } = refCandidato;
    const { rect: sobRect } = sobranteCandidato;

    // Con el A4 horizontal el lado ancho de la foto es el largo (29,7 cm); en
    // vertical es al revés. La escala final promedia ambos ejes para
    // compensar una perspectiva ligeramente inclinada.
    const [refCmAncho, refCmAlto] =
      referencia === "a4_horizontal"
        ? [A4_LARGO_CM, A4_CORTO_CM]
        : [A4_CORTO_CM, A4_LARGO_CM];

    const escalaX = refCmAncho / refRect.width;
    const escalaY = refCmAlto / refRect.height;
    const escala = (escalaX + escalaY) / 2;

    const anchoCm = Number((sobRect.width * escala).toFixed(1));
    const altoCm = Number((sobRect.height * escala).toFixed(1));

    const colorHex = colorAHex(sobranteCandidato.colorMedio);

    const imagenProcesada = dibujarResultado(cv, src, refRect, sobRect);

    // La confianza baja con la distancia a la proporción ideal del A4: una
    // hoja detectada casi perfecta da confianza alta, una detección forzada
    // por la tolerancia da confianza baja y pide revisar a mano.
    const confianza = Number(
      Math.max(0, 1 - refCandidato.distanciaAlA4 / TOLERANCIA_PROPORCION).toFixed(2),
    );

    return {
      anchoCm,
      altoCm,
      colorHex,
      rectanguloReferencia: aRectanguloDetectado(refRect),
      rectanguloSobrante: aRectanguloDetectado(sobRect),
      imagenProcesada,
      confianza,
      error: null,
    };
  } finally {
    for (const mat of liberarAlFinal) mat.delete();
  }
}

function extraerCandidatos(
  cv: CV,
  contornos: MatVector,
  origen: Mat,
): Candidato[] {
  const candidatos: Candidato[] = [];

  for (let i = 0; i < contornos.size(); i++) {
    const contorno = contornos.get(i);
    const aproximado = new cv.Mat();
    const perimetro = cv.arcLength(contorno, true);
    cv.approxPolyDP(contorno, aproximado, 0.02 * perimetro, true);

    const area = cv.contourArea(contorno);

    if (aproximado.rows === 4 && area > AREA_MINIMA_PX) {
      const rect = cv.boundingRect(contorno);
      const lados = [rect.width, rect.height].sort((a, b) => b - a);
      const proporcion = lados[0] / lados[1];

      const roi = origen.roi(rect);
      const colorMedio = promedioColorRoi(cv, roi);
      roi.delete();

      candidatos.push({
        rect,
        areaPx: area,
        proporcion,
        distanciaAlA4: Math.abs(proporcion - A4_PROPORCION) / A4_PROPORCION,
        colorMedio,
      });
    }

    contorno.delete();
    aproximado.delete();
  }

  return candidatos;
}

/** Promedio RGB de una región. `cv.mean` devuelve [R, G, B, A] sobre RGBA. */
function promedioColorRoi(
  cv: CV,
  roi: Mat,
): [number, number, number] {
  const promedio = cv.mean(roi);
  return [Math.round(promedio[0]), Math.round(promedio[1]), Math.round(promedio[2])];
}

function colorAHex([r, g, b]: [number, number, number]): string {
  const canal = (n: number) => n.toString(16).padStart(2, "0");
  return `#${canal(r)}${canal(g)}${canal(b)}`.toUpperCase();
}

function aRectanguloDetectado(rect: Rect): RectanguloDetectado {
  return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
}

/** Dibuja la referencia en azul y el sobrante en verde sobre una copia de la imagen. */
function dibujarResultado(
  cv: CV,
  src: Mat,
  referencia: Rect,
  sobrante: Rect,
): string {
  const salida = src.clone();
  // La sobrecarga que recibe un Rect directamente exige que el objeto tenga
  // exactamente la forma que embind serializa para esa clase, y un Rect que
  // pasó por closures/reasignaciones de JS no siempre la conserva. Se usa la
  // sobrecarga con dos puntos, construidos con `new cv.Point`, que es la más
  // literal y no depende de la forma interna de Rect.
  const dibujarUno = (rect: Rect, color: InstanceType<CV["Scalar"]>) => {
    const p1 = new cv.Point(rect.x, rect.y);
    const p2 = new cv.Point(rect.x + rect.width, rect.y + rect.height);
    cv.rectangle(salida, p1, p2, color, 3);
  };

  dibujarUno(referencia, new cv.Scalar(37, 99, 235, 255));
  dibujarUno(sobrante, new cv.Scalar(5, 150, 105, 255));

  const canvasSalida = document.createElement("canvas");
  cv.imshow(canvasSalida, salida);
  salida.delete();

  return canvasSalida.toDataURL("image/jpeg", 0.85);
}

function resultadoVacio(canvas: HTMLCanvasElement, mensaje: string): MeasureResult {
  return {
    anchoCm: null,
    altoCm: null,
    colorHex: null,
    rectanguloReferencia: null,
    rectanguloSobrante: null,
    imagenProcesada: canvas.toDataURL("image/jpeg", 0.85),
    confianza: 0,
    error: mensaje,
  };
}
