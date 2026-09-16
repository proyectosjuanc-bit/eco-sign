/**
 * Parser de CSV mínimo, sin dependencias externas.
 *
 * Cubre lo que necesita una plantilla exportada desde Excel: separador coma,
 * comillas dobles para encerrar campos con comas o saltos de línea dentro, y
 * comillas dobles escapadas como `""`. No intenta cubrir todo RFC 4180 (por
 * ejemplo distintos separadores por configuración regional), porque la
 * plantilla que ofrece la aplicación siempre usa coma.
 */
export function parsearCsv(contenido: string): string[][] {
  // Quita el BOM que Excel añade al exportar UTF-8, si está presente.
  const texto = contenido.charCodeAt(0) === 0xfeff ? contenido.slice(1) : contenido;

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let dentroDeComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (dentroDeComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      dentroDeComillas = true;
    } else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      // \r\n cuenta como un solo salto: el \n que sigue al \r se ignora.
      if (c === "\r" && texto[i + 1] === "\n") continue;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else {
      campo += c;
    }
  }

  // Última fila sin salto de línea final.
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}

/**
 * Convierte filas de CSV con encabezado en objetos {columna: valor}, usando
 * la primera fila como nombres de columna. Columnas de más o de menos en una
 * fila se ignoran o quedan como cadena vacía, para no reventar por un CSV
 * mal alineado.
 */
export function filasComoObjetos(filas: string[][]): Record<string, string>[] {
  if (!filas.length) return [];
  const encabezados = filas[0].map((h) => h.trim().toLowerCase());
  return filas.slice(1).map((fila) => {
    const objeto: Record<string, string> = {};
    encabezados.forEach((encabezado, i) => {
      objeto[encabezado] = (fila[i] ?? "").trim();
    });
    return objeto;
  });
}
