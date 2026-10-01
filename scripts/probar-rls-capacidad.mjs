/**
 * Prueba las reglas de seguridad (RLS, permisos por columna, triggers y
 * Storage) de la sección Capacidad contra la base real, con dos talleres.
 *
 *   node --env-file=.env.local scripts/probar-rls-capacidad.mjs
 *
 * Necesita la migración supabase/migrations/20260930_capacidad.sql aplicada.
 *
 * Crea dos usuarios de prueba con el cliente admin (service role), lo que
 * dispara handle_new_user y crea un taller para cada uno. Después entra como
 * cada usuario con la anon key —igual que la aplicación— e intenta tanto lo
 * permitido como lo prohibido. Al final borra todo lo que creó, también si
 * alguna prueba falla. No envía correos: prueba la base, no las Server Actions.
 */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables. Corre con: node --env-file=.env.local scripts/probar-rls-capacidad.mjs");
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const marca = Date.now();
const CLAVE = `Prueba-${marca}-xY9!`;

let fallos = 0;
function check(descripcion, condicion, detalle) {
  console.log(`${condicion ? "✔" : "✘"} ${descripcion}${!condicion && detalle ? `\n    → ${detalle}` : ""}`);
  if (!condicion) fallos++;
}

/** Crea un usuario confirmado, espera a que el trigger le cree el perfil y entra como él. */
async function crearTaller(letra) {
  const email = `capacidad-${letra.toLowerCase()}-${marca}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { empresa: `Taller prueba ${letra} ${marca}`, nombre: `Persona ${letra}` },
  });
  if (error) throw new Error(`No se pudo crear el usuario ${letra}: ${error.message}`);

  const { data: perfil } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("id", data.user.id)
    .single();
  if (!perfil?.tenant_id) throw new Error(`El usuario ${letra} no recibió tenant`);

  const cliente = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: errorLogin } = await cliente.auth.signInWithPassword({ email, password: CLAVE });
  if (errorLogin) throw new Error(`No se pudo entrar como ${letra}: ${errorLogin.message}`);

  return { letra, email, userId: data.user.id, tenantId: perfil.tenant_id, db: cliente };
}

function maquina(tenantId, extra = {}) {
  return {
    tenant_id: tenantId,
    nombre: "Láser de prueba RLS",
    tipo: "laser_corte",
    ciudad: "Medellín",
    precio: 50000,
    unidad_precio: "hora",
    contacto_telefono: "300 000 0000",
    disponibilidad_horaria: { lunes: ["08:00-12:00"] },
    ...extra,
  };
}

const creados = { usuarios: [], tenants: [], fotos: [] };

async function limpiar() {
  if (creados.fotos.length) await admin.storage.from("maquinas").remove(creados.fotos);
  for (const t of creados.tenants) {
    await admin.from("machine_requests").delete().or(`tenant_solicitante.eq.${t},tenant_propietario.eq.${t}`);
    await admin.from("machines").delete().eq("tenant_id", t);
  }
  for (const u of creados.usuarios) await admin.auth.admin.deleteUser(u);
  // Perfil y taller los creó el trigger; se borran por si el borrado del
  // usuario no los arrastra en cascada.
  for (const t of creados.tenants) {
    await admin.from("profiles").delete().eq("tenant_id", t);
    await admin.from("tenants").delete().eq("id", t);
  }
}

async function main() {
  const A = await crearTaller("A");
  creados.usuarios.push(A.userId);
  creados.tenants.push(A.tenantId);
  const B = await crearTaller("B");
  creados.usuarios.push(B.userId);
  creados.tenants.push(B.tenantId);
  console.log(`Taller A: ${A.tenantId}\nTaller B: ${B.tenantId}\n`);

  // --- machines -----------------------------------------------------------
  console.log("machines");

  const { data: mA, error: eA } = await A.db.from("machines").insert(maquina(A.tenantId)).select().single();
  check("A crea una máquina (nace en borrador)", !eA && mA?.estado_publicacion === "borrador", eA?.message);
  if (!mA) throw new Error("Sin máquina no se puede seguir");

  const { error: eAjeno } = await B.db.from("machines").insert(maquina(A.tenantId));
  check("B NO puede crear una máquina a nombre de A", Boolean(eAjeno));

  let { data: vistas } = await B.db.from("machines").select("id").eq("id", mA.id);
  check("B NO ve el borrador de A", vistas?.length === 0);

  const { error: eSolBorrador } = await B.db.from("machine_requests").insert({
    machine_id: mA.id, tenant_solicitante: B.tenantId, tenant_propietario: A.tenantId,
    mensaje: "Hola, la necesito", fecha_deseada: "2030-01-01", duracion_estimada: "2 horas",
  });
  check("B NO puede pedir una máquina en borrador", Boolean(eSolBorrador));

  const { error: eRating } = await A.db.from("machines").update({ rating_promedio: 5 }).eq("id", mA.id);
  check("A NO puede tocar su propio rating (permiso por columna)", Boolean(eRating), "el update de rating_promedio pasó");

  const { error: eCambioDueno } = await A.db.from("machines").update({ tenant_id: B.tenantId }).eq("id", mA.id);
  check("A NO puede cambiar el dueño de la máquina", Boolean(eCambioDueno));

  await A.db.from("machines").update({ estado_publicacion: "publicada" }).eq("id", mA.id);
  ({ data: vistas } = await B.db.from("machines").select("id").eq("id", mA.id));
  check("B SÍ ve la máquina de A una vez publicada", vistas?.length === 1);

  const { data: editadas } = await B.db.from("machines").update({ precio: 1 }).eq("id", mA.id).select("id");
  check("B NO puede editar la máquina publicada de A", !editadas?.length);

  const { data: borradas } = await B.db.from("machines").delete().eq("id", mA.id).select("id");
  check("B NO puede borrar la máquina de A", !borradas?.length);

  const { data: anon } = await createClient(URL, ANON, { auth: { persistSession: false } })
    .from("machines").select("id").eq("id", mA.id);
  check("Sin sesión no se ve ninguna máquina, ni publicada", !anon?.length);

  // --- machine_requests ---------------------------------------------------
  console.log("\nmachine_requests");

  const solicitud = {
    machine_id: mA.id, tenant_solicitante: B.tenantId, tenant_propietario: A.tenantId,
    mensaje: "Necesito cortar 10 piezas de acrílico", fecha_deseada: "2030-01-01", duracion_estimada: "2 horas",
  };

  const { error: eSuplantar } = await A.db.from("machine_requests").insert({ ...solicitud, tenant_solicitante: B.tenantId });
  check("A NO puede crear una solicitud haciéndose pasar por B", Boolean(eSuplantar));

  const { error: ePropietarioFalso } = await B.db.from("machine_requests").insert({ ...solicitud, tenant_propietario: B.tenantId });
  check("B NO puede poner un propietario que no es el dueño real", Boolean(ePropietarioFalso));

  const { error: eEstado } = await B.db.from("machine_requests").insert({ ...solicitud, estado: "aceptada" });
  check("B NO puede crear una solicitud ya aceptada", Boolean(eEstado));

  const { data: sol, error: eSol } = await B.db.from("machine_requests").insert(solicitud).select().single();
  check("B SÍ puede pedir la máquina publicada de A", !eSol && sol?.estado === "pendiente", eSol?.message);
  if (!sol) throw new Error("Sin solicitud no se puede seguir");

  const { error: eDuplicada } = await B.db.from("machine_requests").insert(solicitud);
  check("B NO puede dejar dos solicitudes pendientes de la misma máquina", eDuplicada?.code === "23505", eDuplicada?.message);

  const { data: vistaA } = await A.db.from("machine_requests").select("id").eq("id", sol.id);
  check("A (propietario) ve la solicitud", vistaA?.length === 1);

  const { error: eMensaje } = await B.db.from("machine_requests").update({ mensaje: "otro" }).eq("id", sol.id);
  check("B NO puede reescribir el mensaje ya enviado", Boolean(eMensaje));

  const { error: eAutoAceptar } = await B.db.from("machine_requests").update({ estado: "aceptada" }).eq("id", sol.id);
  check("B NO puede aceptar su propia solicitud (trigger)", Boolean(eAutoAceptar));

  const { error: eAceptar } = await A.db.from("machine_requests").update({ estado: "aceptada" }).eq("id", sol.id);
  check("A SÍ puede aceptarla", !eAceptar, eAceptar?.message);

  const { error: eCancelarTarde } = await B.db.from("machine_requests").update({ estado: "cancelada" }).eq("id", sol.id);
  check("B NO puede cancelar una solicitud ya aceptada", Boolean(eCancelarTarde));

  const { error: eCompletar } = await A.db.from("machine_requests").update({ estado: "completada" }).eq("id", sol.id);
  check("A SÍ puede marcarla como completada", !eCompletar, eCompletar?.message);

  const { data: contadores } = await A.db.from("machines").select("total_solicitudes, total_completadas").eq("id", mA.id).single();
  check(
    "Los contadores de reputación suben solos (1 solicitud, 1 completada)",
    contadores?.total_solicitudes === 1 && contadores?.total_completadas === 1,
    JSON.stringify(contadores),
  );

  const { data: borrarSol } = await B.db.from("machine_requests").delete().eq("id", sol.id).select("id");
  check("Nadie puede borrar una solicitud (es historial)", !borrarSol?.length);

  // Una máquina de B, para probar pedirse a sí mismo.
  const { data: mB } = await B.db.from("machines").insert(maquina(B.tenantId, { estado_publicacion: "publicada" })).select().single();
  const { error: eAutoPedido } = await B.db.from("machine_requests").insert({
    ...solicitud, machine_id: mB.id, tenant_propietario: B.tenantId,
  });
  check("B NO puede pedir su propia máquina", Boolean(eAutoPedido));

  // Pausar: quien ya la pidió la sigue viendo; quien no, no.
  await A.db.from("machines").update({ estado_publicacion: "pausada" }).eq("id", mA.id);
  ({ data: vistas } = await B.db.from("machines").select("id").eq("id", mA.id));
  check("B sigue viendo la máquina pausada que ya pidió (para su historial)", vistas?.length === 1);
  const { data: mA2 } = await A.db.from("machines").insert(maquina(A.tenantId, { estado_publicacion: "pausada" })).select().single();
  ({ data: vistas } = await B.db.from("machines").select("id").eq("id", mA2.id));
  check("B NO ve una máquina pausada que nunca pidió", vistas?.length === 0);

  // --- funciones de datos de otros talleres -------------------------------
  console.log("\nfunciones");

  const { data: nombres } = await B.db.rpc("nombres_talleres", { p_ids: [A.tenantId] });
  check("B ve el nombre del taller A (comparten una solicitud)", nombres?.length === 1);

  const { data: contraB } = await B.db.rpc("contraparte_solicitud", { p_request_id: sol.id });
  check("B obtiene el correo de A para su solicitud", contraB?.[0]?.email === A.email, JSON.stringify(contraB));

  const anonimo = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: contraAnon, error: eAnon } = await anonimo.rpc("contraparte_solicitud", { p_request_id: sol.id });
  check("Sin sesión no se puede pedir el correo de nadie", Boolean(eAnon) || !contraAnon?.length);

  // --- Storage --------------------------------------------------------------
  console.log("\nstorage (bucket maquinas)");

  const png = new Blob([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="), (c) => c.charCodeAt(0))], { type: "image/png" });
  const rutaA = `${A.tenantId}/prueba-${marca}.png`;

  const { error: eSubirA } = await A.db.storage.from("maquinas").upload(rutaA, png, { contentType: "image/png" });
  check("A sube una foto a su carpeta", !eSubirA, eSubirA?.message);
  if (!eSubirA) creados.fotos.push(rutaA);

  const rutaIntrusa = `${A.tenantId}/intrusa-${marca}.png`;
  const { error: eSubirB } = await B.db.storage.from("maquinas").upload(rutaIntrusa, png, { contentType: "image/png" });
  check("B NO puede subir a la carpeta de A", Boolean(eSubirB));
  if (!eSubirB) creados.fotos.push(rutaIntrusa);

  let { data: firma } = await B.db.storage.from("maquinas").createSignedUrl(rutaA, 60);
  check("B NO puede ver una foto de A que no está en una máquina publicada", !firma?.signedUrl);

  await A.db.from("machines").update({ fotos: [rutaA], estado_publicacion: "publicada" }).eq("id", mA.id);
  ({ data: firma } = await B.db.storage.from("maquinas").createSignedUrl(rutaA, 60));
  check("B SÍ puede ver la foto cuando es de una máquina publicada", Boolean(firma?.signedUrl));

  const { data: borrada } = await B.db.storage.from("maquinas").remove([rutaA]);
  check("B NO puede borrar la foto de A", !borrada?.length);
}

try {
  await main();
} catch (error) {
  fallos++;
  console.error(`\n✘ La prueba se detuvo: ${error.message}`);
} finally {
  await limpiar();
  console.log(`\n${fallos ? `✘ ${fallos} comprobaciones fallaron` : "✔ Todas las comprobaciones pasaron"} (datos de prueba borrados)`);
  process.exit(fallos ? 1 : 0);
}
