"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import {
  esquemaId,
  validarMaquina,
  validarSolicitud,
  sanitizarTextoLibre,
} from "@/lib/capacidad/esquemas";
import { sendRespuestaSolicitud, sendSolicitudMaquina } from "@/lib/email/send";
import { texto } from "@/lib/form-data";
import type { EstadoForm } from "@/lib/form-state";
import { formatearFecha } from "@/lib/format";
import { despacharPush } from "@/lib/notificaciones/push";
import { createClient } from "@/lib/supabase/server";
import { subirFoto } from "@/lib/supabase/subir-foto";
import { ERROR_SIN_TENANT } from "@/lib/supabase/tenant";
import type { EstadoPublicacion } from "@/types/database";

/** Solicitudes de máquina que un taller puede enviar en 24 horas. */
const MAX_SOLICITUDES_DIARIAS = 5;

/** Tope de fotos por máquina: suficientes para mostrarla, pocas para no llenar el bucket. */
const MAX_FOTOS = 4;

/**
 * Cliente, usuario y tenant de quien llama, en una sola consulta al perfil.
 * Las acciones de Capacidad necesitan además el correo del usuario (para que
 * el dueño de una máquina pueda responderle), por eso no basta con
 * `obtenerTenantId()`.
 */
async function sesion() {
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
  if (!perfil?.tenant_id) return null;

  return { supabase, email: user.email, tenantId: perfil.tenant_id };
}

/** Todas las páginas de Capacidad cuelgan de /capacidad, más el perfil de taller. */
function revalidarCapacidad(tenantId?: string) {
  revalidatePath("/capacidad", "layout");
  if (tenantId) revalidatePath(`/taller/${tenantId}`);
}

// ---------------------------------------------------------------------------
// Mis máquinas
// ---------------------------------------------------------------------------

/**
 * Crea o edita una máquina (con `id` es edición).
 *
 * El formulario tiene dos botones de envío: "Guardar borrador" y "Publicar"
 * (campo `intencion`). Al editar, "Guardar cambios" conserva el estado de
 * publicación que ya tenía: corregir el precio de una máquina publicada no
 * debería despublicarla.
 */
export async function guardarMaquina(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const ctx = await sesion();
  if (!ctx) return { error: ERROR_SIN_TENANT, ok: false };
  const { supabase, tenantId } = ctx;

  const validacion = validarMaquina(formData);
  if (validacion.error !== null) return { error: validacion.error, ok: false };
  const datos = validacion.datos;

  const id = texto(formData, "id");
  const publicar = texto(formData, "intencion") === "publicar";

  // Al editar se parte de la fila actual, filtrando también por tenant: RLS
  // deja LEER máquinas publicadas de otros, así que sin este filtro el
  // formulario podría cargar una ajena (aunque luego el update fallaría).
  let fotosActuales: string[] = [];
  let estadoActual: EstadoPublicacion = "borrador";
  if (id) {
    if (!esquemaId.safeParse(id).success) return { error: "Máquina no válida.", ok: false };
    const { data: actual } = await supabase
      .from("machines")
      .select("fotos, estado_publicacion")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!actual) return { error: "No encontramos esa máquina.", ok: false };
    fotosActuales = actual.fotos;
    estadoActual = actual.estado_publicacion;
  }

  // Sólo se pueden quitar fotos que de verdad son de esta máquina.
  const quitar = new Set(
    formData
      .getAll("quitar_foto")
      .filter((v): v is string => typeof v === "string" && fotosActuales.includes(v)),
  );
  const fotosQueQuedan = fotosActuales.filter((ruta) => !quitar.has(ruta));

  const archivo = formData.get("foto");
  const hayFotoNueva = archivo instanceof File && archivo.size > 0;
  if (hayFotoNueva && fotosQueQuedan.length >= MAX_FOTOS) {
    return { error: `Una máquina puede tener hasta ${MAX_FOTOS} fotos. Quita una antes de subir otra.`, ok: false };
  }

  const foto = await subirFoto(supabase, archivo, tenantId, "", "maquinas");
  if (foto.error) return { error: foto.error, ok: false };
  const fotos = foto.ruta ? [...fotosQueQuedan, foto.ruta] : fotosQueQuedan;

  const estado_publicacion: EstadoPublicacion = publicar
    ? "publicada"
    : id
      ? estadoActual
      : "borrador";

  const fila = { ...datos, fotos, estado_publicacion };

  const { error } = id
    ? await supabase.from("machines").update(fila).eq("id", id).eq("tenant_id", tenantId)
    : await supabase.from("machines").insert({ ...fila, tenant_id: tenantId });

  if (error) {
    // No dejar en el bucket una foto que ninguna fila referencia.
    if (foto.ruta) await supabase.storage.from("maquinas").remove([foto.ruta]);
    return { error: `No se pudo guardar la máquina: ${error.message}`, ok: false };
  }

  // Las fotos quitadas se borran después de guardar: si el update fallara,
  // la máquina seguiría apuntando a ellas.
  if (quitar.size) await supabase.storage.from("maquinas").remove([...quitar]);

  revalidarCapacidad(tenantId);
  redirect(publicar ? "/capacidad?filtro=publicada" : "/capacidad");
}

