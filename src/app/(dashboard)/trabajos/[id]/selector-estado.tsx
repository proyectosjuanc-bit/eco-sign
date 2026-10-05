"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { cambiarEstado } from "../actions";
import type { EstadoTrabajo } from "@/types/database";

const ESTADOS: { valor: EstadoTrabajo; etiqueta: string }[] = [
  { valor: "pendiente", etiqueta: "Pendiente" },
  { valor: "en_proceso", etiqueta: "En proceso" },
  { valor: "terminado", etiqueta: "Terminado" },
];

/**
 * Estado del trabajo: se guarda al elegirlo, sin botón aparte.
 *
 * Es una lista controlada a propósito. Con un formulario y `defaultValue`,
 * React limpia el formulario al terminar la acción y la lista volvía a mostrar
 * el estado con el que se abrió la página, aunque en la base sí quedaba
 * guardado el nuevo.
 */
export function SelectorEstado({ jobId, estado }: { jobId: string; estado: EstadoTrabajo }) {
  const [actual, setActual] = useState(estado);
  const [guardando, startTransition] = useTransition();

  const cambiar = (nuevo: EstadoTrabajo) => {
    const anterior = actual;
    setActual(nuevo);
    startTransition(async () => {
      const { error } = await cambiarEstado(jobId, nuevo);
      if (error) {
        setActual(anterior);
        toast.error(error);
      } else {
        toast.success(`Estado guardado: ${ESTADOS.find((e) => e.valor === nuevo)?.etiqueta}.`);
      }
    });
  };

  return (
    <select
      aria-label="Estado del trabajo"
      value={actual}
      disabled={guardando}
      onChange={(e) => cambiar(e.target.value as EstadoTrabajo)}
      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60"
    >
      {ESTADOS.map((e) => (
        <option key={e.valor} value={e.valor}>
          {e.etiqueta}
        </option>
      ))}
    </select>
  );
}
