import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import {
  sendMonthlySummary,
  sendSobranteAlert,
  sendWelcomeEmail,
} from "@/lib/email/send";
import { SUSCRIPCION_MENSUAL, calcularRoi } from "@/lib/roi";

/**
 * Endpoint para probar las plantillas de correo sin tener que registrarse ni
 * esperar al cierre de mes. Envía una plantilla con datos de ejemplo.
 *
 * Protección: libre en desarrollo; en producción exige la cabecera
 * `X-Test-Secret` con el valor de `TEST_EMAIL_SECRET`. Si esa variable no está
 * definida, el endpoint queda cerrado en producción — un endpoint que envía
 * correo en nombre del proyecto no debe quedar abierto por un olvido de
 * configuración.
 */

// El SDK de Resend y timingSafeEqual necesitan APIs de Node, no el runtime edge.
export const runtime = "nodejs";

const TIPOS = ["bienvenida", "resumen", "sobrante"] as const;
type Tipo = (typeof TIPOS)[number];

/** Compara en tiempo constante, para no filtrar el secreto carácter a carácter. */
function secretoValido(recibido: string | null, esperado: string): boolean {
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  // timingSafeEqual exige longitudes iguales; distinta longitud ya es un fallo.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function autorizado(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;

  const esperado = process.env.TEST_EMAIL_SECRET;
  if (!esperado) return false;

  return secretoValido(request.headers.get("x-test-secret"), esperado);
}

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo debe ser JSON: { \"to\": \"correo@ejemplo.com\" }" },
      { status: 400 },
    );
  }

  const datos = (cuerpo ?? {}) as { to?: unknown; tipo?: unknown };
  const to = typeof datos.to === "string" ? datos.to.trim() : "";

  if (!to) {
    return NextResponse.json(
      { error: "Falta \"to\": el correo de destino." },
      { status: 400 },
    );
  }

  const tipo: Tipo = TIPOS.includes(datos.tipo as Tipo)
    ? (datos.tipo as Tipo)
    : "bienvenida";

  const resultado = await enviarEjemplo(tipo, to);

  // 502: el fallo viene del proveedor de correo, no de la petición.
  return NextResponse.json(
    { tipo, to, ...resultado },
    { status: resultado.ok ? 200 : 502 },
  );
}

function enviarEjemplo(tipo: Tipo, to: string) {
  switch (tipo) {
    case "resumen": {
      // Un mes que se autofinancia, para ver el caso bueno de la plantilla.
      const ahorro = 412_000;
      const { roiCircular } = calcularRoi(ahorro);
      return sendMonthlySummary(
        to,
        "Juan",
        ahorro,
        roiCircular,
        SUSCRIPCION_MENSUAL,
      );
    }
    case "sobrante":
      return sendSobranteAlert(
        to,
        "Juan",
        "SOB-014",
        "Acrílico · Blanco",
        "50 × 43,5 cm",
      );
    case "bienvenida":
      return sendWelcomeEmail(to, "Juan", "Publicidad Patiño");
  }
}
