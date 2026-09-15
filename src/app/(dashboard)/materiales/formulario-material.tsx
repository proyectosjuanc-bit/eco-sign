"use client";

import { useActionState, useState } from "react";

import { crearMaterial } from "./actions";
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
import { formatearMoneda, formatearNumero } from "@/lib/format";
import { areaLamina, costoPorM2, valorStock } from "@/lib/lamina";
import type { Unidad } from "@/types/database";

/**
 * Alta de material.
 *
 * Se pide el tamaño y el precio de la lámina, que es como lo factura el
 * proveedor, y la aplicación deriva el precio por m², que es la unidad con la
 * que se valoran consumos, sobrantes y desperdicio.
 */
export function FormularioMaterial() {
  const [estado, accion, enviando] = useActionState(
    crearMaterial,
    ESTADO_FORM_INICIAL,
  );

  return (
    <CamposMaterial
      key={estado.ok ? `guardado-${estado.marca}` : "editando"}
      accion={accion}
      enviando={enviando}
      error={estado.error}
    />
  );
}

/** Lee un campo numérico del formulario aceptando coma decimal. */
function comoNumero(valor: string): number | null {
  const limpio = valor.replace(",", ".").trim();
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function CamposMaterial({
  accion,
  enviando,
  error,
}: {
  accion: (formData: FormData) => void;
  enviando: boolean;
  error: string | null;
}) {
  const [unidad, setUnidad] = useState<Unidad>("m2");
  const [ancho, setAncho] = useState("");
  const [alto, setAlto] = useState("");
  const [costoLamina, setCostoLamina] = useState("");
  const [stock, setStock] = useState("");
  // Sólo se usa cuando el material no viene en láminas.
  const [costoM2Manual, setCostoM2Manual] = useState("");
  const [costoUnitarioManual, setCostoUnitarioManual] = useState("");

  const porUnidad = unidad === "unidad";

  const datos = {
    anchoCm: comoNumero(ancho),
    altoCm: comoNumero(alto),
    costoLamina: comoNumero(costoLamina),
  };

  const area = areaLamina(datos);
  const porM2 = costoPorM2(datos);
  const unidades = comoNumero(stock) ?? 0;
  const valor = valorStock({ ...datos, stockLaminas: unidades });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo material</CardTitle>
        <CardDescription>
          Láminas (acrílico, vinilo…) o materiales por unidad (tornillos,
          luces LED, estructuras). El costo por m² se calcula solo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={accion} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="tipo">Tipo</Label>
            <Input id="tipo" name="tipo" placeholder="Acrílico" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="color">Color</Label>
              <Input id="color" name="color" placeholder="Rojo" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="unidad">Se mide por</Label>
              <select
                id="unidad"
                name="unidad"
                value={unidad}
                onChange={(e) => setUnidad(e.target.value as Unidad)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="m2">Lámina (m²)</option>
                <option value="unidad">Unidad (tornillos, luces, piezas…)</option>
                <option value="metro_lineal">Metro lineal</option>
              </select>
            </div>
          </div>

          {porUnidad ? (
            <>
              <p className="text-xs text-muted-foreground">
                Para materiales que no se cortan, como tornillos, luces LED o
                una estructura metálica: sólo hace falta el precio de cada uno
                y cuántos tienes.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="grosor_mm">Grosor (mm, opcional)</Label>
                  <Input
                    id="grosor_mm"
                    name="grosor_mm"
                    type="number"
                    step="0.1"
                    min="0"
                    inputMode="decimal"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="stock_laminas">Existencias</Label>
                  <Input
                    id="stock_laminas"
                    name="stock_laminas"
                    type="number"
                    step="1"
                    min="0"
                    inputMode="numeric"
                    placeholder="50"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="costo_unitario">Precio por unidad</Label>
                <Input
                  id="costo_unitario"
                  name="costo_unitario"
                  type="number"
                  step="1"
                  min="0"
                  inputMode="decimal"
                  placeholder="1500"
                  value={costoUnitarioManual}
                  onChange={(e) => setCostoUnitarioManual(e.target.value)}
                />
              </div>
              {Number(stock) > 0 && Number(costoUnitarioManual) > 0 ? (
                <div className="rounded-md bg-muted p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Valor de {formatearNumero(Number(stock))} unidades
                    </span>
                    <strong>
                      {formatearMoneda(Number(stock) * Number(costoUnitarioManual))}
                    </strong>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="grosor_mm">Grosor (mm)</Label>
                <Input
                  id="grosor_mm"
                  name="grosor_mm"
                  type="number"
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  placeholder="3"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="ancho_cm">Ancho lámina (cm)</Label>
                  <Input
                    id="ancho_cm"
                    name="ancho_cm"
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
                  <Label htmlFor="alto_cm">Alto lámina (cm)</Label>
                  <Input
                    id="alto_cm"
                    name="alto_cm"
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

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="costo_lamina">Precio por lámina</Label>
                  <Input
                    id="costo_lamina"
                    name="costo_lamina"
                    type="number"
                    step="1"
                    min="0"
                    inputMode="decimal"
                    placeholder="250000"
                    value={costoLamina}
                    onChange={(e) => setCostoLamina(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="stock_laminas">Láminas que tienes</Label>
                  <Input
                    id="stock_laminas"
                    name="stock_laminas"
                    type="number"
                    step="1"
                    min="0"
                    inputMode="numeric"
                    placeholder="5"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                  />
                </div>
              </div>

              {area !== null ? (
                <div className="rounded-md bg-muted p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Área por lámina</span>
                    <strong>{formatearNumero(area)} m²</strong>
                  </div>
                  {porM2 !== null ? (
                    <div className="mt-1 flex justify-between">
                      <span className="text-muted-foreground">Costo por m²</span>
                      <strong className="text-emerald-600">
                        {formatearMoneda(porM2)}
                      </strong>
                    </div>
                  ) : null}
                  {valor > 0 ? (
                    <div className="mt-1 flex justify-between">
                      <span className="text-muted-foreground">
                        Valor de {formatearNumero(unidades)} láminas
                      </span>
                      <strong>{formatearMoneda(valor)}</strong>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="costo_unitario">
                  {porM2 !== null ? "Costo m² (calculado)" : "Costo por m²"}
                </Label>
                {/* Con lámina el precio se deriva y el campo sólo informa. Se
                    marca readOnly y no disabled, porque un campo deshabilitado
                    no se envía con el formulario. */}
                <Input
                  id="costo_unitario"
                  name="costo_unitario"
                  type="number"
                  step="1"
                  min="0"
                  inputMode="decimal"
                  placeholder="35000"
                  readOnly={porM2 !== null}
                  className={
                    porM2 !== null ? "bg-muted text-muted-foreground" : undefined
                  }
                  value={porM2 !== null ? String(Math.round(porM2)) : costoM2Manual}
                  onChange={(e) => setCostoM2Manual(e.target.value)}
                />
              </div>
            </>
          )}

          {error ? (
            <p
              aria-live="polite"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={enviando}>
            {enviando ? "Guardando…" : "Guardar material"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
