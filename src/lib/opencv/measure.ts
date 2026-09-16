/**
 * Medición automática de sobrantes a partir de una foto con un objeto de
 * referencia de tamaño conocido.
 *
 * El principio es simple: la referencia tiene un tamaño real conocido (una
 * hoja A4 de 29,7 × 21,0 cm, o una regla de 30 × 3 cm), así que su tamaño en
 * píxeles dentro de la foto da la escala cm/píxel, y esa escala se aplica al
 * rectángulo del sobrante.
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

/**
 * Formas de referencia soportadas.
 *
 * El A4 se pide con orientación porque sus dos lados son conocidos y se
 * aprovechan ambos. La regla no la necesita: se detecta por proporción y se
 * mide sólo por su lado largo, así que da igual cómo esté puesta.
 */
export type TipoReferencia = "a4_horizontal" | "a4_vertical" | "regla";

/** Tamaño real de una hoja A4, en centímetros. */
const A4_LARGO_CM = 29.7;
const A4_CORTO_CM = 21.0;

/** Regla de escritorio estándar. */
const REGLA_LARGO_CM = 30;
const REGLA_CORTO_CM = 3;

/** Descripción de una referencia: cómo reconocerla y cómo sacarle la escala. */
interface PerfilReferencia {
  /** Proporción lado largo / lado corto que debe tener su caja envolvente. */
  proporcion: number;
  /** Cuánto puede desviarse esa proporción antes de descartar el candidato. */
  tolerancia: number;
  /** Llenado mínimo de la caja envolvente: 1 es un rectángulo perfecto. */
  llenadoMinimo: number;
  /** Mensaje cuando no se encuentra ningún candidato válido. */
  errorNoEncontrada: string;
}

const PERFILES: Record<TipoReferencia, PerfilReferencia> = {
  a4_horizontal: {
    proporcion: A4_LARGO_CM / A4_CORTO_CM,
    tolerancia: 0.18,
    llenadoMinimo: 0.85,
    errorNoEncontrada:
      "No se encontró la hoja de referencia. Asegúrate de que la hoja A4 esté completa y con buen contraste.",
  },
  a4_vertical: {
    proporcion: A4_LARGO_CM / A4_CORTO_CM,
    tolerancia: 0.18,
    llenadoMinimo: 0.85,
    errorNoEncontrada:
      "No se encontró la hoja de referencia. Asegúrate de que la hoja A4 esté completa y con buen contraste.",
  },
  regla: {
    proporcion: REGLA_LARGO_CM / REGLA_CORTO_CM,
    // Más holgada que el A4: una regla suele fotografiarse en ángulo y su
    // lado corto son sólo 3 cm, así que unos pocos píxeles de borde mal
    // recortado mueven la proporción mucho más que en una hoja.
    tolerancia: 0.3,
    // También más holgado: las marcas de centímetros y los números impresos
    // hacen que el borde detectado sea menos limpio que el de una hoja.
    llenadoMinimo: 0.7,
    errorNoEncontrada:
      "No se encontró la regla. Asegúrate de que la regla esté completa y horizontal o vertical.",
  },
};

/** Lado mayor al que se reescala la imagen antes de procesar, en píxeles. */
const LADO_MAXIMO_PROCESO = 1200;

/** Área mínima de un contorno para considerarlo candidato, en px². */
const AREA_MINIMA_PX = 5000;

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
  /** 0 a 1. Baja cuando la proporción del candidato se aleja de la esperada. */
  confianza: number;
  /**
   * Avisos que no impiden medir pero conviene que el usuario vea: por ejemplo
   * que había varios objetos que podían pasar por la referencia.
   */
  avisos: string[];
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
  /** Desviación relativa entre la proporción del candidato y la de la referencia buscada. */
  distanciaAProporcion: number;
  colorMedio: [number, number, number];
  /**
   * Área real del contorno entre el área de su caja envolvente: 1.0 es un
   * rectángulo perfecto, más bajo cuanto más curva o irregular es la forma.
   * Una hoja A4 o una regla reales dan valores muy cercanos a 1.
   */
  llenado: number;
}

