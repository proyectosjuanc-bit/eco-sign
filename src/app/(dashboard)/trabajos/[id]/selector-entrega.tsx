"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { cambiarEntrega } from "../actions";
import { formatearFecha } from "@/lib/format";

/**
 * Fecha de entrega del trabajo, editable desde su detalle: se guarda al
 * elegirla (como el estado). Vacía = sin fecha de entrega.
 */
export function SelectorEntrega({ jobId, fecha }: { jobId: string; fecha: string | null }) {
  const [actual, setActual] = useState(fecha ?? "");
  const [guardando, startTransition] = useTransition();

  const cambiar = (nueva: string) => {
    const anterior = actual;
    setActual(nueva);
    startTransition(async () => {
      const { error } = await cambiarEntrega(jobId, nueva || null);
      if (error) {
        setActual(anterior);
        toast.error(error);
      } else {
        toast.success(nueva ? `Entrega: ${formatearFecha(nueva)}.` : "Sin fecha de entrega.");
      }
    });
  };

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="hidden sm:inline">Entrega</span>
      <input
        type="date"
        aria-label="Fecha de entrega"
        value={actual}
        disabled={guardando}
        onChange={(e) => cambiar(e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground disabled:opacity-60"
      />
    </label>
  );
}
