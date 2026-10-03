"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sendInvitacionEmpleado } from "@/lib/email/send";
import { texto } from "@/lib/form-data";
import type { EstadoForm } from "@/lib/form-state";
import { DIAS_VIGENCIA_INVITACION, ROLES } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/types/database";

/** Resultado de las acciones de equipo que se llaman directamente desde un botón. */
export interface ResultadoEquipo {
  ok: boolean;
  error?: string;
  /** Éxito con una salvedad (por ejemplo, la invitación se creó pero el correo no salió). */
  aviso?: string;
}

const ERROR_NO_ADMIN = "Solo un administrador puede gestionar el equipo.";
const ERROR_GENERICO = "No pudimos completar la acción. Intenta de nuevo.";

// ---------------------------------------------------------------------------
// Validación (zod)
// ---------------------------------------------------------------------------

const esquemaId = z.uuid({ error: "Identificador no válido." });

const esquemaRol = z.enum(ROLES as [Rol, ...Rol[]], {
  error: "Elige un rol válido.",
});

const esquemaInvitacion = z.object({
  // En minúsculas: el trigger handle_new_user compara el correo sin distinguir
  // mayúsculas, y así se evitan invitaciones duplicadas por escribirlo distinto.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, { error: "El correo es demasiado largo." })
    .pipe(z.email({ error: "Escribe un correo válido." })),
  rol: esquemaRol,
  nombreInvitado: z
    .string()
    .trim()
    .max(80, { error: "El nombre es demasiado largo (máximo 80 caracteres)." })
    .optional(),
});

function primerError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisa los datos.";
}

// ---------------------------------------------------------------------------
// Contexto de quien llama
// ---------------------------------------------------------------------------

/**
 * Cliente, usuario y taller de quien llama, SOLO si es un admin activo.
 *
 * La comprobación la hace la propia base con es_admin() (rol admin y activo),
 * la misma función que usan las políticas RLS; así la regla no se puede
 * desalinear entre la aplicación y la base. Devuelve null si no es admin.
 */
async function contextoAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (!esAdmin) return null;

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id, nombre, email")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.tenant_id) return null;

  return {
    supabase,
    userId: user.id,
    tenantId: perfil.tenant_id,
    nombre: perfil.nombre ?? perfil.email,
  };
}

