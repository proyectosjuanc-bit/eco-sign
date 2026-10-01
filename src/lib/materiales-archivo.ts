import "server-only";

import ExcelJS from "exceljs";

import { parsearCsv } from "@/lib/csv";

/**
 * Plantilla de Excel para cargar materiales en lote, y lectura del archivo
 * que el cliente devuelve completado.
 *
 * Antes la plantilla era un CSV. Para un taller eso tenía dos problemas: el
 * formato no es familiar, y Excel configurado para Colombia usa punto y coma
 * como separador de listas, así que un CSV separado por comas se abría con
 * todo amontonado en la primera columna. La plantilla ahora es un .xlsx con
 * encabezados en español, una lista desplegable para la unidad, notas de
 * ayuda en cada encabezado y una hoja de instrucciones con ejemplos.
 *
 * La subida acepta el .xlsx y sigue aceptando CSV, con los encabezados
 * técnicos de antes (`tipo`, `ancho_cm`…) o los nuevos en español: quien ya
 * tenga un CSV preparado no tiene que rehacerlo.
 *
 * Sólo servidor: exceljs es pesado y no tiene por qué viajar al navegador.
 */

/** Claves internas de cada columna: las mismas que espera `importarMateriales`. */
export type ClaveColumna =
  | "tipo"
  | "color"
  | "unidad"
  | "ancho_cm"
  | "alto_cm"
  | "costo_lamina"
  | "costo_unitario"
  | "stock_laminas"
  | "grosor_mm";

interface Columna {
  clave: ClaveColumna;
  titulo: string;
  ayuda: string;
  obligatoria: boolean;
  ancho: number;
  formato?: "numero" | "dinero";
}

/** Valores de la lista desplegable de "Se mide por", tal como los ve el cliente. */
const UNIDADES_VISIBLES = ["Lámina (m²)", "Unidad", "Metro lineal"] as const;

const COLUMNAS: Columna[] = [
  {
    clave: "tipo",
    titulo: "Tipo de material",
    ayuda: "Obligatorio. Por ejemplo: Acrílico, Vinilo, Luces LED.",
    obligatoria: true,
    ancho: 24,
  },
  {
    clave: "color",
    titulo: "Color",
    ayuda: "Opcional. Por ejemplo: Blanco, Transparente.",
    obligatoria: false,
    ancho: 16,
  },
  {
    clave: "unidad",
    titulo: "Se mide por",
    ayuda: "Elige de la lista: Lámina (m²), Unidad o Metro lineal. Si lo dejas vacío, se toma como lámina.",
    obligatoria: false,
    ancho: 16,
  },
  {
    clave: "ancho_cm",
    titulo: "Ancho lámina (cm)",
    ayuda: "Solo para láminas. Medida de UNA lámina en centímetros.",
    obligatoria: false,
    ancho: 18,
    formato: "numero",
  },
  {
    clave: "alto_cm",
    titulo: "Alto lámina (cm)",
    ayuda: "Solo para láminas. Medida de UNA lámina en centímetros.",
    obligatoria: false,
    ancho: 18,
    formato: "numero",
  },
  {
    clave: "costo_lamina",
    titulo: "Precio de una lámina",
    ayuda: "Solo para láminas. Lo que cuesta UNA lámina entera. El precio por m² se calcula solo.",
    obligatoria: false,
    ancho: 20,
    formato: "dinero",
  },
  {
    clave: "costo_unitario",
    titulo: "Precio por unidad o metro",
    ayuda: "Para lo que NO es lámina: el precio de cada unidad (un tornillo, una luz LED) o de cada metro lineal.",
    obligatoria: false,
    ancho: 24,
    formato: "dinero",
  },
  {
    clave: "stock_laminas",
    titulo: "Existencias",
    ayuda: "Cuántas láminas, unidades o metros tienes hoy. Si lo dejas vacío, queda en 0.",
    obligatoria: false,
    ancho: 14,
    formato: "numero",
  },
  {
    clave: "grosor_mm",
    titulo: "Grosor (mm)",
    ayuda: "Opcional. Por ejemplo: 3 para un acrílico de 3 mm.",
    obligatoria: false,
    ancho: 13,
    formato: "numero",
  },
];

const EJEMPLOS: (string | number)[][] = [
  ["Acrílico", "Blanco", "Lámina (m²)", 120, 180, 250000, "", 5, 3],
  ["Luces LED", "", "Unidad", "", "", "", 3500, 100, ""],
  ["Vinilo de corte", "Negro", "Metro lineal", "", "", "", 12000, 50, ""],
];

/** Filas con validación y formato preparadas en la hoja; de sobra para una carga inicial. */
const FILAS_PREPARADAS = 500;

/** Tope de lo que se procesa al subir: protege al servidor de un archivo enorme. */
export const MAX_FILAS = 2000;
export const MAX_BYTES_ARCHIVO = 2 * 1024 * 1024;

const VERDE = "FF16A34A";
const GRIS_CLARO = "FFF3F4F6";

const NOMBRE_HOJA = "Materiales";