/**
 * Mide un sobrante a partir de una foto con un objeto de referencia.
 *
 * @param imageFile Foto ya comprimida (ver `comprimirFoto`); esta función la
 *   reescala igualmente a `LADO_MAXIMO_PROCESO` para que el procesamiento sea
 *   rápido en un celular de gama media.
 * @param referencia Qué objeto de referencia hay en la foto. Con A4 hay que
 *   decir su orientación, porque se aprovechan sus dos lados; con la regla no
 *   hace falta, porque sólo se usa su lado largo.
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

    const perfil = PERFILES[referencia];
    const candidatos = extraerCandidatos(cv, contornos, src, perfil);
    contornos.delete();

    if (candidatos.length < 2) {
      return resultadoVacio(
        canvas,
        "No se pudieron detectar los rectángulos. Asegúrate de que la referencia y el sobrante sean visibles, bien iluminados y con buen contraste contra el fondo.",
      );
    }

    // La referencia es el candidato cuya caja envolvente tiene la proporción
    // más parecida a la esperada Y que además "llena" bien esa caja: una hoja
    // o una regla son rectángulos casi perfectos, mientras que un sobrante
    // curvo puede coincidir por casualidad en proporción sin llenar su caja
    // igual de bien. No se usa el color para desempatar: un sobrante del
    // mismo material blanco o gris claro que el papel es el caso normal en un
    // taller, así que el color no distingue de forma confiable cuál es cuál.
    const validos = candidatos
      .filter((c) => c.llenado >= perfil.llenadoMinimo)
      .filter((c) => c.distanciaAProporcion <= perfil.tolerancia);

    // Entre los que pasan el filtro se toma el de mayor área. Con una regla
    // esto importa más que con un A4: las marcas de centímetros generan
    // contornos internos alargados que también cumplen la proporción, y son
    // siempre mucho más pequeños que la regla entera.
    const porArea = [...validos].sort((a, b) => b.areaPx - a.areaPx);
    const refCandidato = porArea[0];

    if (!refCandidato) {
      return resultadoVacio(canvas, perfil.errorNoEncontrada);
    }

    const avisos: string[] = [];
    if (porArea.length > 1) {
      avisos.push(
        `Se detectaron ${porArea.length} objetos que podrían ser la referencia. Se usó el más grande; comprueba en la imagen que sea el correcto.`,
      );
    }

    // El sobrante es el candidato más grande entre el resto, sea cual sea su
    // forma: puede ser cualquier contorno, rectangular o no.
    const restantes = candidatos
      .filter((c) => c !== refCandidato)
      .sort((a, b) => b.areaPx - a.areaPx);
    const sobranteCandidato = restantes[0];
    if (!sobranteCandidato) {
      return resultadoVacio(
        canvas,
        "Se detectó la referencia pero no un segundo objeto. Aleja un poco la cámara para que el sobrante quede completo en la foto.",
      );
    }

    const { rect: refRect } = refCandidato;
    const { rect: sobRect } = sobranteCandidato;

    const escala = calcularEscala(referencia, refRect);

    const anchoCm = Number((sobRect.width * escala).toFixed(1));
    const altoCm = Number((sobRect.height * escala).toFixed(1));

    const colorHex = colorAHex(sobranteCandidato.colorMedio);

    const imagenProcesada = dibujarResultado(cv, src, refRect, sobRect);

    // La confianza baja con la distancia a la proporción ideal: una referencia
    // detectada casi perfecta da confianza alta, una detección forzada por el
    // límite de la tolerancia da confianza baja y pide revisar a mano.
    const confianza = Number(
      Math.max(0, 1 - refCandidato.distanciaAProporcion / perfil.tolerancia).toFixed(2),
    );

    return {
      anchoCm,
      altoCm,
      colorHex,
      rectanguloReferencia: aRectanguloDetectado(refRect),
      rectanguloSobrante: aRectanguloDetectado(sobRect),
      imagenProcesada,
      confianza,
      avisos,
      error: null,
    };
  } finally {
    for (const mat of liberarAlFinal) mat.delete();
  }
}

/**
 * Centímetros por píxel a partir de la caja envolvente de la referencia.
 *
 * Con el A4 se promedian los dos ejes, porque sus dos lados son conocidos y
 * promediar compensa una perspectiva ligeramente inclinada.
 *
 * Con la regla se usa **sólo el lado largo**, y es deliberado: su lado corto
 * mide 3 cm, así que en la foto ocupa pocos píxeles y un error de dos o tres
 * píxeles en ese borde —muy fácil con las marcas impresas— se amplifica al
 * dividir y desviaría la escala bastante. El lado largo, de 30 cm, es mucho
 * más estable.
 */
function calcularEscala(referencia: TipoReferencia, refRect: Rect): number {
  if (referencia === "regla") {
    const ladoLargoPx = Math.max(refRect.width, refRect.height);
    return REGLA_LARGO_CM / ladoLargoPx;
  }

  // Con el A4 horizontal el lado ancho de la foto es el largo (29,7 cm); en
  // vertical es al revés.
  const [refCmAncho, refCmAlto] =
    referencia === "a4_horizontal"
      ? [A4_LARGO_CM, A4_CORTO_CM]
      : [A4_CORTO_CM, A4_LARGO_CM];

  const escalaX = refCmAncho / refRect.width;
  const escalaY = refCmAlto / refRect.height;
  return (escalaX + escalaY) / 2;
}

function extraerCandidatos(
  cv: CV,
  contornos: MatVector,
  origen: Mat,
  perfil: PerfilReferencia,
): Candidato[] {
  const candidatos: Candidato[] = [];

  for (let i = 0; i < contornos.size(); i++) {
    const contorno = contornos.get(i);
    const area = cv.contourArea(contorno);

    // No se exige que el contorno sea un rectángulo de 4 vértices: un
    // sobrante puede tener bordes curvos o irregulares. Se usa su caja
    // envolvente (bounding box) como medida, igual que ya se hace a mano con
    // las piezas irregulares en Trabajos. El filtro de "llenado" más abajo es
    // lo que sigue distinguiendo una referencia real (rectángulo casi
    // perfecto) de una forma curva sin depender de contar vértices.
    if (area > AREA_MINIMA_PX) {
      const rect = cv.boundingRect(contorno);
      const lados = [rect.width, rect.height].sort((a, b) => b - a);
      // Siempre largo/corto, así que da igual si la referencia está
      // horizontal o vertical: una regla tumbada y una de pie dan el mismo
      // número.
      const proporcion = lados[0] / lados[1];
      const areaCaja = rect.width * rect.height;

      const roi = origen.roi(rect);
      const colorMedio = promedioColorRoi(cv, roi);
      roi.delete();

      candidatos.push({
        rect,
        areaPx: area,
        proporcion,
        distanciaAProporcion:
          Math.abs(proporcion - perfil.proporcion) / perfil.proporcion,
        colorMedio,
        llenado: areaCaja > 0 ? area / areaCaja : 0,
      });
    }

    contorno.delete();
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
    avisos: [],
    error: mensaje,
  };
}
