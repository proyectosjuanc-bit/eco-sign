"use client";

import { useActionState, useState } from "react";

import { registrarConsumoReal } from "../actions";
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
import { areaM2, formatearMoneda, formatearNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Cierra el trabajo con el consumo real.
 *
 * Si se gastó menos de lo teórico, la diferencia se guarda como ahorro por
 * optimización y aparece en el dashboard.
 */
export function FormularioConsumo({
  jobId,
  consumoTeorico,
  costoM2,
}: {
  jobId: string;
  consumoTeorico: number;
  costoM2: number;
}) {
  const [estado, accion, enviando] = useActionState(
    registrarConsumoReal,
    ESTADO_FORM_INICIAL,
  );

  return (
    <CamposConsumo
      key={estado.ok ? `guardado-${estado.marca}` : "editando"}
      jobId={jobId}
      consumoTeorico={consumoTeorico}
      costoM2={costoM2}
      accion={accion}
      enviando={enviando}
      error={estado.error}
      guardado={estado.ok}
    />
  );
}

function comoNumero(valor: string): number {
  const n = Number(valor.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function CamposConsumo({
  jobId,
  consumoTeorico,
  costoM2,
  accion,
  enviando,
  error,
  guardado,
}: {
  jobId: string;
  consumoTeorico: number;
  costoM2: number;
  accion: (formData: FormData) => void;
  enviando: boolean;
  error: string | null;
  guardado: boolean;
}) {
  // Por medidas cuando fue una pieza sola; en m² cuando se suman varias.
  const [porMedidas, setPorMedidas] = useState(true);
  const [ancho, setAncho] = useState("");
  const [alto, setAlto] = useState("");
  const [metros, setMetros] = useState("");

  const consumoReal = porMedidas
    ? areaM2(comoNumero(ancho), comoNumero(alto))
    : comoNumero(metros);

  const diferencia = consumoTeorico - consumoReal;
  const ahorro = diferencia > 0 ? diferencia * costoM2 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consumo real</CardTitle>
        <CardDescription>
          Lo que se gastó de verdad al ejecutar el trabajo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={accion} className="flex flex-col gap-4">
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="consumo_teorico_m2" value={consumoTeorico} />
          <input type="hidden" name="costo_m2" value={costoM2} />
          {/* La acción recibe siempre m², vengan de medidas o escritos. */}
          <input
            type="hidden"
            name="consumo_real_m2"
            value={consumoReal.toFixed(4)}
          />

          <div className="rounded-md bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Consumo teórico</span>
              <strong>{formatearNumero(consumoTeorico)} m²</strong>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Costo por m²</span>
              <strong>{formatearMoneda(costoM2)}</strong>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <BotonModo
              activo={porMedidas}
              onClick={() => setPorMedidas(true)}
              titulo="Por medidas"
              detalle="Ancho × alto en cm"
            />
            <BotonModo
              activo={!porMedidas}
              onClick={() => setPorMedidas(false)}
              titulo="En m²"
              detalle="Si suma varias piezas"
            />
          </div>

          {porMedidas ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="ancho_real_cm">Ancho (cm)</Label>
                <Input
                  id="ancho_real_cm"
                  type="number"
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  placeholder="120"
                  value={ancho}
                  onChange={(e) => setAncho(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="alto_real_cm">Alto (cm)</Label>
                <Input
                  id="alto_real_cm"
                  type="number"
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  placeholder="180"
                  value={alto}
                  onChange={(e) => setAlto(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="metros_reales">Consumo real (m²)</Label>
              <Input
                id="metros_reales"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder={String(consumoTeorico)}
                value={metros}
                onChange={(e) => setMetros(e.target.value)}
              />
            </div>
          )}

          {consumoReal > 0 ? (
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Consumo real</span>
                <strong>{formatearNumero(consumoReal)} m²</strong>
              </div>
              <div className="mt-2 flex justify-between border-t pt-2">
                <span className="font-medium">
                  {diferencia > 0 ? "Ahorro" : "Exceso sobre lo previsto"}
                </span>
                <strong
                  className={diferencia > 0 ? "text-emerald-600" : "text-muted-foreground"}
                >
                  {diferencia > 0
                    ? formatearMoneda(ahorro)
                    : `${formatearNumero(Math.abs(diferencia))} m² de más`}
                </strong>
              </div>
            </div>
          ) : null}

          {guardado ? (
            <p
              aria-live="polite"
              className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            >
              Consumo registrado. Si hubo ahorro, ya está en el dashboard.
            </p>
          ) : null}

          {error ? (
            <p
              aria-live="polite"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={enviando || consumoReal <= 0}>
            {enviando ? "Registrando…" : "Registrar consumo"}
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