// ---------------------------------------------------------------------------
// Generar la plantilla
// ---------------------------------------------------------------------------

export async function generarPlantillaExcel(): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "ECO-SIGN";
  libro.created = new Date();

  const hoja = libro.addWorksheet(NOMBRE_HOJA, {
    // Encabezado fijo al bajar por la hoja.
    views: [{ state: "frozen", ySplit: 1 }],
  });

  hoja.columns = COLUMNAS.map((c) => ({ header: c.titulo, key: c.clave, width: c.ancho }));

  const encabezado = hoja.getRow(1);
  encabezado.height = 32;
  encabezado.eachCell((celda, numero) => {
    const columna = COLUMNAS[numero - 1];
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    celda.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    // Nota al pasar el mouse: explica la columna sin ocupar espacio en la hoja.
    celda.note = columna.ayuda;
  });

  for (let fila = 2; fila <= FILAS_PREPARADAS + 1; fila++) {
    COLUMNAS.forEach((columna, i) => {
      const celda = hoja.getCell(fila, i + 1);

      if (columna.clave === "unidad") {
        celda.dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`"${UNIDADES_VISIBLES.join(",")}"`],
          showErrorMessage: true,
          errorTitle: "Se mide por",
          error: "Elige una opción de la lista: Lámina (m²), Unidad o Metro lineal.",
        };
      } else if (columna.formato) {
        celda.dataValidation = {
          type: "decimal",
          operator: "greaterThanOrEqual",
          allowBlank: true,
          formulae: [0],
          showErrorMessage: true,
          errorTitle: columna.titulo,
          error: "Escribe solo el número, sin letras ni símbolos. Por ejemplo: 250000",
        };
        if (columna.formato === "dinero") celda.numFmt = '"$"#,##0';
      }
    });
  }

  agregarInstrucciones(libro);

  return libro.xlsx.writeBuffer();
}

function agregarInstrucciones(libro: ExcelJS.Workbook) {
  const hoja = libro.addWorksheet("Instrucciones");
  hoja.getColumn(1).width = 28;
  hoja.getColumn(2).width = 70;
  hoja.getColumn(3).width = 14;

  hoja.getCell("A1").value = "Cómo cargar tus materiales";
  hoja.getCell("A1").font = { bold: true, size: 16, color: { argb: VERDE } };

  const pasos = [
    "1. Ve a la hoja «Materiales» (pestaña de abajo).",
    "2. Escribe un material por fila, debajo de los encabezados verdes.",
    "3. Las láminas llevan medidas y precio de la lámina; lo demás, precio por unidad o metro.",
    "4. Guarda el archivo y súbelo en ECO-SIGN, en Materiales → Cargar varios materiales.",
    "Si una fila tiene un error, las demás se cargan igual y ECO-SIGN te dice qué fila corregir.",
  ];
  pasos.forEach((paso, i) => {
    const celda = hoja.getCell(3 + i, 1);
    celda.value = paso;
    hoja.mergeCells(3 + i, 1, 3 + i, 3);
  });

  let fila = 3 + pasos.length + 1;
  const titulo = (texto: string) => {
    hoja.getCell(fila, 1).value = texto;
    hoja.getCell(fila, 1).font = { bold: true, size: 13 };
    fila++;
  };

  titulo("Qué va en cada columna");
  const cabecera = hoja.getRow(fila);
  cabecera.values = ["Columna", "Qué poner", "¿Obligatoria?"];
  cabecera.font = { bold: true };
  cabecera.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_CLARO } };
  });
  fila++;
  for (const columna of COLUMNAS) {
    const r = hoja.getRow(fila++);
    r.values = [columna.titulo, columna.ayuda, columna.obligatoria ? "Sí" : "No"];
    r.alignment = { vertical: "top", wrapText: true };
  }

  fila++;
  titulo("Ejemplos (cópialos a la hoja «Materiales» si te sirven)");
  const tablaEjemplos = hoja.getRow(fila++);
  tablaEjemplos.values = COLUMNAS.map((c) => c.titulo);
  tablaEjemplos.font = { bold: true };
  tablaEjemplos.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_CLARO } };
    c.alignment = { wrapText: true };
  });
  for (const ejemplo of EJEMPLOS) hoja.getRow(fila++).values = ejemplo;
}

// ---------------------------------------------------------------------------
// Leer el archivo subido
// ---------------------------------------------------------------------------

/** Una fila de datos con el número que tiene en Excel, para reportar errores. */
export interface FilaArchivo {
  numero: number;
  datos: Partial<Record<ClaveColumna, string>>;
}

export type ResultadoLectura =
  | { filas: FilaArchivo[]; error: null }
  | { filas: null; error: string };

/** Minúsculas, sin tildes ni símbolos: "Ancho lámina (cm)" → "ancho lamina cm". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Encabezado del archivo → columna. Acepta el título en español y la clave técnica del CSV de antes. */
const POR_ENCABEZADO = new Map<string, ClaveColumna>(
  COLUMNAS.flatMap((c) => [
    [normalizar(c.titulo), c.clave] as const,
    [normalizar(c.clave), c.clave] as const,
  ]),
);

