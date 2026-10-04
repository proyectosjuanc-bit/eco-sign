/**
 * Prueba «Busco máquina» en la base real.
 *
 *   node --env-file=.env.local scripts/probar-busquedas.mjs
 *
 * Necesita supabase/migrations/20261005_busquedas.sql aplicada.
 * Crea tres talleres de prueba: A busca, B y C reciben el aviso; B responde.
 * Al final borra todo, también los avisos que la prueba dejó en las campanitas
 * de los talleres reales. Correos @example.com.
 */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables. Corre con: node --env-file=.env.local scripts/probar-busquedas.mjs");
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const marca = Date.now();
const CLAVE = `Prueba-${marca}-xY9!`;
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const enDias = (n) => {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

let fallos = 0;
function check(descripcion, condicion, detalle) {
  console.log(`${condicion ? "✔" : "✘"} ${descripcion}${!condicion && detalle ? `\n    → ${detalle}` : ""}`);
  if (!condicion) fallos++;
}

const creados = { usuarios: [], tenants: [] };

async function crearAdmin(letra) {
  const email = `busca-${letra.toLowerCase()}-${marca}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { empresa: `Taller busca ${letra}`, nombre: `Admin ${letra}` },
  });
  if (error) throw new Error(`No se pudo crear ${letra}: ${error.message}`);
  creados.usuarios.push(data.user.id);
  const { data: perfil } = await admin.from("profiles").select("tenant_id").eq("id", data.user.id).single();
  creados.tenants.push(perfil.tenant_id);
  const db = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e } = await db.auth.signInWithPassword({ email, password: CLAVE });
  if (e) throw new Error(e.message);
  return { userId: data.user.id, tenantId: perfil.tenant_id, db };
}

const avisos = async (quien, tipo) =>
  ((await quien.db.from("notifications").select("*").eq("tipo", tipo)).data ?? []);

const inicio = new Date().toISOString();

async function limpiar() {
  // Las búsquedas avisan a TODOS los talleres: se borran de las campanitas
  // reales los avisos que generó la prueba. (Esta prueba no envía push: eso lo
  // hace la app, no la base.)
  await admin.from("notifications").delete().gte("created_at", inicio).like("titulo", "Taller busca %");
  for (const t of creados.tenants) await admin.from("tenants").delete().eq("id", t);
  for (const u of creados.usuarios) await admin.auth.admin.deleteUser(u);
}

async function main() {
  const A = await crearAdmin("A");
  const B = await crearAdmin("B");
  const C = await crearAdmin("C");

  console.log("Publicar");
  const busqueda = {
    tenant_id: A.tenantId, tipo: "router_cnc",
    descripcion: "Cortar 50 letras en MDF de 9 mm", fecha_deseada: enDias(5), ciudad: "Medellín",
  };
  const { data: b, error: eB } = await A.db.from("machine_searches").insert(busqueda).select().single();
  check("A publica una búsqueda", !eB, eB?.message);
  if (!b) throw new Error("Sin búsqueda no se puede seguir");
  check("La base pone el nombre del taller y la deja abierta", b.taller_nombre === "Taller busca A" && b.estado === "abierta");

  const deB = await avisos(B, "busqueda_nueva");
  const deC = await avisos(C, "busqueda_nueva");
  check("B recibe el aviso (aunque no tiene máquinas publicadas)", deB.length === 1, JSON.stringify(deB));
  check("C también lo recibe", deC.length === 1);
  check("El aviso dice qué busca, cuándo y para qué",
    deB[0]?.titulo === "Taller busca A busca un router CNC" && deB[0]?.cuerpo.includes("Cortar 50 letras") && deB[0]?.url === "/capacidad/busquedas",
    `${deB[0]?.titulo} | ${deB[0]?.cuerpo}`);
  check("A no se avisa a sí mismo", (await avisos(A, "busqueda_nueva")).length === 0);

  const { data: vistas } = await C.db.from("machine_searches").select("id").eq("id", b.id);
  check("Los demás talleres ven la búsqueda", vistas?.length === 1);

  const { error: eVieja } = await A.db.from("machine_searches").insert({ ...busqueda, fecha_deseada: enDias(-1) });
  check("No acepta una fecha pasada", eVieja?.message?.includes("Elige una fecha"), eVieja?.message);
  const { error: eAjena } = await B.db.from("machine_searches").insert({ ...busqueda });
  check("B NO puede publicar a nombre de A", Boolean(eAjena));

  console.log("\nResponder");
  const { error: ePropia } = await A.db.from("machine_search_responses").insert({
    search_id: b.id, tenant_id: A.tenantId, mensaje: "Yo mismo", telefono: "3001234567",
  });
  check("A NO puede responder su propia búsqueda", Boolean(ePropia));
  const { error: eR } = await B.db.from("machine_search_responses").insert({
    search_id: b.id, tenant_id: B.tenantId, mensaje: "Tengo un router libre ese día", telefono: "3001234567",
  });
  check("B responde «Yo puedo ayudar»", !eR, eR?.message);
  const { error: eDoble } = await B.db.from("machine_search_responses").insert({
    search_id: b.id, tenant_id: B.tenantId, mensaje: "Otra vez", telefono: "3001234567",
  });
  check("B no puede responder dos veces", eDoble?.code === "23505", eDoble?.message);

  const deA = await avisos(A, "busqueda_respuesta");
  check("A recibe el aviso con el mensaje y el teléfono",
    deA.length === 1 && deA[0].titulo === "Taller busca B puede ayudarte" && deA[0].cuerpo.includes("3001234567"),
    JSON.stringify(deA[0]));

  const { data: vistasA } = await A.db.from("machine_search_responses").select("taller_nombre, telefono").eq("search_id", b.id);
  check("A ve la respuesta de B con su teléfono", vistasA?.length === 1 && vistasA[0].taller_nombre === "Taller busca B");
  const { data: vistasC } = await C.db.from("machine_search_responses").select("id").eq("search_id", b.id);
  check("C NO ve la respuesta de B", vistasC?.length === 0);

  console.log("\nCerrar");
  const { error: eCierreAjeno, data: cerradaPorB } = await B.db.from("machine_searches").update({ estado: "resuelta" }).eq("id", b.id).select("id");
  check("B NO puede cerrar la búsqueda de A", Boolean(eCierreAjeno) || !cerradaPorB?.length);
  const { error: eTexto } = await A.db.from("machine_searches").update({ descripcion: "cambiada" }).eq("id", b.id);
  check("A NO puede cambiar el texto ya publicado", Boolean(eTexto));
  const { error: eCierre } = await A.db.from("machine_searches").update({ estado: "resuelta" }).eq("id", b.id);
  check("A la marca como resuelta", !eCierre, eCierre?.message);
  const { error: eReabrir } = await A.db.from("machine_searches").update({ estado: "abierta" }).eq("id", b.id);
  check("Una búsqueda cerrada no se reabre", Boolean(eReabrir));
  const { error: eTarde } = await C.db.from("machine_search_responses").insert({
    search_id: b.id, tenant_id: C.tenantId, mensaje: "Llego tarde", telefono: "3001234567",
  });
  check("Nadie responde una búsqueda cerrada", Boolean(eTarde));

  console.log("\nTope diario");
  await A.db.from("machine_searches").insert({ ...busqueda, descripcion: "Segunda búsqueda de prueba" });
  await A.db.from("machine_searches").insert({ ...busqueda, descripcion: "Tercera búsqueda de prueba" });
  const { error: eTope } = await A.db.from("machine_searches").insert({ ...busqueda, descripcion: "Cuarta búsqueda de prueba" });
  check("Máximo 3 búsquedas al día", eTope?.message?.includes("3 búsquedas"), eTope?.message);
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
