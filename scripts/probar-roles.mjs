/**
 * Prueba que los roles (admin, operario, lectura) se apliquen en la base real.
 *
 *   node --env-file=.env.local scripts/probar-roles.mjs
 *
 * Necesita supabase/migrations/20261003_roles.sql aplicada (antes de aplicarla,
 * las pruebas de "lectura NO puede…" fallan: es justo lo que corrige).
 *
 * Crea dos talleres de prueba con el cliente admin (service role):
 *   · Taller A: un admin, un operario y un usuario de solo lectura, los dos
 *     últimos unidos por invitación (así se prueba también handle_new_user).
 *   · Taller B: un admin, para comprobar el aislamiento entre talleres.
 * Después entra como cada usuario con la anon key —igual que la aplicación— e
 * intenta lo permitido y lo prohibido. Al final borra todo lo que creó, también
 * si alguna prueba falla. Correos @example.com: no se envía nada.
 */

import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables. Corre con: node --env-file=.env.local scripts/probar-roles.mjs");
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

const creados = { usuarios: [], tenants: [], fotos: [] };

async function entrar(email) {
  const cliente = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await cliente.auth.signInWithPassword({ email, password: CLAVE });
  if (error) throw new Error(`No se pudo entrar como ${email}: ${error.message}`);
  return cliente;
}