/**
 * "Lámina (m²)" → "m2", "Unidad" → "unidad", "Metro lineal" → "metro_lineal".
 * También acepta los valores técnicos del CSV de antes. Lo que no se
 * reconoce se devuelve tal cual, y la regla de siempre lo toma como lámina.
 */
export function unidadDesdeTexto(texto: string): string {
  const n = normalizar(texto);
  if (!n) return "";
  if (n === "m2" || n.startsWith("lamina")) return "m2";
  if (n.startsWith("unidad")) return "unidad";
  if (n.startsWith("metro")) return "metro_lineal";
  return texto;
}

/** Convierte una tabla (primera fila = encabezados) en filas con datos por columna. */
function filasDesdeTabla(
  encabezados: string[],
  filas: { numero: number; celdas: string[] }[],
): ResultadoLectura {
  const claves = encabezados.map((h) => POR_ENCABEZADO.get(normalizar(h)) ?? null);
  if (!claves.includes("tipo")) {
    return {
      filas: null,
      error: "No encontramos la columna «Tipo de material». Usa la plantilla de Excel sin cambiar los encabezados.",
    };
  }

  const resultado: FilaArchivo[] = [];
  for (const { numero, celdas } of filas) {
    if (!celdas.some((c) => c.trim())) continue;
    const datos: FilaArchivo["datos"] = {};
    claves.forEach((clave, i) => {
      if (clave) datos[clave] = (celdas[i] ?? "").trim();
    });
    resultado.push({ numero, datos });
  }

  if (resultado.length > MAX_FILAS) {
    return { filas: null, error: `El archivo tiene más de ${MAX_FILAS} materiales. Divídelo en varios archivos.` };
  }
  return { filas: resultado, error: null };
}

/** Valor de una celda como texto, sin el formato de miles: los números van en crudo. */
function textoDeCelda(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return String(valor);
  if (typeof valor === "string") return valor;
  if (typeof valor === "boolean") return valor ? "1" : "0";
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if ("result" in valor) return textoDeCelda(valor.result as ExcelJS.CellValue); // fórmula
  if ("richText" in valor) return valor.richText.map((t) => t.text).join("");
  if ("text" in valor) return String(valor.text); // hipervínculo
  return ""; // celda con error de Excel (#¡VALOR!…)
}

async function leerExcel(contenido: ArrayBuffer): Promise<ResultadoLectura> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(contenido);
  } catch {
    return { filas: null, error: "No pudimos abrir el archivo. Guárdalo de nuevo como Libro de Excel (.xlsx) y vuelve a subirlo." };
  }

  // La hoja "Materiales" de la plantilla; si la renombraron, la primera que
  // no sea la de instrucciones.
  const hoja =
    libro.getWorksheet(NOMBRE_HOJA) ??
    libro.worksheets.find((h) => normalizar(h.name) !== "instrucciones");
  if (!hoja) return { filas: null, error: "El archivo no tiene ninguna hoja con materiales." };

  const leerFila = (fila: ExcelJS.Row) =>
    Array.from({ length: COLUMNAS.length + 5 }, (_, i) => textoDeCelda(fila.getCell(i + 1).value));

  const encabezados = leerFila(hoja.getRow(1));
  const filas: { numero: number; celdas: string[] }[] = [];
  // rowCount incluye las 500 filas preparadas con validación: las vacías se saltan.
  for (let numero = 2; numero <= Math.min(hoja.rowCount, MAX_FILAS * 2); numero++) {
    filas.push({ numero, celdas: leerFila(hoja.getRow(numero)) });
  }

  return filasDesdeTabla(encabezados, filas);
}

function leerCsv(contenido: string): ResultadoLectura {
  const tabla = parsearCsv(contenido);
  if (!tabla.length) return { filas: [], error: null };
  return filasDesdeTabla(
    tabla[0],
    // +2: la fila 1 es el encabezado y la numeración de Excel empieza en 1.
    tabla.slice(1).map((celdas, i) => ({ numero: i + 2, celdas })),
  );
}

/**
 * Lee el archivo subido, sea la plantilla de Excel o un CSV. Se decide por
 * el contenido, no sólo por el nombre: un .xlsx es un zip y empieza por "PK".
 */
export async function leerArchivoMateriales(archivo: File): Promise<ResultadoLectura> {
  if (archivo.size > MAX_BYTES_ARCHIVO) {
    return { filas: null, error: "El archivo pesa más de 2 MB. Divídelo en varios archivos." };
  }

  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith(".xls")) {
    return { filas: null, error: "Ese es el formato antiguo de Excel (.xls). Guárdalo como Libro de Excel (.xlsx) y vuelve a subirlo." };
  }

  const contenido = await archivo.arrayBuffer();
  const bytes = new Uint8Array(contenido, 0, Math.min(2, contenido.byteLength));
  const esZip = bytes[0] === 0x50 && bytes[1] === 0x4b;

  if (esZip || nombre.endsWith(".xlsx")) return leerExcel(contenido);
  return leerCsv(new TextDecoder("utf-8").decode(contenido));
}
