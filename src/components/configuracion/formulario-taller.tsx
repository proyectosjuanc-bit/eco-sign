"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { actualizarTaller } from "@/app/(dashboard)/configuracion/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_FORM_INICIAL } from "@/lib/form-state";

export interface DatosTaller {
  nombre: string;
  nit: string | null;
  telefono: string | null;
  ciudad: string | null;
  direccion: string | null;
}

/** Datos de la empresa, editables por un admin. */
export function FormularioTaller({ taller }: { taller: DatosTaller }) {
  const [estado, accion, enviando] = useActionState(actualizarTaller, ESTADO_FORM_INICIAL);

  useEffect(() => {
    if (estado.ok) toast.success("Datos del taller guardados.");
  }, [estado]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos del taller</CardTitle>
        <CardDescription>
          El nombre aparece arriba en el panel, en la red de talleres y en los
          correos de invitación.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={accion} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="nombre">Nombre del taller</Label>
            <Input id="nombre" name="nombre" defaultValue={taller.nombre} maxLength={120} required />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="nit">NIT (opcional)</Label>
            <Input
              id="nit"
              name="nit"
              defaultValue={taller.nit ?? ""}
              maxLength={30}
              inputMode="numeric"
              placeholder="900.123.456-7"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="telefono">Teléfono (opcional)</Label>
            <Input
              id="telefono"
              name="telefono"
              type="tel"
              defaultValue={taller.telefono ?? ""}
              maxLength={20}
              placeholder="300 123 4567"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ciudad">Ciudad (opcional)</Label>
            <Input
              id="ciudad"
              name="ciudad"
              defaultValue={taller.ciudad ?? ""}
              maxLength={80}
              placeholder="Medellín"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="direccion">Dirección (opcional)</Label>
            <Input
              id="direccion"
              name="direccion"
              defaultValue={taller.direccion ?? ""}
              maxLength={200}
              placeholder="Cra 50 # 10-20"
            />
          </div>

          {estado.error ? (
            <p
              aria-live="polite"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2"
            >
              {estado.error}
            </p>
          ) : null}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={enviando}>
              {enviando ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
