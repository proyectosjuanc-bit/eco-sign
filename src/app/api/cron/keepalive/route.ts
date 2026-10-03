import { timingSafeEqual } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type { Database } from "@/types/database";

/**
 * Mantiene despierto el proyecto de Supabase.
 *
 * En el plan gratuito Supabase pausa el proyecto tras ~7 días sin actividad.
 * Vercel Cron llama a esta ruta una vez al día (ver `vercel.json`) y hace una
 * consulta mínima a Postgres, que cuenta como actividad.
 *
 * Se usa la anon key sin sesión y una función pública y de solo lectura
 * (obtener_invitacion_por_token con un token que no existe): llega a la base,
 * que es lo único que importa aquí, y no necesita la service role key.
 *
 * Antes consultaba la tabla `tenants`, pero desde que current_tenant_id() dejó
 * de ser ejecutable por `anon` esa consulta falla con "permission denied".
 *
 * Protección: Vercel envía `Authorization: Bearer <CRON_SECRET>` cuando la
 * variable `CRON_SECRET` existe en el proyecto. Sin esa variable la ruta queda
 * cerrada en producción, igual que /api/test-email.
 */

export const runtime = "nodejs";

function autorizado(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;

  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false;

  const recibido = request.headers.get("authorization");
  if (!recibido) return false;

  const a = Buffer.from(recibido);
  const b = Buffer.from(`Bearer ${esperado}`);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );

  const { error } = await supabase.rpc("obtener_invitacion_por_token", {
    p_token: "keepalive",
  });

  if (error) {
    // 502: el fallo viene de Supabase (p. ej. el proyecto ya está pausado).
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
