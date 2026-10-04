"use client";

import { useTransition } from "react";

import { cerrarSesion } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { desactivarAvisos } from "@/lib/notificaciones/dispositivo";

/**
 * Cierra la sesión con una Server Action y deshabilita el botón mientras corre.
 *
 * Antes quita los avisos push de este dispositivo: si otra persona usa
 * después el mismo PC, no debe recibir los avisos del taller.
 */
export function BotonLogout() {
  const [enviando, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={enviando}
      onClick={() =>
        startTransition(async () => {
          // Sin bloquear la salida si el navegador tarda o falla.
          await Promise.race([
            desactivarAvisos().catch(() => undefined),
            new Promise((listo) => setTimeout(listo, 1500)),
          ]);
          await cerrarSesion();
        })
      }
    >
      {enviando ? "Saliendo…" : "Salir"}
    </Button>
  );
}
