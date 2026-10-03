"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { EstadoForm } from "@/lib/form-state";
import { exigirSuperadmin, registrarAccion } from "@/lib/superadmin";

export interface ResultadoAdmin {
  ok: boolean;
  mensaje: string;
}

const esquemaId = z.uuid();

/**
 * Suspende o reactiva un taller. Suspendido, sus usuarios dejan de ver y
 * escribir datos (current_tenant_id() devuelve NULL) y ven un aviso; nada se
 * borra, y al reactivarlo todo vuelve como estaba.
 */
export async function cambiarEstadoTaller(
  tenantId: string,
  estado: "activo" | "suspendido",
): Promise<ResultadoAdmin> {
  const ctx = await exigirSuperadmin();
  if (!esquemaId.safeParse(tenantId).success || (estado !== "activo" && estado !== "suspendido")) {
    return { ok: false, mensaje: "Datos no válidos." };
  }

  const { data, error } = await ctx.admin
    .from("tenants")
    .update({ estado, suspendido_en: estado === "suspendido" ? new Date().toISOString() : null })
    .eq("id", tenantId)
    .select("nombre");
  if (error || !data?.length) {
    console.error("[superadmin] No se pudo cambiar el estado del taller", error);
    return { ok: false, mensaje: "No pudimos cambiar el estado del taller." };
  }

  await registrarAccion(ctx, estado === "suspendido" ? "suspender_taller" : "reactivar_taller", {
    tenant_id: tenantId,
    taller: data[0].nombre,
  });
  revalidatePath("/admin", "layout");
  return {
    ok: true,
    mensaje: estado === "suspendido" ? "Taller suspendido." : "Taller reactivado.",
  };
}

/** Agrega un superadmin por correo. La cuenta ya debe existir y estar confirmada. */
export async function agregarSuperadmin(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const ctx = await exigirSuperadmin();

  const correo = z
    .email({ error: "Escribe un correo válido." })
    .safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!correo.success) return { error: correo.error.issues[0]?.message ?? "Correo no válido.", ok: false };

  const { data: perfil } = await ctx.admin
    .from("profiles")
    .select("id, email")
    .eq("email", correo.data)
    .maybeSingle();
  if (!perfil) {
    return {
      error: "No hay ninguna cuenta de ECO-SIGN con ese correo. Primero debe registrarse.",
      ok: false,
    };
  }

  const { data: usuario } = await ctx.admin.auth.admin.getUserById(perfil.id);
  if (!usuario?.user?.email_confirmed_at) {
    return { error: "Esa cuenta todavía no ha confirmado su correo.", ok: false };
  }

  const { error } = await ctx.admin
    .from("superadmins")
    .insert({ user_id: perfil.id, agregado_por: ctx.userId });
  if (error) {
    if (error.code === "23505") return { error: "Esa cuenta ya es superadmin.", ok: false };
    console.error("[superadmin] No se pudo agregar", error);
    return { error: "No pudimos agregar el superadmin.", ok: false };
  }

  await registrarAccion(ctx, "agregar_superadmin", { email: perfil.email, user_id: perfil.id });
  revalidatePath("/admin/superadmins");
  return { error: null, ok: true, marca: Date.now() };
}

/**
 * Quita a un superadmin. Nadie se quita a sí mismo (lo hace otro superadmin) y
 * nunca se queda la plataforma sin ninguno.
 */
export async function quitarSuperadmin(userId: string): Promise<ResultadoAdmin> {
  const ctx = await exigirSuperadmin();
  if (!esquemaId.safeParse(userId).success) return { ok: false, mensaje: "Datos no válidos." };
  if (userId === ctx.userId) {
    return { ok: false, mensaje: "No puedes quitarte a ti mismo; pídeselo a otro superadmin." };
  }

  const { count } = await ctx.admin.from("superadmins").select("user_id", { count: "exact", head: true });
  if ((count ?? 0) <= 1) return { ok: false, mensaje: "Debe quedar al menos un superadmin." };

  const { data, error } = await ctx.admin.from("superadmins").delete().eq("user_id", userId).select("user_id");
  if (error || !data?.length) {
    console.error("[superadmin] No se pudo quitar", error);
    return { ok: false, mensaje: "No pudimos quitar el superadmin." };
  }

  const { data: usuario } = await ctx.admin.auth.admin.getUserById(userId);
  await registrarAccion(ctx, "quitar_superadmin", { user_id: userId, email: usuario?.user?.email });
  revalidatePath("/admin/superadmins");
  return { ok: true, mensaje: "Superadmin quitado." };
}
