"use client";

import { useActionState, useState } from "react";

import { agregarPieza } from "../actions";
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
import { Textarea } from "@/components/ui/textarea";
import { CampoFoto } from "@/components/dashboard/campo-foto";
import { areaM2, formatearNumero } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ModoPieza } from "@/types/database";
import type { OpcionMaterial } from "../../inventario/formulario-sobrante";

/**
 * Añade consumo a un trabajo, en uno de dos modos.
 *
 * "Pieza" es un corte individual y admite cantidad. "Lámina" es el material
 * total gastado de un tipo: sirve cuando se aprovechó una plancha entera y
 * contar los cortes uno a uno daría un consumo menor que el real, inflando el
 * ahorro. El cálculo por debajo es el mismo, ancho × alto × cantidad.
 */
export function FormularioPieza({
  jobId,
  materiales,
}: {
  jobId: string;
  materiales: OpcionMaterial[];
}) {
  const [estado, accion, enviando] = useActionState(
    agregarPieza,
    ESTADO_FORM_INICIAL,
  );

  return (
    <CamposPieza
      key={estado.ok ? `guardado-${estado.marca}` : "editando"}
      jobId={jobId}
      materiales={materiales}
      accion={accion}
      enviando={enviando}
      error={estado.error}
    />
  );
}

function CamposPieza({
  jobId,
  materiales,
  accion,
  enviando,
  error,
}: {
  jobId: string;
  materiales: OpcionMaterial[];
  accion: (formData: FormData) => void;
  enviando: boolean;
  error: string | null;
}) {
  const [modo, setModo] = useState<ModoPieza>("pieza");
  const [ancho, setAncho] = useState("");
  const [alto, setAlto] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [comprimiendo, setComprimiendo] = useState(false);

  const unidades = modo === "lamina" ? 1 : Math.max(Number(cantidad) || 0, 0);
  const area =
    areaM2(
      Number(ancho.replace(",", ".")) || 0,
      Number(alto.replace(",", ".")) || 0,
    ) * unidades;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Añadir consumo</CardTitle>
        <CardDescription>
          {modo === "pieza"
            ? "Las medidas de cada corte definen el consumo teórico."
            : "Registra la lámina completa que gastaste, no cada corte."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={accion} className="flex flex-col gap-4">
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="modo" value={modo} />

          <div className="grid gap-2">
            <Label>Modo de registro</Label>
            <div className="grid grid-cols-2 gap-2">
              <BotonModo
                activo={modo === "pieza"}
                onClick={() => setModo("pieza")}
                titulo="Pieza"
                detalle="Un corte, con cantidad"
              />
              <BotonModo
                activo={modo === "lamina"}
                onClick={() => setModo("lamina")}
                titulo="Lámina"
                detalle="El material gastado"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {modo === "pieza"
                ? "Si aprovechaste una plancha entera para varios cortes, usa Lámina: así el ahorro no sale inflado."
                : "Anota el alto y ancho del material que consumiste de este tipo."}
            </p>
          </div>

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
            {!materiales.length ? (
              <p className="text-xs text-destructive">
                No tienes materiales. Crea uno en Materiales antes de añadir
                consumo.
              </p>
            ) : null}
          </div>

          <div
            className={cn(
              "grid gap-3",
              modo === "pieza" ? "grid-cols-3" : "grid-cols-2",
            )}
          >
            <div className="grid gap-2">
              <Label htmlFor="ancho_cm">Ancho (cm)</Label>
              <Input
                id="ancho_cm"
                name="ancho_cm"
                type="number"
                step="0.1"
                min="0"
                inputMode="decimal"
                value={ancho}
                onChange={(evento) => setAncho(evento.target.value)}
                required
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
                value={alto}
                onChange={(evento) => setAlto(evento.target.value)}
                required
              />
            </div>
            {modo === "pieza" ? (
              <div className="grid gap-2">
                <Label htmlFor="cantidad">Cantidad</Label>
                <Input
                  id="cantidad"
                  name="cantidad"
                  type="number"
                  step="1"
                  min="1"
                  inputMode="numeric"
                  value={cantidad}
                  onChange={(evento) => setCantidad(evento.target.value)}
                />
              </div>
            ) : null}
          </div>

          {area > 0 ? (
            <p className="text-sm text-muted-foreground">
              Consumo: <strong>{formatearNumero(area)} m²</strong>
            </p>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              name="descripcion"
              rows={2}
              placeholder="Letra corpórea, forma irregular…"
            />
            <p className="text-xs text-muted-foreground">
              ¿Forma irregular? Anota el ancho y alto del rectángulo que la
              contiene: es el material que de verdad se consume. El recorte
              sobrante regístralo en Inventario o Desperdicio.
            </p>
          </div>

          <CampoFoto etiqueta="Foto de la pieza" onEstadoChange={setComprimiendo} />

          {error ? (
            <p
              aria-live="polite"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={enviando || comprimiendo}>
            {comprimiendo
              ? "Preparando foto…"
              : enviando
                ? "Añadiendo…"
                : "Añadir al trabajo"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function BotonModo({
  activo,
  onClick,
  titulo,
  detalle,
}: {
  activo: boolean;
  onClick: () => void;
  titulo: string;
  detalle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "rounded-md border px-3 py-2 text-left transition-colors",
        activo
          ? "border-emerald-600 bg-emerald-50 text-emerald-900"
          : "border-input hover:bg-muted",
      )}
    >
      <span className="block text-sm font-medium">{titulo}</span>
      <span
        className={cn(
          "block text-xs",
          activo ? "text-emerald-700" : "text-muted-foreground",
        )}
      >
        {detalle}
      </span>
    </button>
  );
}
