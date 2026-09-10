"use client";

import { useActionState, useEffect, useRef } from "react";

import { crearTrabajo } from "./actions";
import { ESTADO_FORM_INICIAL } from "@/lib/form-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Alta de trabajo. Las piezas se añaden luego, en el detalle. */
export function FormularioTrabajo() {
  const [estado, accion, enviando] = useActionState(
    crearTrabajo,
    ESTADO_FORM_INICIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok) formRef.current?.reset();
  }, [estado]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo trabajo</CardTitle>
        <CardDescription>
          Al guardarlo aparece en la lista. Ábrelo desde ahí para añadir sus
          piezas y registrar el consumo real.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={accion} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              name="nombre"
              placeholder="Valla fachada principal"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cliente">Cliente</Label>
            <Input id="cliente" name="cliente" placeholder="Almacenes León" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="fecha">Fecha</Label>
            <Input id="fecha" name="fecha" type="date" />
          </div>

          {estado.error ? (
            <p
              aria-live="polite"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {estado.error}
            </p>
          ) : null}

          <Button type="submit" disabled={enviando}>
            {enviando ? "Guardando…" : "Crear trabajo"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
