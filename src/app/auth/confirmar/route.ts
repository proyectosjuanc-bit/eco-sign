import type { EmailOtpType, User } from "@supabase/supabase-js";
import { after, NextResponse, type NextRequest } from "next/server";

import { sendWelcomeEmail } from "@/lib/email/send";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino del enlace del correo de confirmación de cuenta.
 *
 * Valida el enlace, deja la sesión iniciada (cookies) y entra directo al
 * panel: quien acaba de confirmar no debería tener que volver a escribir su
 * contraseña. Recién aquí se envía el correo de bienvenida; antes salía al
 * registrarse, llegaba junto al de confirmación y su botón "Entrar al panel"
 * llevaba a un login que todavía no dejaba entrar.
 *
 * Acepta las dos formas de enlace que puede mandar Supabase:
 * - `?token_hash=…&type=signup`: la de la plantilla de correo personalizada
 *   (ver supabase/ESQUEMA.md). Funciona aunque el correo se abra en otro
 *   navegador o en el celular.
 * - `?code=…`: la de la plantilla por defecto (flujo PKCE). Sólo puede
 *   iniciar sesión en el mismo navegador donde se hizo el registro; en otro,
 *   el correo igual queda confirmado por Supabase antes de llegar aquí, y se
 *   manda al login para entrar con la contraseña.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  const codigo = searchParams.get("code");

  const supabase = await createClient();
  let usuario: User | null = null;

  if (tokenHash && tipo) {
    const { data, error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (!error) usuario = data.user;
  } else if (codigo) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) usuario = data.user;
  }

  if (!usuario) {
    return NextResponse.redirect(new URL("/login?confirmacion=fallida", origin));
  }

  // Sólo al confirmar un registro (no en otros enlaces, como un cambio de
  // correo). Un enlace sirve una sola vez, así que no se repite.
  const esRegistro = tipo === "signup" || tipo === "email" || (!tipo && codigo);
  const { nombre, empresa } = usuario.user_metadata as { nombre?: string; empresa?: string };
  if (esRegistro && usuario.email && nombre && empresa) {
    const email = usuario.email;
    // after(): el correo no retrasa la entrada al panel. Si falla,
    // sendWelcomeEmail lo registra sin lanzar.
    after(() => sendWelcomeEmail(email, nombre, empresa));
  }

  return NextResponse.redirect(new URL("/dashboard", origin));
}
