"use client";

import { useActionState, useState } from "react";

import { registrarDesperdicio } from "./actions";
import { ESTADO_FORM_INICIAL } from "@/lib/form-state";
import type { OpcionMaterial } from "../inventario/formulario-sobrante";
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
import { Textarea } from "@/components/ui/textarea";
import { areaM2, formatearNumero } from "@/lib/format";

/** Registro de desperdicio, también con foto desde la cámara del móvil. */
export function FormularioDesperdicio({
  materiales,
}: {
  materiales: OpcionMaterial[];
}) {
  const [estado, accion, enviando] = useActionState(
    registrarDesperdicio,
    ESTADO_FORM_INICIAL,
  );

  return (
    <CamposDesperdicio
      key={estado.ok ? `guardado-${estado.marca}` : "editando"}
      materiales={materiales}
      accion={accion}
      enviando={enviando}
      error={estado.error}
    />
  );
}

function CamposDesperdicio({
  materiales,
  accion,
  enviando,
  error,
}: {
  materiales: OpcionMaterial[];
  accion: (formData: FormData) => void;
  enviando: boolean;
  error: string | null;
}) {
  const [ancho, setAncho] = useState("");
  const [alto, setAlto] = useState("");

  const comoNumero = (v: string) => {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const area = areaM2(comoNumero(ancho), comoNumero(alto));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar desperdicio</CardTitle>
        <CardDescription>
          Lo que se mide se puede reducir. Esta es tu línea base.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={accion} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="material_id">Material</Label>
            <select
              id="material_id"
              name="material_id"
              defaultValue=""
              required
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="" disabled>
                Elige un material
              </option>
              {materiales.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="ancho_cm">Ancho (cm)</Label>
              <Input
                id="ancho_cm"
                name="ancho_cm"
                type="number"
                step="0.1"
                min="0"
                inputMode="decimal"
                placeholder="150"
                value={ancho}
                onChange={(e) => setAncho(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="alto_cm">Alto (cm)</Label>
              <Input
                id="alto_cm"
                name="alto_cm"
                type="number"
                step="0.1"
                min="0"
                inputMode="decimal"
                placeholder="500"
                value={alto}
                onChange={(e) => setAlto(e.target.value)}
              />
            </div>
          </div>

          {area > 0 ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">
              Se perdieron <strong>{formatearNumero(area)} m²</strong>
            </p>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="cantidad">O cantidad directa</Label>
              <Input
                id="cantidad"
                name="cantidad"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="1.5"
              />
              <p className="text-xs text-muted-foreground">
                Para materiales que se cuentan por unidad. Si es una lámina o
                lona, escribe el ancho y el alto arriba.
              </p>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="motivo">Motivo</Label>
            <Textarea
              id="motivo"
              name="motivo"
              rows={2}
              placeholder="Error de corte, impresión defectuosa…"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="foto">Foto (opcional)</Label>
            <Input
              id="foto"
              name="foto"
              type="file"
              accept="image/*"
              capture="environment"
            />
          </div>

          {error ? (
            <p
              aria-live="polite"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={enviando}>
            {enviando ? "Guardando…" : "Registrar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
