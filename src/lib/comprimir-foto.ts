/**
 * Compresión de fotos en el navegador, antes de subirlas.
 *
 * Una foto de celular ronda los 2-8 MB, y para documentar un retal no hace
 * falta esa resolución. Comprimir en el cliente evita el límite de tamaño de
 * las Server Actions, ahorra datos móviles en el taller y hace la subida
 * mucho más rápida.
 */

/** Lado mayor de la imagen resultante, en píxeles. */
const LADO_MAXIMO = 1600;

/** Calidad JPEG: 0,8 conserva bien el detalle sin disparar el peso. */
const CALIDAD = 0.8;

/**
 * Reduce y recomprime una imagen a JPEG.
 *
 * Si algo falla —un formato que el navegador no sabe decodificar, un canvas no
 * disponible— devuelve el archivo original: es preferible subir la foto pesada
 * a perder el registro.
 */
export async function comprimirFoto(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/")) return archivo;

  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(
      1,
      LADO_MAXIMO / Math.max(bitmap.width, bitmap.height),
    );

    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;

    const contexto = canvas.getContext("2d");
    if (!contexto) return archivo;

    contexto.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", CALIDAD);
    });

    if (!blob) return archivo;

    // Si comprimir no mejoró nada, se queda el original.
    if (blob.size >= archivo.size) return archivo;

    const nombre = archivo.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${nombre}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return archivo;
  }
}

/**
 * Sustituye el archivo de un input por su versión comprimida.
 *
 * Se usa `DataTransfer` porque `input.files` es de sólo lectura, y así el
 * formulario envía la imagen ligera sin cambiar cómo se declara el campo.
 */
export async function comprimirEnInput(
  input: HTMLInputElement,
): Promise<File | null> {
  const archivo = input.files?.[0];
  if (!archivo) return null;

  const comprimido = await comprimirFoto(archivo);
  if (comprimido === archivo) return archivo;

  const transferencia = new DataTransfer();
  transferencia.items.add(comprimido);
  input.files = transferencia.files;

  return comprimido;
}
