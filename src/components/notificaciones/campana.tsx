"use client";

import { Popover } from "@base-ui/react/popover";
import { BellIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AvisosDispositivo } from "@/components/notificaciones/avisos-dispositivo";
import { registrarServiceWorker } from "@/lib/notificaciones/dispositivo";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Notificacion } from "@/types/database";

/** Cuántas se muestran en la lista (las más recientes). */
const LIMITE = 15;

type Aviso = Pick<Notificacion, "id" | "titulo" | "cuerpo" | "url" | "leida_at" | "created_at">;

function haceCuanto(fecha: string, ahora: number): string {
  const minutos = Math.max(0, Math.round((ahora - new Date(fecha).getTime()) / 60000));
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias < 7) return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
  return new Date(fecha).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

/**
 * Campanita del encabezado: los avisos de la persona (solicitudes de máquinas,
 * respuestas, calificaciones) y el botón para recibirlos también como aviso
 * push en el celular o el PC.
 *
 * Se actualiza sola: por Realtime cuando la base crea un aviso, por mensaje
 * del service worker cuando llega un push y al volver a la pestaña.
 */
export function Campana({ userId, llavePublica }: { userId: string; llavePublica: string | null }) {
  const router = useRouter();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [sinLeer, setSinLeer] = useState(0);
  const [ahora, setAhora] = useState(0);
  const [abierta, setAbierta] = useState(false);
  // Sube con cada carga y con cada cambio local (marcar como leído), para
  // descartar una carga que salió antes y responde después.
  const version = useRef(0);

  const cargar = useCallback(async () => {
    const mia = ++version.current;
    const supabase = createClient();
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, titulo, cuerpo, url, leida_at, created_at")
        .order("created_at", { ascending: false })
        .limit(LIMITE),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("leida_at", null),
    ]);
    setAvisos(data ?? []);
    // Llegó tarde: entre tanto se marcó algo como leído o empezó otra carga.
    if (mia !== version.current) return;
    setSinLeer(count ?? 0);
    setAhora(Date.now());
  }, []);

  useEffect(() => {
    // Con el service worker registrado, los avisos push ya pueden llegar.
    void registrarServiceWorker();

    // Realtime necesita el token de la sesión ANTES de unirse al canal: si se
    // une como anónimo, RLS no le deja ver ningún aviso y nunca llega nada.
    const supabase = createClient();
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let vigente = true;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!vigente) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      canal = supabase
        .channel(`avisos-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          () => void cargar(),
        )
        // La primera carga va al conectar el canal (o si no conecta), así no
        // se pierde un aviso que llegue justo mientras se conecta.
        .subscribe((estado) => {
          if (estado !== "CLOSED") void cargar();
        });
    })();

    const alVolver = () => {
      if (document.visibilityState === "visible") void cargar();
    };
    const alMensaje = (e: MessageEvent) => {
      if (e.data?.tipo === "notificacion") void cargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    navigator.serviceWorker?.addEventListener("message", alMensaje);

    return () => {
      vigente = false;
      if (canal) void supabase.removeChannel(canal);
      document.removeEventListener("visibilitychange", alVolver);
      navigator.serviceWorker?.removeEventListener("message", alMensaje);
    };
  }, [userId, cargar]);

  const abrir = async (aviso: Aviso) => {
    setAbierta(false);
    if (!aviso.leida_at) {
      version.current++;
      setAvisos((lista) =>
        lista.map((a) => (a.id === aviso.id ? { ...a, leida_at: new Date().toISOString() } : a)),
      );
      setSinLeer((n) => Math.max(0, n - 1));
      await createClient()
        .from("notifications")
        .update({ leida_at: new Date().toISOString() })
        .eq("id", aviso.id);
    }
    router.push(aviso.url);
  };

  const marcarTodas = async () => {
    const momento = new Date().toISOString();
    version.current++;
    setAvisos((lista) => lista.map((a) => ({ ...a, leida_at: a.leida_at ?? momento })));
    setSinLeer(0);
    await createClient().from("notifications").update({ leida_at: momento }).is("leida_at", null);
  };

  return (
    <Popover.Root
      open={abierta}
      onOpenChange={(abrirla) => {
        setAbierta(abrirla);
        if (abrirla) void cargar();
      }}
    >
      <Popover.Trigger
        aria-label={sinLeer ? `Avisos: ${sinLeer} sin leer` : "Avisos"}
        className="relative inline-flex size-9 items-center justify-center rounded-md border bg-background hover:bg-muted"
      >
        <BellIcon className="size-4" />
        {sinLeer ? (
          <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] leading-5 font-semibold text-white">
            {sinLeer > 9 ? "9+" : sinLeer}
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Popover.Popup className="flex max-h-[min(32rem,80svh)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg outline-none">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <Popover.Title className="text-sm font-semibold">Avisos</Popover.Title>
              {sinLeer ? (
                <button
                  type="button"
                  onClick={marcarTodas}
                  className="text-xs font-medium text-emerald-700 hover:underline"
                >
                  Marcar todos como leídos
                </button>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {avisos.length ? (
                <ul className="divide-y">
                  {avisos.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => abrir(a)}
                        className={cn(
                          "flex w-full gap-3 px-4 py-3 text-left hover:bg-muted",
                          !a.leida_at && "bg-emerald-50/60",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-1.5 size-2 shrink-0 rounded-full",
                            a.leida_at ? "bg-transparent" : "bg-emerald-600",
                          )}
                        />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className={cn("text-sm", !a.leida_at && "font-semibold")}>{a.titulo}</span>
                          {a.cuerpo ? <span className="text-xs text-muted-foreground">{a.cuerpo}</span> : null}
                          <span className="text-[11px] text-muted-foreground">{haceCuanto(a.created_at, ahora)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No tienes avisos todavía. Aquí verás cuando un taller te pida una máquina.
                </p>
              )}
            </div>

            <AvisosDispositivo llavePublica={llavePublica} className="border-t bg-muted/40 px-4 py-3" />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