/** Publicar, pausar o devolver a borrador desde la lista de mis máquinas. */
export async function cambiarPublicacion(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  const estado = texto(formData, "estado");
  if (!esquemaId.safeParse(id).success) return;
  if (estado !== "publicada" && estado !== "pausada" && estado !== "borrador") return;

  const ctx = await sesion();
  if (!ctx) return;

  await ctx.supabase
    .from("machines")
    .update({ estado_publicacion: estado })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);

  revalidarCapacidad(ctx.tenantId);
}

export async function eliminarMaquina(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  if (!esquemaId.safeParse(id).success) return;

  const ctx = await sesion();
  if (!ctx) return;

  const { data: borradas } = await ctx.supabase
    .from("machines")
    .delete()
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select("fotos");

  // Igual que con los sobrantes: las fotos se borran sólo si la fila se borró.
  const fotos = borradas?.[0]?.fotos ?? [];
  if (fotos.length) await ctx.supabase.storage.from("maquinas").remove(fotos);

  revalidarCapacidad(ctx.tenantId);
}

// ---------------------------------------------------------------------------
// Solicitudes
// ---------------------------------------------------------------------------

/**
 * Pide disponibilidad de una máquina de otro taller y avisa al dueño.
 *
 * Que la máquina esté publicada, que no sea propia y que el propietario sea
 * el dueño real lo comprueba la política RLS del INSERT; aquí se repite para
 * poder dar un mensaje claro en vez del error genérico de Postgres.
 */
export async function solicitarMaquina(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const ctx = await sesion();
  if (!ctx) return { error: ERROR_SIN_TENANT, ok: false };
  const { supabase, tenantId, email } = ctx;

  const validacion = validarSolicitud(formData);
  if (validacion.error !== null) return { error: validacion.error, ok: false };
  const datos = validacion.datos;

  const { data: maquina } = await supabase
    .from("machines")
    .select("id, nombre, tenant_id, estado_publicacion")
    .eq("id", datos.machine_id)
    .maybeSingle();

  if (!maquina || maquina.estado_publicacion !== "publicada") {
    return { error: "Esta máquina ya no está publicada.", ok: false };
  }
  if (maquina.tenant_id === tenantId) {
    return { error: "No puedes pedir una máquina de tu propio taller.", ok: false };
  }

  // Tope diario por taller: cada solicitud envía un correo a otro taller, y sin
  // límite una cuenta podría usarlo para llenarle la bandeja a alguien.
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: enviadasHoy, error: errorConteo } = await supabase
    .from("machine_requests")
    .select("id", { count: "exact", head: true })
    .eq("tenant_solicitante", tenantId)
    .gte("created_at", desde);

  if (errorConteo) {
    return { error: "No pudimos verificar tus solicitudes. Intenta de nuevo.", ok: false };
  }
  if ((enviadasHoy ?? 0) >= MAX_SOLICITUDES_DIARIAS) {
    return {
      error: "Has alcanzado el límite diario de solicitudes. Intenta mañana.",
      ok: false,
    };
  }

  const { data: solicitud, error } = await supabase
    .from("machine_requests")
    .insert({
      machine_id: maquina.id,
      tenant_solicitante: tenantId,
      tenant_propietario: maquina.tenant_id,
      mensaje: datos.mensaje,
      fecha_deseada: datos.fecha_deseada,
      duracion_estimada: datos.duracion_estimada,
    })
    .select("id")
    .single();

  if (error || !solicitud) {
    // 23505: el índice único de "una pendiente por taller y máquina".
    if (error?.code === "23505") {
      return { error: "Ya tienes una solicitud pendiente para esta máquina.", ok: false };
    }
    return { error: `No se pudo enviar la solicitud: ${error?.message ?? "error desconocido"}`, ok: false };
  }

  // La base ya creó el aviso de la campanita del dueño (trigger); esto lo
  // manda además a su celular y su PC, después de responder.
  after(despacharPush);

  // El correo nunca rompe el flujo: si falla, la solicitud ya quedó guardada
  // y el dueño la verá en "Solicitudes recibidas".
  const [{ data: propietarios }, { data: miTaller }] = await Promise.all([
    supabase.rpc("contraparte_solicitud", { p_request_id: solicitud.id }),
    supabase.from("tenants").select("nombre").eq("id", tenantId).maybeSingle(),
  ]);

  if (propietarios?.length) {
    await sendSolicitudMaquina(
      propietarios.map((d) => d.email),
      email,
      {
        nombrePropietario: saludo(propietarios),
        nombreSolicitante: miTaller?.nombre ?? "Un taller de la red",
        nombreMaquina: maquina.nombre,
        fechaDeseada: formatearFecha(datos.fecha_deseada),
        duracion: datos.duracion_estimada,
        mensaje: datos.mensaje,
      },
    );
  }

  revalidarCapacidad();
  return { error: null, ok: true, marca: Date.now() };
}

/**
 * A quién se saluda en el correo: la persona, si el taller tiene un solo
 * administrador con nombre; si no, el taller.
 */
