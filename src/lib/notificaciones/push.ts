import "server-only";

import webpush from "web-push";

import { crearClienteAdmin } from "@/lib/supabase/admin";

/**
 * Envío de avisos push a los celulares y PCs suscritos.
 *
 * Las notificaciones las crea la base (triggers de 20261005_notificaciones.sql);
 * esto sólo toma las que todavía no salieron por push, las marca como enviadas
 * (en el mismo UPDATE, para que dos llamadas a la vez no las manden dos veces) y
 * las entrega a cada dispositivo de su destinatario.
 *
 * Se llama con `after()` al final de las acciones que generan avisos, así el
 * usuario no espera a que salgan. Nunca lanza: un aviso que falla no debe
 * romper la acción que lo generó, y el aviso igual queda en la campanita.
 *
 * Usa el cliente admin porque el envío lo hace el sistema, no el usuario:
 * necesita ver los dispositivos de OTRAS personas (el dueño de la máquina).
 */

/** Más viejas que esto ya no se envían por push (sólo quedan en la campanita). */
const MINUTOS_MAXIMOS = 15;

/** Tiempo que el servicio push guarda el aviso si el dispositivo está apagado. */
const TTL_SEGUNDOS = 24 * 60 * 60;

let configurado: boolean | null = null;

/** Las llaves VAPID están en las variables de entorno. */
export function pushConfigurado(): boolean {
  if (configurado !== null) return configurado;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) {
    configurado = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:proyectosjuanc@gmail.com",
    publica,
    privada,
  );
  configurado = true;
  return true;
}

export async function despacharPush(): Promise<void> {
  try {
    if (!pushConfigurado()) return;
    const admin = crearClienteAdmin();
    if (!admin) return;

    const desde = new Date(Date.now() - MINUTOS_MAXIMOS * 60 * 1000).toISOString();
    const { data: pendientes, error } = await admin
      .from("notifications")
      .update({ push_enviada_at: new Date().toISOString() })
      .is("push_enviada_at", null)
      .gte("created_at", desde)
      .select("id, user_id, tipo, titulo, cuerpo, url");

    if (error) {
      console.error("[push] No se pudieron leer los avisos pendientes", error);
      return;
    }
    if (!pendientes?.length) return;

    const usuarios = [...new Set(pendientes.map((n) => n.user_id))];
    const { data: dispositivos } = await admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", usuarios);
    if (!dispositivos?.length) return;

    const vencidos: string[] = [];
    await Promise.all(
      pendientes.flatMap((n) =>
        dispositivos
          .filter((d) => d.user_id === n.user_id)
          .map(async (d) => {
            try {
              await webpush.sendNotification(
                { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
                JSON.stringify({ id: n.id, titulo: n.titulo, cuerpo: n.cuerpo, url: n.url }),
                {
                  TTL: TTL_SEGUNDOS,
                  urgency: n.tipo === "solicitud_nueva" ? "high" : "normal",
                  timeout: 8000,
                },
              );
            } catch (e) {
              const codigo = (e as { statusCode?: number }).statusCode;
              // 404/410: el navegador anuló la suscripción (desinstaló la app,
              // borró datos, revocó el permiso). Se borra para no insistir.
              if (codigo === 404 || codigo === 410) vencidos.push(d.id);
              else console.error("[push] Falló un envío", codigo ?? e);
            }
          }),
      ),
    );

    if (vencidos.length) {
      await admin.from("push_subscriptions").delete().in("id", vencidos);
    }
  } catch (e) {
    console.error("[push] Error inesperado", e);
  }
}
