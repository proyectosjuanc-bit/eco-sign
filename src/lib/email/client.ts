import "server-only";

import { Resend } from "resend";

/**
 * Cliente de Resend para el correo transaccional de ECO-SIGN.
 *
 * ⚠️ SOLO SERVIDOR. Este archivo lee `RESEND_API_KEY`, que es una credencial
 * secreta: importarlo desde un componente cliente la filtraría al navegador.
 * El import de `server-only` de arriba hace que el build falle si alguien lo
 * intenta, en vez de dejar que la clave llegue al navegador sin avisar.
 * Impórtalo únicamente desde Server Actions, Route Handlers o componentes de
 * servidor. En la práctica sólo debería importarlo `send.ts`, que es la puerta
 * de entrada al envío de correo.
 *
 * La clave se lee al construir el cliente. Si falta, Resend no falla aquí sino
 * al enviar; `send.ts` captura ese error y lo registra sin romper el flujo del
 * usuario (ver `enviar()`).
 */
export const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Remitente de todos los correos.
 *
 * Mientras no haya un dominio propio verificado en Resend, la cuenta sólo
 * puede enviar al correo con el que se registró, y el remitente tiene que ser
 * el de pruebas. Al verificar el dominio se cambia por
 * `ECO-SIGN <noreply@eco-sign.com>` (ver README-EMAIL.md) y desaparece esa
 * restricción de destinatario.
 */
export const REMITENTE = "ECO-SIGN <onboarding@resend.dev>";
