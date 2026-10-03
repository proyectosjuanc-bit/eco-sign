import "server-only";

import { redirect } from "next/navigation";

import { crearClienteAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Comprobaciones del panel de superadmin (/admin).
 *
 * El panel lee datos de TODOS los talleres con la clave de servicio, así que
 * antes de devolver ese cliente se exige, en el servidor y en cada página:
 *   1. sesión iniciada,
 *   2. ser superadmin (tabla superadmins, vía es_superadmin()),
 *   3. verificación en dos pasos hecha en esta sesión (nivel aal2).
 */

export interface ContextoSuperadmin {
  userId: string;
  email: string;
  /** Cliente con la clave de servicio: se salta el RLS. Sólo servidor. */
  admin: NonNullable<ReturnType<typeof crearClienteAdmin>>;
}

/** Sesión + superadmin, sin exigir todavía el segundo paso (para /admin/verificacion). */
export async function exigirSuperadminSinMfa() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin");

  const { data: esSuperadmin } = await supabase.rpc("es_superadmin");
  if (!esSuperadmin) redirect("/dashboard");

  return { supabase, user };
}

/**
 * Todo lo necesario para una página o acción del panel. Si falta el segundo
 * paso, lleva a /admin/verificacion (configurarlo o ingresar el código).
 */
export async function exigirSuperadmin(): Promise<ContextoSuperadmin> {
  const { supabase, user } = await exigirSuperadminSinMfa();

  const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (nivel?.currentLevel !== "aal2") redirect("/admin/verificacion");

  const admin = crearClienteAdmin();
  if (!admin) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY para el panel de superadmin.");

  return { userId: user.id, email: user.email ?? "", admin };
}

/** Deja constancia de una acción de superadmin. Un fallo aquí se registra, no rompe. */
export async function registrarAccion(
  ctx: ContextoSuperadmin,
  accion: string,
  detalle: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await ctx.admin.from("superadmin_log").insert({
    actor: ctx.userId,
    actor_email: ctx.email,
    accion,
    detalle,
  });
  if (error) console.error("[superadmin] No se pudo registrar la acción", accion, error);
}
