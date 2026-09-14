"use client";

import { useActionState } from "react";

import { cerrarConRecortes } from "../actions";
import { ESTADO_FORM_INICIAL } from "@/lib/form-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatearMoneda, formatearNumero } from "@/lib/format";

/**
 * Calcula el desperdicio de recortes restando lo aprovechado al material
 * consumido.
 *
 * Existe porque de una lámina salen decenas de pedacitos que nadie va a medir
 * uno a uno. Se muestra la cuenta antes de registrarla para que se vea de dónde
 * sale el número.
 */
export function BotonRecortes({
  jobId,
  consumidoM2,
  aprovechadoM2,
  costoM2,
  yaCalculado,
}: {
  jobId: string;
  consumidoM2: number;
  aprovechadoM2: number;
  costoM2: number;
  yaCalculado: boolean;
}) {
  const [estado, accion, enviando] = useActionState(
    cerrarConRecortes,
    ESTADO_FORM_INICIAL,
  );

  const sobra = consumidoM2 - aprovechadoM2;
  const hayLamina = consumidoM2 > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recortes no aprovechables</CardTitle>
        <CardDescription>
          Los pedacitos que quedan de una lámina, sin medirlos uno a uno.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={accion} className="flex flex-col gap-4">
          <input type="hidden" name="job_id" value={jobId} />

          {!hayLamina ? (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Para calcular los recortes, registra primero la lámina que gastaste
              usando el modo <strong>Lámina</strong>, y las piezas que
              aprovechaste en modo <strong>Pieza</strong>.
            </p>
          ) : (
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Material consumido</span>
                <strong>{formatearNumero(consumidoM2)} m²</strong>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">
                  Aprovechado en piezas e Inventario
                </span>
                <strong>− {formatearNumero(aprovechadoM2)} m²</strong>
              </div>
              <div className="mt-2 flex justify-between border-t pt-2">
                <span className="font-medium">Se pierde en recortes</span>
                <strong className={sobra > 0 ? "text-destructive" : ""}>
                  {formatearNumero(Math.max(sobra, 0))} m²
                </strong>
              </div>
              {sobra > 0 && costoM2 > 0 ? (
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Costo</span>
                  <strong className="text-destructive">
                    {formatearMoneda(sobra * costoM2)}
                  </strong>
                </div>
              ) : null}
            </div>
          )}

          {estado.ok ? (
            <p
              aria-live="polite"
              className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            >
              Recortes registrados en Desperdicio.
            </p>
          ) : null}

          {estado.error ? (
            <p
              aria-live="polite"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {estado.error}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="outline"
            disabled={enviando || !hayLamina || sobra <= 0}
          >
            {enviando
              ? "Calculando…"
              : yaCalculado
                ? "Recalcular recortes"
                : "Registrar recortes"}
          </Button>

          {yaCalculado ? (
            <p className="text-xs text-muted-foreground">
              Ya hay recortes calculados para este trabajo. Recalcular los
              reemplaza, sin tocar el desperdicio que registraste a mano.
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
