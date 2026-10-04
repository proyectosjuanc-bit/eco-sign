"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { probarAviso } from "@/lib/notificaciones/actions";
import {
  activarAvisos,
  desactivarAvisos,
  estadoAvisos,
  esIOS,
  type EstadoAvisos,
} from "@/lib/notificaciones/dispositivo";
import { cn } from "@/lib/utils";

/**
 * Activar o desactivar los avisos push en ESTE celular o PC, con la
 * explicación que toca en cada caso (iPhone sin instalar, avisos bloqueados…).
 */
export function AvisosDispositivo({
  llavePublica,
  className,
}: {
  /** Llave VAPID pública; null si el servidor todavía no tiene avisos push. */
  llavePublica: string | null;
  className?: string;
}) {
  const [estado, setEstado] = useState<EstadoAvisos>("cargando");
  const [ocupado, startTransition] = useTransition();

  useEffect(() => {
    let vigente = true;
    estadoAvisos().then((e) => {
      if (vigente) setEstado(e);
    });
    return () => {
      vigente = false;
    };
  }, []);

  if (!llavePublica || estado === "cargando") return null;

  const activar = () =>
    startTransition(async () => {
      try {
        const nuevo = await activarAvisos(llavePublica);
        setEstado(nuevo);
        if (nuevo === "activo") toast.success("Listo: te avisaremos en este dispositivo.");
      } catch (e) {
        console.error("[avisos]", e);
        toast.error("No pudimos activar los avisos. Intenta de nuevo.");
      }
    });

  const desactivar = () =>
    startTransition(async () => {
      try {
        await desactivarAvisos();
        setEstado("inactivo");
      } catch {
        toast.error("No pudimos desactivar los avisos.");
      }
    });

  const probar = () =>
    startTransition(async () => {
      const { error } = await probarAviso();
      if (error) toast.error(error);
      else toast.success("Aviso enviado: debe llegarte en unos segundos.");
    });

  return (
    <div className={cn("flex flex-col gap-2 text-sm", className)}>
      {estado === "activo" ? (
        <>
          <p className="text-emerald-700">✓ Avisos activos en este dispositivo.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={ocupado} onClick={probar}>
              Probar aviso
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={ocupado}
              onClick={desactivar}
            >
              Desactivar aquí
            </Button>
          </div>
        </>
      ) : estado === "inactivo" ? (
        <>
          <p className="text-muted-foreground">
            Recibe un aviso en este {esIOS() || /Android/i.test(navigator.userAgent) ? "celular" : "computador"}{" "}
            cuando te pidan una máquina, aunque ECO-SIGN esté cerrado.
          </p>
          <Button size="sm" className="w-fit" disabled={ocupado} onClick={activar}>
            {ocupado ? "Activando…" : "🔔 Activar avisos aquí"}
          </Button>
        </>
      ) : estado === "bloqueado" ? (
        <p className="text-muted-foreground">
          Los avisos están <strong>bloqueados</strong> en este navegador. Para
          activarlos, toca el candado junto a la dirección (arriba), busca
          «Notificaciones» y elige «Permitir». Luego recarga la página.
        </p>
      ) : estado === "ios-sin-instalar" ? (
        <p className="text-muted-foreground">
          En iPhone los avisos sólo llegan si ECO-SIGN está en tu pantalla de
          inicio: en Safari toca <strong>Compartir</strong> (el cuadro con la
          flecha) → <strong>Agregar a inicio</strong>, abre ECO-SIGN desde ese
          ícono y vuelve aquí.
        </p>
      ) : (
        <p className="text-muted-foreground">
          Este navegador no admite avisos. Prueba con Chrome, Edge, Firefox o Safari.
        </p>
      )}
    </div>
  );
}