/** Los comodines de ilike (% _ \) en un correo no deben comportarse como comodines. */
function escaparIlike(valor: string): string {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function vencimientoDesdeAhora(): string {
  return new Date(Date.now() + DIAS_VIGENCIA_INVITACION * 24 * 60 * 60 * 1000).toISOString();
}

function revalidarEquipo() {
  revalidatePath("/configuracion/equipo");
}

// ---------------------------------------------------------------------------
// Invitaciones
// ---------------------------------------------------------------------------

/**
 * Invita a una persona al taller por correo.
 *
 * Si el correo no sale, la invitación se queda creada (el admin puede
 * reenviarla desde la lista) y se devuelve un aviso en vez de un error.
 */
export async function invitarEmpleado(input: {
  email: string;
  rol: Rol;
  nombreInvitado?: string;
}): Promise<ResultadoEquipo> {
  const ctx = await contextoAdmin();
  if (!ctx) return { ok: false, error: ERROR_NO_ADMIN };

  const validacion = esquemaInvitacion.safeParse(input);
  if (!validacion.success) return { ok: false, error: primerError(validacion.error) };
  const { email, rol, nombreInvitado } = validacion.data;
  const { supabase, tenantId, userId } = ctx;

  // 1. ¿Ya es parte del taller?
  const { data: yaMiembro, error: errorMiembro } = await supabase
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("email", escaparIlike(email))
    .limit(1);
  if (errorMiembro) {
    console.error("[equipo] No se pudo buscar el miembro", errorMiembro);
    return { ok: false, error: ERROR_GENERICO };
  }
  if (yaMiembro?.length) return { ok: false, error: "Ya hay un usuario con ese correo en tu taller." };

  // 2. ¿Ya hay una invitación vigente para ese correo?
  const { data: pendiente, error: errorPendiente } = await supabase
    .from("invitaciones")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("aceptada", false)
    .gt("expira_en", new Date().toISOString())
    .ilike("email", escaparIlike(email))
    .limit(1);
  if (errorPendiente) {
    console.error("[equipo] No se pudo buscar la invitación", errorPendiente);
    return { ok: false, error: ERROR_GENERICO };
  }
  if (pendiente?.length) return { ok: false, error: "Ya hay una invitación pendiente para ese correo." };

  // 3. Se crea. El token es un UUID aleatorio (122 bits): no se puede adivinar.
  const token = crypto.randomUUID();
  const { error: errorInsert } = await supabase.from("invitaciones").insert({
    tenant_id: tenantId,
    email,
    rol,
    token,
    invitado_por: userId,
    expira_en: vencimientoDesdeAhora(),
  });
  if (errorInsert) {
    console.error("[equipo] No se pudo crear la invitación", errorInsert);
    return { ok: false, error: "No pudimos crear la invitación. Intenta de nuevo." };
  }

  // 4. Correo. Un fallo aquí no revierte la invitación.
  const { data: taller } = await supabase
    .from("tenants")
    .select("nombre")
    .eq("id", tenantId)
    .maybeSingle();

  const envio = await sendInvitacionEmpleado(
    email,
    nombreInvitado ?? "",
    taller?.nombre ?? "tu taller",
    ctx.nombre,
    rol,
    token,
  );

  revalidarEquipo();
  if (!envio.ok) {
    console.error("[equipo] La invitación quedó creada pero el correo falló:", envio.error);
    return {
      ok: true,
      aviso: "La invitación se creó, pero no pudimos enviar el correo. Usa «Reenviar» en la lista de invitaciones.",
    };
  }
  return { ok: true };
}

/**
 * Versión de `invitarEmpleado` para `useActionState` (recibe un FormData).
 * El modal de invitación usa ésta.
 */
export async function invitarEmpleadoFormulario(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const resultado = await invitarEmpleado({
    email: texto(formData, "email"),
    rol: texto(formData, "rol") as Rol,
    nombreInvitado: texto(formData, "nombre_invitado"),
  });

  if (!resultado.ok) return { error: resultado.error ?? ERROR_GENERICO, ok: false };
  return { error: null, ok: true, marca: Date.now(), aviso: resultado.aviso };
}

/** Retira una invitación que todavía no se ha aceptado. */
export async function cancelarInvitacion(id: string): Promise<ResultadoEquipo> {
  const ctx = await contextoAdmin();
  if (!ctx) return { ok: false, error: ERROR_NO_ADMIN };

  const validacion = esquemaId.safeParse(id);
  if (!validacion.success) return { ok: false, error: primerError(validacion.error) };

  const { data, error } = await ctx.supabase
    .from("invitaciones")
    .delete()
    .eq("id", validacion.data)
    .eq("tenant_id", ctx.tenantId)
    .eq("aceptada", false)
    .select("id");

  if (error) {
    console.error("[equipo] No se pudo cancelar la invitación", error);
    return { ok: false, error: ERROR_GENERICO };
  }
  if (!data?.length) return { ok: false, error: "Esa invitación ya no existe o ya fue aceptada." };

  revalidarEquipo();
  return { ok: true };
}

/** Vuelve a enviar el correo y extiende la vigencia 7 días desde hoy. */
export async function reenviarInvitacion(id: string): Promise<ResultadoEquipo> {
  const ctx = await contextoAdmin();
  if (!ctx) return { ok: false, error: ERROR_NO_ADMIN };

  const validacion = esquemaId.safeParse(id);
  if (!validacion.success) return { ok: false, error: primerError(validacion.error) };
  const { supabase, tenantId } = ctx;

  const { data: invitacion } = await supabase
    .from("invitaciones")
    .select("id, email, rol, token")
    .eq("id", validacion.data)
    .eq("tenant_id", tenantId)
    .eq("aceptada", false)
    .maybeSingle();
  if (!invitacion) return { ok: false, error: "Esa invitación ya no existe o ya fue aceptada." };

  const { data: actualizadas, error: errorUpdate } = await supabase
    .from("invitaciones")
    .update({ expira_en: vencimientoDesdeAhora() })
    .eq("id", invitacion.id)
    .select("id");
  if (errorUpdate || !actualizadas?.length) {
    if (errorUpdate) console.error("[equipo] No se pudo extender la invitación", errorUpdate);
    return { ok: false, error: ERROR_GENERICO };
  }

  const { data: taller } = await supabase
    .from("tenants")
    .select("nombre")
    .eq("id", tenantId)
    .maybeSingle();

  // El nombre del invitado no se guarda en la tabla: el correo reenviado lleva
  // el saludo genérico.
  const envio = await sendInvitacionEmpleado(
    invitacion.email,
    "",
    taller?.nombre ?? "tu taller",
    ctx.nombre,
    invitacion.rol,
    invitacion.token,
  );
  if (!envio.ok) {
    console.error("[equipo] No se pudo reenviar el correo:", envio.error);
    return { ok: false, error: "No pudimos enviar el correo. Intenta de nuevo en un momento." };
  }

  revalidarEquipo();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Miembros
// ---------------------------------------------------------------------------

/**
 * Actualiza rol o estado de un miembro del MISMO taller. La base además lo
 * restringe por RLS y por permisos de columna (sólo rol y activo).
 */
async function actualizarMiembro(
  ctx: NonNullable<Awaited<ReturnType<typeof contextoAdmin>>>,
  profileId: string,
  cambios: { rol: Rol } | { activo: boolean },
): Promise<ResultadoEquipo> {
  const { data, error } = await ctx.supabase
    .from("profiles")
    .update(cambios)
    .eq("id", profileId)
    .eq("tenant_id", ctx.tenantId)
    .select("id");

  if (error) {
    console.error("[equipo] No se pudo actualizar al miembro", error);
    return { ok: false, error: ERROR_GENERICO };
  }
  if (!data?.length) return { ok: false, error: "No encontramos a ese usuario en tu taller." };

  revalidarEquipo();
  return { ok: true };
}

export async function cambiarRol(profileId: string, nuevoRol: Rol): Promise<ResultadoEquipo> {
  const ctx = await contextoAdmin();
  if (!ctx) return { ok: false, error: ERROR_NO_ADMIN };

  const id = esquemaId.safeParse(profileId);
  if (!id.success) return { ok: false, error: primerError(id.error) };
  const rol = esquemaRol.safeParse(nuevoRol);
  if (!rol.success) return { ok: false, error: primerError(rol.error) };

  // Evita que el último admin se degrade a sí mismo y deje el taller sin gestión.
  if (id.data === ctx.userId) return { ok: false, error: "No puedes cambiar tu propio rol." };

  return actualizarMiembro(ctx, id.data, { rol: rol.data });
}

export async function desactivarEmpleado(profileId: string): Promise<ResultadoEquipo> {
  const ctx = await contextoAdmin();
  if (!ctx) return { ok: false, error: ERROR_NO_ADMIN };

  const id = esquemaId.safeParse(profileId);
  if (!id.success) return { ok: false, error: primerError(id.error) };
  if (id.data === ctx.userId) return { ok: false, error: "No puedes desactivarte a ti mismo." };

  return actualizarMiembro(ctx, id.data, { activo: false });
}

export async function activarEmpleado(profileId: string): Promise<ResultadoEquipo> {
  const ctx = await contextoAdmin();
  if (!ctx) return { ok: false, error: ERROR_NO_ADMIN };

  const id = esquemaId.safeParse(profileId);
  if (!id.success) return { ok: false, error: primerError(id.error) };

  return actualizarMiembro(ctx, id.data, { activo: true });
}
