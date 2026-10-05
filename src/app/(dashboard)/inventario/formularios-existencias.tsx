"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { corregirCantidad, entradaMaterial } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_FORM_INICIAL } from "@/lib/form-state";
import { formatearNumero } from "@/lib/format";
import type { Unidad } from "@/types/database";

export interface MaterialEntrada {
  id: string;
  etiqueta: string;
  unidad: Unidad;
  ancho_cm: number | null;
  alto_cm: number | null;
}

const CLASE_SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Entrada de material: una compra, o lo que ya hay en bodega al empezar.
 * Pregunta láminas, metros o unidades según cómo se mide el material.
 */
export function FormularioEntrada({ materiales }: { materiales: MaterialEntrada[] }) {
  const [estado, accion, enviando] = useActionState(entradaMaterial, ESTADO_FORM_INICIAL);

  useEffect(() => {
    if (estado.ok) toast.success("Entrada registrada en el inventario.");
  }, [estado]);

  return (
    // Cada entrada correcta remonta los campos limpios (nueva key).
    <CamposEntrada
      key={estado.ok ? `ok-${estado.marca}` : "editando"}
      materiales={materiales}
      accion={accion}
      enviando={enviando}
      error={estado.error}
    />
  );
}

function CamposEntrada({
  materiales,
  accion,
  enviando,
  error,
}: {
  materiales: MaterialEntrada[];
  accion: (fd: FormData) => void;
  enviando: boolean;
  error: string | null;
}) {
  const [materialId, setMaterialId] = useState("");
  const elegido = materiales.find((m) => m.id === materialId);
  const pregunta =
    elegido?.unidad === "unidad"
      ? "¿Cuántas unidades entran?"
      : elegido?.unidad === "metro_lineal"
        ? "¿Cuántos metros entran?"
        : elegido?.unidad === "ml"
          ? "¿Cuántos ml entran? (1 litro = 1000 ml)"
          : "¿Cuántas láminas completas entran?";
  const sinTamano = elegido?.unidad === "m2" && (!elegido.ancho_cm || !elegido.alto_cm);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrada de material</CardTitle>
        <CardDescription>
          Registra lo que compras (o lo que ya tienes en bodega al empezar):
          láminas completas, metros de rollo, unidades o líquidos (ml).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!materiales.length ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Primero crea tus materiales (con su precio) en <strong>Materiales</strong>.
          </p>
        ) : (
          <form action={accion} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="material_entrada">Material</Label>
              <select
                id="material_entrada"
                name="material_id"
                value={materialId}
                onChange={(e) => setMaterialId(e.target.value)}
                required
                className={CLASE_SELECT}
              >
                <option value="" disabled>
                  Elige el material
                </option>
                {materiales.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </div>

            {elegido ? (
              <div className="grid gap-2">
                <Label htmlFor="cantidad_entrada">{pregunta}</Label>
                <Input
                  id="cantidad_entrada"
                  name="cantidad"
                  type="number"
                  inputMode="decimal"
                  min={elegido.unidad === "metro_lineal" ? "0.1" : "1"}
                  step={elegido.unidad === "metro_lineal" ? "0.1" : "1"}
                  required
                />
                {elegido.unidad === "m2" && !sinTamano ? (
                  <p className="text-xs text-muted-foreground">
                    Láminas de {formatearNumero(elegido.ancho_cm ?? 0)} × {formatearNumero(elegido.alto_cm ?? 0)} cm (el tamaño del catálogo).
                  </p>
                ) : null}
                {sinTamano ? (
                  <p className="text-xs text-destructive">
                    Este material no tiene tamaño de lámina. Agrégalo en Materiales antes de registrar láminas.
                  </p>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p aria-live="polite" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={enviando || !elegido || sinTamano}>
              {enviando ? "Registrando…" : "Registrar entrada"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

/** Corregir cuánto hay (después de contar la bodega). */
export function CorregirCantidad({
  id,
  cantidad,
  decimales,
}: {
  id: string;
  cantidad: number;
  /** Metros admiten decimales; láminas y unidades, no. */
  decimales: boolean;
}) {
  const [estado, accion, enviando] = useActionState(corregirCantidad, ESTADO_FORM_INICIAL);
  const [abierto, setAbierto] = useState(false);

  // Al llegar un resultado nuevo: si salió bien, se cierra el campo. Se hace
  // durante el render comparando con el último visto (patrón de React), no
  // desde un efecto.
  const [ultimoVisto, setUltimoVisto] = useState(estado);
  if (estado !== ultimoVisto) {
    setUltimoVisto(estado);
    if (estado.ok) setAbierto(false);
  }

  useEffect(() => {
    if (estado.ok) toast.success("Cantidad corregida.");
    else if (estado.error) toast.error(estado.error);
  }, [estado]);

  if (!abierto) {
    return (
      <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAbierto(true)}>
        Corregir
      </Button>
    );
  }

  return (
    <form action={accion} className="flex items-center justify-end gap-1">
      <input type="hidden" name="id" value={id} />
      <Input
        name="cantidad"
        type="number"
        aria-label="Cantidad real"
        min="0"
        step={decimales ? "0.1" : "1"}
        defaultValue={cantidad}
        className="h-8 w-20"
        autoFocus
        required
      />
      <Button type="submit" size="sm" disabled={enviando}>
        {enviando ? "…" : "Guardar"}
      </Button>
    </form>
  );
}
