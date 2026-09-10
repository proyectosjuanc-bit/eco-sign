import { createClient } from "./server";

/**
 * Devuelve el tenant del usuario autenticado, o null si no hay sesión o perfil.
 *
 * Las tablas no tienen un default de columna para `tenant_id`, así que las
 * políticas RLS rechazan cualquier insert que no lo traiga: comprobado contra
 * la base, un insert sin él falla con "new row violates row-level security
 * policy". Por eso toda escritura pasa por aquí primero.
 */
export async function obtenerTenantId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  return perfil?.tenant_id ?? null;
}

/** Mensaje único para cuando no se puede resolver el tenant. */
export const ERROR_SIN_TENANT =
  "No pudimos identificar tu empresa. Vuelve a iniciar sesión.";
