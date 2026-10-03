"use server";

import { createClient as crearClienteSinSesion } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { texto } from "@/lib/form-data";
import type { EstadoForm } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";

const ERROR_SESION = "Tu sesión expiró. Vuelve a entrar.";
const ERROR_GENERICO = "No pudimos guardar el cambio. Intenta de nuevo.";

function primerError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisa los datos.";
}

/**
 * Cambia el nombre de quien está conectado. Cualquier rol puede: la política
 * profiles_update_self sólo deja tocar la propia fila, y el GRANT por columna
 * sólo deja cambiar nombre (no rol, correo ni taller).
 */
export async function actualizarMiNombre(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const validacion = z
    .string()
    .trim()
    .min(2, { error: "Escribe tu nombre (mínimo 2 caracteres)." })
    .max(100, { error: "El nombre es demasiado largo (máximo 100 caracteres)." })
    .safeParse(texto(formData, "nombre"));
  if (!validacion.success) return { error: primerError(validacion.error), ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: ERROR_SESION, ok: false };

  const { data, error } = await supabase
    .from("profiles")
    .update({ nombre: validacion.data })
    .eq("id", user.id)
    .select("id");

  if (error || !data?.length) {
    console.error("[perfil] No se pudo cambiar el nombre", error);
    return { error: ERROR_GENERICO, ok: false };
  }

  // El nombre sale en la cabecera de todas las páginas.
  revalidatePath("/", "layout");
  return { error: null, ok: true, marca: Date.now() };
}

const esquemaClave = z
  .object({
    actual: z.string().min(1, { error: "Escribe tu contraseña actual." }),
    nueva: z
      .string()
      .min(10, { error: "La nueva contraseña debe tener al menos 10 caracteres." })
      .max(72, { error: "La nueva contraseña es demasiado larga (máximo 72 caracteres)." }),
    confirmacion: z.string(),
  })
  .refine((d) => d.nueva === d.confirmacion, { error: "Las contraseñas nuevas no coinciden." })
  .refine((d) => d.nueva !== d.actual, {
    error: "La nueva contraseña debe ser distinta de la actual.",
  });

/**
 * Cambia la contraseña estando dentro. Pide la actual: si alguien encuentra la
 * sesión abierta en un computador del taller, no puede cambiarla y dejar fuera
 * al dueño de la cuenta. Al terminar se cierran las demás sesiones.
 */
export async function cambiarMiClave(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const validacion = esquemaClave.safeParse({
    actual: formData.get("actual") ?? "",
    nueva: formData.get("nueva") ?? "",
    confirmacion: formData.get("confirmacion") ?? "",
  });
  if (!validacion.success) return { error: primerError(validacion.error), ok: false };
  const { actual, nueva } = validacion.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: ERROR_SESION, ok: false };

  // La contraseña actual se comprueba con un cliente aparte, sin cookies, para
  // no tocar la sesión de este navegador.
  const verificador = crearClienteSinSesion(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: errorActual } = await verificador.auth.signInWithPassword({
    email: user.email,
    password: actual,
  });
  if (errorActual) {
    const m = errorActual.message.toLowerCase();
    if (m.includes("rate limit") || m.includes("too many")) {
      return { error: "Demasiados intentos. Espera un momento e inténtalo de nuevo.", ok: false };
    }
    return { error: "La contraseña actual no es correcta.", ok: false };
  }

  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) {
    console.error("[perfil] No se pudo cambiar la contraseña", error.message);
    return { error: ERROR_GENERICO, ok: false };
  }

  // Cierra todas las demás sesiones (incluida la que abrió la comprobación de
  // arriba); la de este navegador sigue abierta.
  await supabase.auth.signOut({ scope: "others" });

  return { error: null, ok: true, marca: Date.now() };
}

/** Cierra la sesión en los demás navegadores y celulares; ésta sigue abierta. */
export async function cerrarOtrasSesiones(): Promise<EstadoForm> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) {
    console.error("[perfil] No se pudieron cerrar las otras sesiones", error.message);
    return { error: ERROR_GENERICO, ok: false };
  }
  return { error: null, ok: true, marca: Date.now() };
}