/** Usuario que se registra normal: el trigger le crea su propio taller (admin). */
async function crearAdmin(letra) {
  const email = `roles-admin-${letra.toLowerCase()}-${marca}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { empresa: `Taller roles ${letra} ${marca}`, nombre: `Admin ${letra}` },
  });
  if (error) throw new Error(`No se pudo crear el admin ${letra}: ${error.message}`);
  creados.usuarios.push(data.user.id);

  const { data: perfil } = await admin
    .from("profiles")
    .select("tenant_id, rol")
    .eq("id", data.user.id)
    .single();
  if (!perfil?.tenant_id) throw new Error(`El admin ${letra} no recibió taller`);
  creados.tenants.push(perfil.tenant_id);

  return { email, userId: data.user.id, tenantId: perfil.tenant_id, rol: perfil.rol, db: await entrar(email) };
}

/** Usuario que entra por invitación: el trigger lo une al taller con ese rol. */
async function crearInvitado(taller, rol) {
  const email = `roles-${rol}-${marca}@example.com`;
  const token = randomUUID();
  const { error: errorInv } = await admin.from("invitaciones").insert({
    tenant_id: taller.tenantId,
    email,
    rol,
    token,
    invitado_por: taller.userId,
  });
  if (errorInv) throw new Error(`No se pudo crear la invitación de ${rol}: ${errorInv.message}`);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { invitacion_token: token, nombre: `Persona ${rol}` },
  });
  if (error) throw new Error(`No se pudo crear el usuario ${rol}: ${error.message}`);
  creados.usuarios.push(data.user.id);

  const { data: perfil } = await admin
    .from("profiles")
    .select("tenant_id, rol")
    .eq("id", data.user.id)
    .single();

  return { email, userId: data.user.id, tenantId: perfil?.tenant_id, rol: perfil?.rol, db: await entrar(email) };
}

function material(tenantId, tipo) {
  return { tenant_id: tenantId, tipo, costo_unitario: 1000, unidad: "m2" };
}

// PNG de 1×1 píxel, para probar la subida de fotos.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function limpiar() {
  if (creados.fotos.length) await admin.storage.from("sobrantes").remove(creados.fotos);
  for (const t of creados.tenants) {
    // job_items → materials es ON DELETE RESTRICT: primero piezas y trabajos.
    const { data: trabajos } = await admin.from("jobs").select("id").eq("tenant_id", t);
    const ids = (trabajos ?? []).map((j) => j.id);
    if (ids.length) await admin.from("job_items").delete().in("job_id", ids);
    await admin.from("jobs").delete().eq("tenant_id", t);
    // El resto cuelga del taller con ON DELETE CASCADE (perfiles, materiales,
    // sobrantes, ventas, máquinas, invitaciones, contadores…).
    await admin.from("tenants").delete().eq("id", t);
  }
  for (const u of creados.usuarios) await admin.auth.admin.deleteUser(u);
}

async function main() {
  const A = await crearAdmin("A");
  const O = await crearInvitado(A, "operario");
  const L = await crearInvitado(A, "lectura");
  const B = await crearAdmin("B");
  console.log(`Taller A: ${A.tenantId}   Taller B: ${B.tenantId}\n`);

  // --- Alta por invitación ----------------------------------------------------
  console.log("Alta por invitación (handle_new_user)");
  check("El admin que se registra queda como admin", A.rol === "admin");
  check("El operario invitado entra al taller A", O.tenantId === A.tenantId && O.rol === "operario");
  check("El de solo lectura invitado entra al taller A", L.tenantId === A.tenantId && L.rol === "lectura");

  // --- Materiales -------------------------------------------------------------
  console.log("\nMateriales");
  const { data: mAdmin, error: eMat } = await A.db
    .from("materials").insert(material(A.tenantId, "Acrílico admin")).select().single();
  check("Admin crea un material", !eMat && mAdmin, eMat?.message);
  if (!mAdmin) throw new Error("Sin material no se puede seguir");

  const { data: mOp, error: eMatOp } = await O.db
    .from("materials").insert(material(A.tenantId, "Vinilo operario")).select().single();
  check("Operario crea un material", !eMatOp && mOp, eMatOp?.message);

  const { data: verL } = await L.db.from("materials").select("id").eq("tenant_id", A.tenantId);
  check("Lectura VE los materiales del taller", (verL?.length ?? 0) >= 1);

  const { error: eMatL } = await L.db.from("materials").insert(material(A.tenantId, "Intruso"));
  check("Lectura NO puede crear materiales", Boolean(eMatL));

  const { data: updL } = await L.db
    .from("materials").update({ tipo: "Cambiado por lectura" }).eq("id", mAdmin.id).select("id");
  check("Lectura NO puede editar materiales", (updL?.length ?? 0) === 0);

  const { data: delL } = await L.db.from("materials").delete().eq("id", mAdmin.id).select("id");
  check("Lectura NO puede borrar materiales", (delL?.length ?? 0) === 0);

  const { data: updO } = await O.db
    .from("materials").update({ color: "Rojo" }).eq("id", mAdmin.id).select("id");
  check("Operario SÍ puede editar materiales", (updO?.length ?? 0) === 1);

  const { data: verB } = await B.db.from("materials").select("id").eq("tenant_id", A.tenantId);
  check("Otro taller NO ve los materiales de A", (verB?.length ?? 0) === 0);

  const { data: mB } = await B.db
    .from("materials").insert(material(B.tenantId, "Material de B")).select().single();

  // --- Trabajos y piezas -----------------------------------------------------
  console.log("\nTrabajos y piezas");
  const { error: eJobL } = await L.db.from("jobs").insert({ tenant_id: A.tenantId, nombre: "Trabajo lectura" });
  check("Lectura NO puede crear trabajos", Boolean(eJobL));

  const { data: job, error: eJob } = await O.db
    .from("jobs").insert({ tenant_id: A.tenantId, nombre: "Trabajo operario" }).select().single();
  check("Operario crea un trabajo", !eJob && job, eJob?.message);

  if (job) {
    const pieza = { job_id: job.id, material_id: mAdmin.id, ancho_cm: 10, alto_cm: 10, cantidad: 1 };
    const { error: ePieza } = await O.db.from("job_items").insert(pieza);
    check("Operario añade una pieza", !ePieza, ePieza?.message);

    const { error: ePiezaL } = await L.db.from("job_items").insert(pieza);
    check("Lectura NO puede añadir piezas", Boolean(ePiezaL));

    if (mB) {
      const { error: ePiezaAjena } = await O.db
        .from("job_items").insert({ ...pieza, material_id: mB.id });
      check("NO se puede usar el material de otro taller en una pieza", Boolean(ePiezaAjena));
    }
  }

  // --- Sobrantes, contador y consumo ------------------------------------------
  console.log("\nSobrantes");
  const sobrante = { tenant_id: A.tenantId, material_id: mAdmin.id, ancho_cm: 20, alto_cm: 20, cantidad: 5 };
  const { error: eSobL } = await L.db.from("inventory_items").insert(sobrante);
  check("Lectura NO puede registrar sobrantes", Boolean(eSobL));

  const { data: sob, error: eSob } = await O.db.from("inventory_items").insert(sobrante).select().single();
  check("Operario registra un sobrante", !eSob && sob, eSob?.message);

  const { data: num, error: eNum } = await O.db.rpc("siguiente_contador", {
    p_tenant_id: A.tenantId, p_tipo: "sobrante",
  });
  check("Operario obtiene un código de sobrante", !eNum && typeof num === "number", eNum?.message);

  const { error: eNumL } = await L.db.rpc("siguiente_contador", {
    p_tenant_id: A.tenantId, p_tipo: "sobrante",
  });
  check("Lectura NO puede generar códigos de sobrante", Boolean(eNumL));

  if (sob) {
    const { error: eConsL } = await L.db.rpc("consumir_sobrante_unidad", {
      p_tenant_id: A.tenantId, p_inventory_item_id: sob.id, p_cantidad: 1,
    });
    check("Lectura NO puede consumir sobrantes", Boolean(eConsL));

    const { data: resto, error: eCons } = await O.db.rpc("consumir_sobrante_unidad", {
      p_tenant_id: A.tenantId, p_inventory_item_id: sob.id, p_cantidad: 1,
    });
    check("Operario consume 1 de 5 unidades", !eCons && resto === 4, eCons?.message ?? `quedan ${resto}`);

    // --- Ventas
    const venta = { tenant_id: A.tenantId, inventory_item_id: sob.id, monto: 1000 };
    const { error: eVentaL } = await L.db.from("sales").insert(venta);
    check("Lectura NO puede registrar ventas", Boolean(eVentaL));
  }

  if (mB) {
    const { data: sobB } = await admin.from("inventory_items")
      .insert({ tenant_id: B.tenantId, material_id: mB.id, ancho_cm: 5, alto_cm: 5 }).select().single();
    if (sobB) {
      const { error: eVentaAjena } = await O.db
        .from("sales").insert({ tenant_id: A.tenantId, inventory_item_id: sobB.id, monto: 1 });
      check("NO se puede registrar una venta sobre el sobrante de otro taller", Boolean(eVentaAjena));
    }
  }

  // --- Desperdicio y ahorro ----------------------------------------------------
  console.log("\nDesperdicio y ahorro");
  const { error: eWasteL } = await L.db.from("waste_logs")
    .insert({ tenant_id: A.tenantId, material_id: mAdmin.id, cantidad: 1, costo: 100 });
  check("Lectura NO puede registrar desperdicio", Boolean(eWasteL));

  const { error: eWaste } = await O.db.from("waste_logs")
    .insert({ tenant_id: A.tenantId, material_id: mAdmin.id, cantidad: 1, costo: 100 });
  check("Operario registra desperdicio", !eWaste, eWaste?.message);

  const { error: eAhorroL } = await L.db.from("savings")
    .insert({ tenant_id: A.tenantId, tipo: "otro", monto: 1 });
  check("Lectura NO puede registrar ahorros", Boolean(eAhorroL));

  // --- Fotos -------------------------------------------------------------------
  console.log("\nFotos");
  const rutaL = `${A.tenantId}/roles-lectura-${marca}.png`;
  const { error: eFotoL } = await L.db.storage.from("sobrantes").upload(rutaL, PNG, { contentType: "image/png" });
  if (!eFotoL) creados.fotos.push(rutaL);
  check("Lectura NO puede subir fotos", Boolean(eFotoL));

  const rutaO = `${A.tenantId}/roles-operario-${marca}.png`;
  const { error: eFotoO } = await O.db.storage.from("sobrantes").upload(rutaO, PNG, { contentType: "image/png" });
  if (!eFotoO) creados.fotos.push(rutaO);
  check("Operario sube una foto", !eFotoO, eFotoO?.message);

  // --- Capacidad --------------------------------------------------------------
  console.log("\nCapacidad");
  const maquina = {
    tenant_id: A.tenantId, nombre: "Láser prueba roles", tipo: "laser_corte", ciudad: "Medellín",
    precio: 1000, unidad_precio: "hora", contacto_telefono: "300 000 0000",
  };
  const { error: eMaqL } = await L.db.from("machines").insert(maquina);
  check("Lectura NO puede publicar máquinas", Boolean(eMaqL));

  const { error: eMaqO } = await O.db.from("machines").insert(maquina);
  check("Operario puede publicar máquinas", !eMaqO, eMaqO?.message);

  // --- Perfil propio ------------------------------------------------------------
  console.log("\nPerfil");
  const { data: nombreL, error: eNombreL } = await L.db
    .from("profiles").update({ nombre: "Lectura renombrado" }).eq("id", L.userId).select("id");
  check("Lectura SÍ puede cambiar su propio nombre", !eNombreL && nombreL?.length === 1, eNombreL?.message);

  const { error: eRolL } = await L.db.from("profiles").update({ rol: "admin" }).eq("id", L.userId);
  check("Lectura NO puede ascenderse a admin", Boolean(eRolL));

  const { data: rolOtro } = await O.db
    .from("profiles").update({ rol: "admin" }).eq("id", L.userId).select("id");
  check("Operario NO puede cambiar el rol de otro", (rolOtro?.length ?? 0) === 0);

  // --- Desactivar --------------------------------------------------------------
  console.log("\nDesactivar un usuario");
  const { data: desact, error: eDesact } = await A.db
    .from("profiles").update({ activo: false }).eq("id", O.userId).select("id");
  check("Admin desactiva al operario", !eDesact && desact?.length === 1, eDesact?.message);

  const { data: verDesact } = await O.db.from("materials").select("id");
  check("El operario desactivado ya NO ve datos", (verDesact?.length ?? 0) === 0);

  const { error: eEscDesact } = await O.db.from("materials").insert(material(A.tenantId, "Tras desactivar"));
  check("El operario desactivado ya NO puede escribir", Boolean(eEscDesact));
}

try {
  await main();
} catch (error) {
  fallos++;
  console.error("\n✘ La prueba se detuvo:", error.message);
} finally {
  await limpiar();
  console.log(`\n${fallos === 0 ? "Todo bien" : `${fallos} fallo(s)`}. Datos de prueba borrados.`);
  process.exit(fallos === 0 ? 0 : 1);
}
