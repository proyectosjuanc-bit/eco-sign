import "server-only";

import { REMITENTE, resend } from "./client";
import { DIAS_VIGENCIA_INVITACION } from "@/lib/roles";
import type { Rol } from "@/types/database";
import {
  alertaSobranteDisponible,
  bienvenida,
  invitacionEmpleado,
  respuestaSolicitud,
  resumenMensual,
  solicitudMaquinaRecibida,
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
async function enviar(
  para: string | string[],
  plantilla: Plantilla,
  responderA?: string,
): Promise<ResultadoEnvio> {
  try {
    const { error } = await resend.emails.send({
      from: REMITENTE,
      to: para,
      subject: plantilla.subject,
      html: plantilla.html,
      text: plantilla.text,
      ...(responderA ? { replyTo: responderA } : {}),
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

/**
 * Aviso al dueño de una máquina (a todos los admins de su taller) de que otro
 * taller la quiere usar. `responderA` es el correo de quien pide: así el dueño
 * contesta desde su bandeja y la respuesta le llega directo al solicitante.
 */
export function sendSolicitudMaquina(
  para: string[],
  responderA: string | undefined,
  datos: Parameters<typeof solicitudMaquinaRecibida>[0],
): Promise<ResultadoEnvio> {
  return enviar(para, solicitudMaquinaRecibida(datos), responderA);
}

/**
 * Respuesta (aceptada o rechazada) al taller que pidió la máquina. Sin
 * `replyTo`: el correo del dueño no se comparte, sólo el teléfono que él
 * publicó con la máquina.
 */
export function sendRespuestaSolicitud(
  para: string[],
  datos: Parameters<typeof respuestaSolicitud>[0],
): Promise<ResultadoEnvio> {
  return enviar(para, respuestaSolicitud(datos));
}

/**
 * Dominio desde el que se abre el enlace de la invitación. Por defecto el de
 * producción; para probar en local se puede fijar NEXT_PUBLIC_APP_URL
 * (por ejemplo http://localhost:3000) y el enlace del correo apunta ahí.
 */
const URL_APP = process.env.NEXT_PUBLIC_APP_URL ?? "https://reutilizando.online";

const FORMATO_FECHA_LARGA = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Bogota",
});

/**
 * Invitación a un empleado para unirse al taller. El enlace lleva el token y
 * caduca a los 7 días (la misma vigencia que se guarda en `invitaciones`).
 * Si el correo falla no lanza: el admin puede reenviar desde la pantalla de equipo.
 */
export function sendInvitacionEmpleado(
  email: string,
  nombreInvitado: string,
  nombreTaller: string,
  nombreInvitador: string,
  rol: Rol,
  token: string,
): Promise<ResultadoEnvio> {
  const expira = new Date(Date.now() + DIAS_VIGENCIA_INVITACION * 24 * 60 * 60 * 1000);
  const enlace = `${URL_APP}/auth/aceptar-invitacion?token=${encodeURIComponent(token)}`;

  return enviar(
    email,
    invitacionEmpleado({
      nombreInvitado,
      nombreTaller,
      nombreInvitador,
      rol,
      enlace,
      expiraEn: FORMATO_FECHA_LARGA.format(expira),
    }),
  );
}