function saludo(contactos: { nombre: string | null; empresa: string }[]): string {
  if (contactos.length === 1 && contactos[0].nombre) return contactos[0].nombre;
  return contactos[0].empresa;
}

/**
 * El dueño acepta, rechaza o marca como completada una solicitud recibida.
 *
 * El estado anterior va en la condición del propio update (como al vender un
 * sobrante): si el solicitante canceló un instante antes, el update no toca
 * ninguna fila y no se envía un "aceptada" sobre algo ya cancelado. El
 * trigger de la base vuelve a validar la transición por su cuenta.
 */
export async function responderSolicitud(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  const decision = texto(formData, "decision");
  if (!esquemaId.safeParse(id).success) return;
  if (decision !== "aceptada" && decision !== "rechazada" && decision !== "completada") return;

  const ctx = await sesion();
  if (!ctx) return;
  const { supabase, tenantId } = ctx;

  const { data: actualizadas } = await supabase
    .from("machine_requests")
    .update({ estado: decision })
    .eq("id", id)
    .eq("tenant_propietario", tenantId)
    .eq("estado", decision === "completada" ? "aceptada" : "pendiente")
    .select("machine_id");

  const fila = actualizadas?.[0];
  if (!fila) return;
  after(despacharPush);

  if (decision !== "completada") {
    const [{ data: solicitantes }, { data: maquina }, { data: miTaller }] = await Promise.all([
      supabase.rpc("contraparte_solicitud", { p_request_id: id }),
      supabase
        .from("machines")
        .select("nombre, contacto_telefono")
        .eq("id", fila.machine_id)
        .maybeSingle(),
      supabase.from("tenants").select("nombre").eq("id", tenantId).maybeSingle(),
    ]);

    if (solicitantes?.length && maquina) {
      await sendRespuestaSolicitud(
        solicitantes.map((s) => s.email),
        {
          nombreSolicitante: saludo(solicitantes),
          nombrePropietario: miTaller?.nombre ?? "El taller",
          nombreMaquina: maquina.nombre,
          estado: decision,
          telefono: maquina.contacto_telefono,
        },
      );
    }
  }

  revalidarCapacidad();
}

/** El solicitante retira una solicitud que todavía no le han contestado. */
export async function cancelarSolicitud(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  if (!esquemaId.safeParse(id).success) return;

  const ctx = await sesion();
  if (!ctx) return;

  await ctx.supabase
    .from("machine_requests")
    .update({ estado: "cancelada" })
    .eq("id", id)
    .eq("tenant_solicitante", ctx.tenantId)
    .eq("estado", "pendiente");
  after(despacharPush);

  revalidarCapacidad();
}

// ---------------------------------------------------------------------------
// Reputación
// ---------------------------------------------------------------------------

/**
 * El taller que pidió una máquina califica al dueño, una sola vez y sólo
 * cuando la solicitud quedó COMPLETADA. La base lo vuelve a exigir (RLS) y
 * recalcula sola la reputación de la máquina (trigger).
 */
export async function calificarSolicitud(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const ctx = await sesion();
  if (!ctx) return { error: ERROR_SIN_TENANT, ok: false };
  const { supabase, tenantId } = ctx;

  const id = texto(formData, "id");
  if (!esquemaId.safeParse(id).success) return { error: "Solicitud no válida.", ok: false };

  const estrellas = Number(texto(formData, "estrellas"));
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
    return { error: "Elige de 1 a 5 estrellas.", ok: false };
  }
  const comentario = sanitizarTextoLibre(texto(formData, "comentario"));
  if (comentario.length > 500) {
    return { error: "El comentario es demasiado largo (máximo 500 caracteres).", ok: false };
  }

  const { data: solicitud } = await supabase
    .from("machine_requests")
    .select("id, estado, machine_id, tenant_solicitante, tenant_propietario")
    .eq("id", id)
    .maybeSingle();
  if (!solicitud || solicitud.tenant_solicitante !== tenantId) {
    return { error: "Sólo puede calificar el taller que pidió la máquina.", ok: false };
  }
  if (solicitud.estado !== "completada") {
    return {
      error: "Podrás calificar cuando el taller marque la solicitud como completada.",
      ok: false,
    };
  }

  const { error } = await supabase.from("machine_reviews").insert({
    request_id: solicitud.id,
    machine_id: solicitud.machine_id,
    tenant_autor: tenantId,
    tenant_calificado: solicitud.tenant_propietario,
    estrellas,
    comentario: comentario || null,
  });

  if (error) {
    if (error.code === "23505") return { error: "Ya calificaste esta solicitud.", ok: false };
    console.error("[capacidad] No se pudo guardar la calificación", error);
    return {
      error:
        error.code === "42501" || /row-level security/i.test(error.message)
          ? "Tu rol no permite calificar. Pide a un administrador u operario que lo haga."
          : "No pudimos guardar la calificación. Intenta de nuevo.",
      ok: false,
    };
  }

  after(despacharPush);
  revalidarCapacidad(solicitud.tenant_propietario);
  return { error: null, ok: true, marca: Date.now() };
}
