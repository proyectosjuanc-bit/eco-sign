/**
 * Prueba las notificaciones (campanita y suscripciones push) en la base real.
 *
 *   node --env-file=.env.local scripts/probar-notificaciones.mjs
 *
 * Necesita supabase/migrations/20261005_notificaciones.sql aplicada.
 * Crea dos talleres de prueba (A dueño de una máquina, B el que la pide),
 * recorre una solicitud completa y comprueba quién recibe cada aviso y qué
 * puede tocar cada uno. Al final borra todo. Correos @example.com.
 */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables. Corre con: node --env-file=.env.local scripts/probar-notificaciones.mjs");
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

const creados = { usuarios: [], tenants: [] };

async function crearAdmin(letra) {
  const email = `avisos-${letra.toLowerCase()}-${marca}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { empresa: `Taller avisos ${letra}`, nombre: `Admin ${letra}` },
  });
  if (error) throw new Error(`No se pudo crear ${letra}: ${error.message}`);
  creados.usuarios.push(data.user.id);
  const { data: perfil } = await admin.from("profiles").select("tenant_id").eq("id", data.user.id).single();
  creados.tenants.push(perfil.tenant_id);

  const db = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e } = await db.auth.signInWithPassword({ email, password: CLAVE });
  if (e) throw new Error(e.message);
  return { email, userId: data.user.id, tenantId: perfil.tenant_id, db };
}

async function avisos(quien) {
  const { data } = await quien.db.from("notifications").select("*").order("created_at", { ascending: false });
  return data ?? [];
}

async function limpiar() {
  for (const t of creados.tenants) {
    await admin.from("machine_requests").delete().or(`tenant_solicitante.eq.${t},tenant_propietario.eq.${t}`);
    await admin.from("machines").delete().eq("tenant_id", t);
    await admin.from("tenants").delete().eq("id", t);
  }
  for (const u of creados.usuarios) await admin.auth.admin.deleteUser(u);
}

async function main() {
  const A = await crearAdmin("A");
  const B = await crearAdmin("B");

  const { data: maquina, error: eM } = await A.db
    .from("machines")
    .insert({
      tenant_id: A.tenantId,
      nombre: "Láser de prueba avisos",
      tipo: "laser_corte",
      ciudad: "Medellín",
      precio: 50000,
      unidad_precio: "hora",
      contacto_telefono: "300 000 0000",
      disponibilidad_horaria: { lunes: ["08:00-12:00"] },
    })
    .select()
    .single();
  if (eM) throw new Error(eM.message);
  await A.db.from("machines").update({ estado_publicacion: "publicada" }).eq("id", maquina.id);

  console.log("Nueva solicitud");
  const { data: sol, error: eS } = await B.db
    .from("machine_requests")
    .insert({
      machine_id: maquina.id,
      tenant_solicitante: B.tenantId,
      tenant_propietario: A.tenantId,
      mensaje: "La necesito el lunes",
      fecha_deseada: "2030-01-15",
      duracion_estimada: "2 horas",
    })
    .select()
    .single();
  if (eS) throw new Error(eS.message);

  let deA = await avisos(A);
  check("El dueño (A) recibe el aviso de la solicitud", deA.length === 1 && deA[0].tipo === "solicitud_nueva");
  check(
    "El aviso dice quién, qué máquina y la fecha",
    deA[0]?.cuerpo.includes("Taller avisos B") && deA[0]?.cuerpo.includes("Láser de prueba avisos") && deA[0]?.cuerpo.includes("15/01/2030"),
    deA[0]?.cuerpo,
  );
  check("Lleva a Solicitudes recibidas", deA[0]?.url === "/capacidad/solicitudes-recibidas");
  check("El que pidió (B) no recibe nada todavía", (await avisos(B)).length === 0);

  console.log("\nPermisos");
  const { error: eInsert } = await B.db.from("notifications").insert({
    user_id: A.userId, tipo: "falso", titulo: "Aviso falso", cuerpo: "", url: "/dashboard",
  });
  check("B NO puede crear avisos para A", Boolean(eInsert));
  const { data: ajenos } = await B.db.from("notifications").select("id").eq("user_id", A.userId);
  check("B NO ve los avisos de A", ajenos?.length === 0);
  const { error: eTitulo } = await A.db.from("notifications").update({ titulo: "cambiado" }).eq("id", deA[0].id);
  check("A NO puede cambiar el texto de su aviso", Boolean(eTitulo));
  const { data: leida, error: eLeida } = await A.db
    .from("notifications")
    .update({ leida_at: new Date().toISOString() })
    .eq("id", deA[0].id)
    .select("leida_at");
  check("A sí puede marcarlo como leído", !eLeida && leida?.[0]?.leida_at, eLeida?.message);
  const { data: tocadas } = await B.db
    .from("notifications")
    .update({ leida_at: new Date().toISOString() })
    .eq("user_id", A.userId)
    .select("id");
  check("B NO puede marcar como leídos los de A", !tocadas?.length);
  const { error: eNotificar } = await B.db.rpc("notificar_taller", {
    p_tenant: A.tenantId, p_tipo: "x", p_titulo: "x", p_cuerpo: "x", p_url: "/dashboard",
  });
  check("Nadie puede llamar notificar_taller desde la app", Boolean(eNotificar));

  console.log("\nRespuestas del dueño");
  await A.db.from("machine_requests").update({ estado: "aceptada" }).eq("id", sol.id);
  let deB = await avisos(B);
  check("B recibe «Aceptaron tu solicitud»", deB[0]?.tipo === "solicitud_aceptada" && deB[0]?.cuerpo.includes("Taller avisos A"), JSON.stringify(deB[0]));
  await A.db.from("machine_requests").update({ estado: "completada" }).eq("id", sol.id);
  deB = await avisos(B);
  check("B recibe el aviso para calificar", deB[0]?.tipo === "solicitud_completada" && deB.length === 2);

  console.log("\nCalificación");
  const { error: eR } = await B.db.from("machine_reviews").insert({
    request_id: sol.id, machine_id: maquina.id, tenant_autor: B.tenantId, tenant_calificado: A.tenantId,
    estrellas: 4, comentario: "Muy cumplidos",
  });
  check("B califica", !eR, eR?.message);
  deA = await avisos(A);
  check(
    "A recibe «Te calificaron con 4 estrellas» con el comentario",
    deA[0]?.tipo === "resena_nueva" && deA[0]?.titulo === "Te calificaron con 4 estrellas" && deA[0]?.cuerpo.includes("Muy cumplidos"),
    JSON.stringify(deA[0]),
  );
  check("…y lleva a la página del taller", deA[0]?.url === `/taller/${A.tenantId}`);

  console.log("\nCancelación");
  const { data: sol2 } = await B.db
    .from("machine_requests")
    .insert({
      machine_id: maquina.id, tenant_solicitante: B.tenantId, tenant_propietario: A.tenantId,
      mensaje: "Otra vez", fecha_deseada: "2030-02-01", duracion_estimada: "1 hora",
    })
    .select()
    .single();
  await B.db.from("machine_requests").update({ estado: "cancelada" }).eq("id", sol2.id);
  deA = await avisos(A);
  check("A recibe nueva solicitud y luego «Solicitud cancelada»", deA[0]?.tipo === "solicitud_cancelada" && deA[1]?.tipo === "solicitud_nueva");

  console.log("\nAviso de prueba");
  const { error: eP } = await A.db.rpc("probar_aviso");
  check("probar_aviso crea un aviso para uno mismo", !eP && (await avisos(A))[0]?.tipo === "prueba", eP?.message);
  for (let i = 0; i < 4; i++) await A.db.rpc("probar_aviso");
  const { error: eTope } = await A.db.rpc("probar_aviso");
  check("…con tope de 5 por hora", eTope?.message?.includes("varios avisos"), eTope?.message);

  console.log("\nDispositivos push");
  const { error: eMalo } = await A.db.rpc("registrar_suscripcion_push", {
    p_endpoint: "https://atacante.example.com/push", p_p256dh: "x", p_auth: "y",
  });
  check("Rechaza una dirección que no es de un servicio push", Boolean(eMalo));
  const endpoint = `https://fcm.googleapis.com/fcm/send/prueba-${marca}`;
  const { error: eBueno } = await A.db.rpc("registrar_suscripcion_push", {
    p_endpoint: endpoint, p_p256dh: "llave", p_auth: "auth", p_user_agent: "prueba",
  });
  check("Acepta un dispositivo de Chrome (Google)", !eBueno, eBueno?.message);
  const { data: vistosB } = await B.db.from("push_subscriptions").select("id");
  check("B no ve los dispositivos de A", vistosB?.length === 0);
  // El mismo navegador pasa a B (otra persona usa el mismo PC).
  await B.db.rpc("registrar_suscripcion_push", { p_endpoint: endpoint, p_p256dh: "llave", p_auth: "auth" });
  const { data: deQuien } = await admin.from("push_subscriptions").select("user_id").eq("endpoint", endpoint);
  check("Si otra persona entra en el mismo navegador, el dispositivo pasa a ella", deQuien?.length === 1 && deQuien[0].user_id === B.userId);
  const { error: eDirecto } = await A.db.from("push_subscriptions").insert({ user_id: A.userId, endpoint: endpoint + "x", p256dh: "a", auth: "b" });
  check("Nadie escribe la tabla de dispositivos directamente", Boolean(eDirecto));
  await B.db.rpc("quitar_suscripcion_push", { p_endpoint: endpoint });
  const { data: quedan } = await admin.from("push_subscriptions").select("id").eq("endpoint", endpoint);
  check("Desactivar quita el dispositivo", quedan?.length === 0);
}

try {
  await main();
} catch (e) {
  console.error("✘ Error:", e.message);
  fallos++;
} finally {
  await limpiar();
  console.log(`\n${fallos === 0 ? "Todo bien" : `${fallos} fallo(s)`}. Datos de prueba borrados.`);
  process.exit(fallos === 0 ? 0 : 1);
}
