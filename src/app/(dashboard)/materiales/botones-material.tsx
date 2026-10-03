"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { eliminarMaterial, restaurarMaterial } from "./actions";
import { Button } from "@/components/ui/button";

/**
 * Eliminar con confirmación. Si el material tiene historial, el servidor lo
 * archiva en lugar de borrarlo y el aviso lo explica.
 */
export function BotonEliminarMaterial({ id, nombre }: { id: string; nombre: string }) {
  const [enCurso, iniciar] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-destructive"
      disabled={enCurso}
      onClick={() => {
        const seguro = window.confirm(
          `¿Eliminar «${nombre}»?\n\nSi ya tiene sobrantes, desperdicio o piezas registradas, no se borra: se archiva y conservas su historial.`,
        );
        if (!seguro) return;
        iniciar(async () => {
          const r = await eliminarMaterial(id);
          if (r.ok) toast.success(r.mensaje);
          else toast.error(r.mensaje);
        });
      }}
    >
      {enCurso ? "Eliminando…" : "Eliminar"}
    </Button>
  );
}

export function BotonRestaurarMaterial({ id }: { id: string }) {
  const [enCurso, iniciar] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={enCurso}
      onClick={() =>
        iniciar(async () => {
          const r = await restaurarMaterial(id);
          if (r.ok) toast.success(r.mensaje);
          else toast.error(r.mensaje);
        })
      }
    >
      {enCurso ? "Restaurando…" : "Restaurar"}
    </Button>
  );
}
