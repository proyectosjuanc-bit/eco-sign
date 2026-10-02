import { areaM2 } from "@/lib/format";
import type { Unidad } from "@/types/database";

/**
 * Cálculo del consumo y costo teóricos de un trabajo.
 *
 * Lo usan la página del trabajo (para mostrarlos) y `registrarConsumoReal` (para
 * calcular el ahorro EN EL SERVIDOR). Tener una sola fórmula evita que lo que se
 * ve en pantalla y lo que se guarda como ahorro puedan discrepar, y evita
 * confiar en cifras que envíe el navegador.
 */

interface PiezaConsumo {
  material_id: string;
  ancho_cm: number;
  alto_cm: number;
  cantidad: number;
}

interface MaterialConsumo {
  id: string;
  costo_unitario: number;
  unidad: Unidad;
}

export interface ConsumoTeorico {
  /** m² de las piezas por área (los materiales "por unidad" no se miden en m²). */
  consumoTeoricoM2: number;
  /** Costo de todas las piezas: por área × precio/m², o cantidad × precio/unidad. */
  costoTeorico: number;
  /** Costo medio por m², el precio al que se valora cada m² ahorrado. */
  costoM2: number;
}

export function calcularConsumoTeorico(
  piezas: PiezaConsumo[],
  materiales: MaterialConsumo[],
): ConsumoTeorico {
  const porMaterial = new Map(materiales.map((m) => [m.id, m]));

  let consumoTeoricoM2 = 0;
  let costoTeorico = 0;

  for (const pieza of piezas) {
    const material = porMaterial.get(pieza.material_id);
    const area = areaM2(pieza.ancho_cm, pieza.alto_cm) * pieza.cantidad;

    // Un material por unidad (tornillos, luces LED…) no entra en los m².
    if (material?.unidad !== "unidad") consumoTeoricoM2 += area;

    if (!material) continue;
    costoTeorico +=
      material.unidad === "m2"
        ? area * material.costo_unitario
        : material.costo_unitario * pieza.cantidad;
  }

  return {
    consumoTeoricoM2,
    costoTeorico,
    costoM2: consumoTeoricoM2 > 0 ? costoTeorico / consumoTeoricoM2 : 0,
  };
}
