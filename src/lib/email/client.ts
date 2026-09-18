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
 * `reutilizando.online` está verificado en Resend, así que se puede enviar a
 * cualquier destinatario: ya no aplica la restricción del remitente de pruebas
 * (`onboarding@resend.dev`), que sólo permitía escribir al correo con el que se
 * registró la cuenta.
 *
 * Esta constante la usan las tres funciones de envío, así que cambiar de
 * dominio es cambiar sólo esta línea (ver README-EMAIL.md).
 */
export const REMITENTE = "ECO-SIGN <noreply@reutilizando.online>";
