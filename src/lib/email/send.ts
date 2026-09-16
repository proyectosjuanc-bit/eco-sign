import "server-only";

import { REMITENTE, resend } from "./client";
import {
  alertaSobranteDisponible,
  bienvenida,
  resumenMensual,
  type Plantilla,
} from "./templates";

/**
 * Envío de correo transaccional de ECO-SIGN.
 *
 * ⚠️ SOLO SERVIDOR: importa `client.ts`, que lee la clave secreta de Resend.
 * El import de `server-only` lo impone en tiempo de build. Úsalo desde Server
 * Actions, Route Handlers o componentes de servidor.
 *
 * Regla de esta capa: **un correo que falla nunca rompe el flujo del usuario.**
 * Que no llegue el correo de bienvenida es molesto; que no se pueda crear la
 * cuenta porque el proveedor de correo está caído es inaceptable. Por eso todas
 * las funciones capturan el error, lo registran y devuelven
 * `{ ok: false, error }` en vez de lanzar.
 */

export interface ResultadoEnvio {
  ok: boolean;
  error?: string;
}

/**
 * Envía una plantilla ya construida y absorbe cualquier fallo.
 *
 * Resend puede fallar de dos formas distintas: lanzando (red caída, clave
 * ausente) o devolviendo `{ error }` en la respuesta (destinatario rechazado,
 * límite alcanzado). Las dos se tratan igual aquí.
 */
async function enviar(para: string, plantilla: Plantilla): Promise<ResultadoEnvio> {
  try {
    const { error } = await resend.emails.send({
      from: REMITENTE,
      to: para,
      subject: plantilla.subject,
      html: plantilla.html,
      text: plantilla.text,
    });

    if (error) {
      console.error("[email] Resend rechazó el envío:", plantilla.subject, error);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (fallo) {
    const mensaje = fallo instanceof Error ? fallo.message : String(fallo);
    console.error("[email] No se pudo enviar:", plantilla.subject, mensaje);
    return { ok: false, error: mensaje };
  }
}

export function sendWelcomeEmail(
  email: string,
  nombre: string,
  empresa: string,
): Promise<ResultadoEnvio> {
  return enviar(email, bienvenida({ nombre, empresa }));
}

export function sendMonthlySummary(
  email: string,
  nombre: string,
  ahorro: number,
  roiCircular: number,
  suscripcion: number,
): Promise<ResultadoEnvio> {
  return enviar(
    email,
    resumenMensual({ nombre, ahorro, roiCircular, suscripcion }),
  );
}

export function sendSobranteAlert(
  email: string,
  nombre: string,
  codigoSobrante: string,
  material: string,
  medidas: string,
): Promise<ResultadoEnvio> {
  return enviar(
    email,
    alertaSobranteDisponible({ nombre, codigoSobrante, material, medidas }),
  );
}
