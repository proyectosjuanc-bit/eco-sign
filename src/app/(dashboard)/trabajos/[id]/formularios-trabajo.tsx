"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { registrarPieza, registrarSobranteDeCorte, sacarDelInventario } from "../actions";
import { CalculadoraLiquido } from "./calculadora-liquido";
import { TintasImpresion } from "./tintas-impresion";
import { CampoFoto } from "@/components/dashboard/campo-foto";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_FORM_INICIAL, type EstadoForm } from "@/lib/form-state";
import { formatearNumero } from "@/lib/format";
import { FOTOS_ACTIVAS } from "@/lib/funciones";
import { admiteDecimales, describirCantidad, retalAlcanza } from "@/lib/inventario";
import type { ClaseInventario } from "@/types/database";

const CLASE_SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Lo que se puede sacar del inventario, ya preparado por la página. */
export interface OpcionInventario {
  id: string;
  clase: ClaseInventario;
  material: string;
  codigo: string | null;
  ancho_cm: number;
  alto_cm: number;
  cantidad: number;
  material_id: string;
  /** Precio de 1 unidad, metro o ml (para mostrar el costo en la calculadora). */
  precio: number;
  /** Líquidos: ml por m² guardados por el taller. */
  ml_por_m2: number | null;
}

/** Un material del catálogo para piezas y sobrantes. */
export interface OpcionMaterialTrabajo {
  id: string;
  etiqueta: string;
}

function MensajeError({ estado }: { estado: EstadoForm }) {
  return estado.error ? (
    <p aria-live="polite" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {estado.error}
    </p>
  ) : null;
}

/** Avisa el éxito con un toast y devuelve una clave para remontar el formulario limpio. */
function useExito(estado: EstadoForm, mensaje: string) {
  useEffect(() => {
    if (estado.ok) toast.success(mensaje);
    // Sólo reacciona al resultado de cada envío.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);
  return estado.ok ? `ok-${estado.marca}` : "editando";
}

// ---------------------------------------------------------------------------
// 1. Sacar del inventario
// ---------------------------------------------------------------------------

export function FormularioSalida({
  jobId,
  opciones,
  preseleccion,
}: {
  jobId: string;
  opciones: OpcionInventario[];
  preseleccion: string | null;
}) {
  const [estado, accion, enviando] = useActionState(sacarDelInventario, ESTADO_FORM_INICIAL);
  const clave = useExito(estado, "Material sacado del inventario.");

  // Tintas: los líquidos que se llaman «tinta…». Si el taller no les puso ese
  // nombre, se ofrecen todos sus líquidos.
  const liquidos = opciones.filter((o) => o.clase === "mililitros");
  const tintas = liquidos.some((o) => /tinta/i.test(o.material))
    ? liquidos.filter((o) => /tinta/i.test(o.material))
    : liquidos;

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Sacar del inventario</CardTitle>
        <CardDescription>
          Todo lo que usas sale de tu inventario: láminas completas, retales,
          metros, unidades o líquidos (tinta, adhesivo) en ml. Usar un retal
          cuenta como ahorro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CamposSalida
          key={clave}
          jobId={jobId}
          opciones={opciones}
          preseleccion={estado.ok ? null : preseleccion}
          accion={accion}
          enviando={enviando}
          estado={estado}
        />
        {tintas.length ? (
          <div className="mt-4 border-t pt-4">
            <TintasImpresion jobId={jobId} tintas={tintas} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CamposSalida({
  jobId,
  opciones,
  preseleccion,
  accion,
  enviando,
  estado,
}: {
  jobId: string;
  opciones: OpcionInventario[];
  preseleccion: string | null;
  accion: (fd: FormData) => void;
  enviando: boolean;
  estado: EstadoForm;
}) {
  const [itemId, setItemId] = useState(
    preseleccion && opciones.some((o) => o.id === preseleccion) ? preseleccion : "",
  );
  // Medida que necesita la pieza (opcional): sirve para ofrecer primero los
  // retales que alcanzan, antes de abrir una lámina completa.
  const [anchoNecesario, setAnchoNecesario] = useState("");
  const [altoNecesario, setAltoNecesario] = useState("");
  const [cantidad, setCantidad] = useState("1");

  const ancho = Number(anchoNecesario.replace(",", ".")) || 0;
  const alto = Number(altoNecesario.replace(",", ".")) || 0;
  const conMedida = ancho > 0 && alto > 0;

  const grupos = useMemo(() => {
    const retales = opciones.filter((o) => o.clase === "retal");
    const alcanzan = conMedida ? retales.filter((r) => retalAlcanza(r, ancho, alto)) : [];
    const otrosRetales = conMedida ? retales.filter((r) => !retalAlcanza(r, ancho, alto)) : retales;
    return [
      { titulo: "Retales que alcanzan para esa medida", items: alcanzan },
      { titulo: conMedida ? "Retales más pequeños" : "Retales", items: otrosRetales },
      { titulo: "Láminas completas", items: opciones.filter((o) => o.clase === "lamina") },
      { titulo: "Rollos (metros)", items: opciones.filter((o) => o.clase === "metros") },
      { titulo: "Unidades", items: opciones.filter((o) => o.clase === "unidades") },
      { titulo: "Líquidos (ml)", items: opciones.filter((o) => o.clase === "mililitros") },
    ].filter((g) => g.items.length);
  }, [opciones, conMedida, ancho, alto]);

  const elegido = opciones.find((o) => o.id === itemId);
  const retalesQueAlcanzan = grupos[0]?.titulo.startsWith("Retales que alcanzan") ? grupos[0].items.length : 0;

  if (!opciones.length) {
    return (
      <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
        Tu inventario está vacío. Registra lo que tienes en{" "}
        <strong>Inventario → Entrada de material</strong> antes de sacar algo para un trabajo.
      </p>
    );
  }

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="job_id" value={jobId} />

      <div className="grid gap-2">
        <Label>¿Qué medida necesitas? (opcional)</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            inputMode="decimal"
            placeholder="Ancho cm"
            aria-label="Ancho que necesitas en cm"
            value={anchoNecesario}
            onChange={(e) => setAnchoNecesario(e.target.value)}
          />
          <Input
            inputMode="decimal"
            placeholder="Alto cm"
            aria-label="Alto que necesitas en cm"
            value={altoNecesario}
            onChange={(e) => setAltoNecesario(e.target.value)}
          />
        </div>
        {conMedida ? (
          <p className="text-xs text-emerald-700">
            {retalesQueAlcanzan
              ? `Tienes ${retalesQueAlcanzan} ${retalesQueAlcanzan === 1 ? "retal que alcanza" : "retales que alcanzan"}: úsalo antes de abrir una lámina nueva.`
              : "Ningún retal alcanza para esa medida."}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="inventory_item_id">Material</Label>
        <select
          id="inventory_item_id"
          name="inventory_item_id"
          value={itemId}
          onChange={(e) => {
            setItemId(e.target.value);
            setCantidad("1");
          }}
          required
          className={CLASE_SELECT}
        >
          <option value="" disabled>
            Elige del inventario
          </option>
          {grupos.map((g) => (
            <optgroup key={g.titulo} label={g.titulo}>
              {g.items.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.codigo ? `${o.codigo} · ` : ""}
                  {o.material} — {describirCantidad(o)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {elegido?.clase === "retal" ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          El retal sale entero ({formatearNumero(elegido.ancho_cm)} × {formatearNumero(elegido.alto_cm)} cm).
          Lo que te sobre, devuélvelo en el paso 3.
        </p>
      ) : null}

      {elegido && elegido.clase !== "retal" ? (
        <div className="grid gap-2">
          <Label htmlFor="cantidad_salida">
            {elegido.clase === "lamina"
              ? "¿Cuántas láminas sacas?"
              : elegido.clase === "metros"
                ? "¿Cuántos metros usas?"
                : elegido.clase === "mililitros"
                  ? "¿Cuántos ml usas?"
                  : "¿Cuántas unidades usas?"}
          </Label>
          <Input
            id="cantidad_salida"
            name="cantidad"
            type="number"
            inputMode="decimal"
            min={admiteDecimales(elegido.clase) ? "0.1" : "1"}
            step={admiteDecimales(elegido.clase) ? "0.1" : "1"}
            max={elegido.cantidad}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            Hay {describirCantidad(elegido)} en el inventario.
          </p>
          {elegido.clase === "mililitros" ? (
            <CalculadoraLiquido
              key={elegido.id}
              materialId={elegido.material_id}
              mlPorM2Guardado={elegido.ml_por_m2}
              precioMl={elegido.precio}
              anchoInicial={anchoNecesario}
              altoInicial={altoNecesario}
              onUsar={(ml) => setCantidad(String(ml))}
            />
          ) : null}
        </div>
      ) : null}

      <MensajeError estado={estado} />

      <Button type="submit" disabled={enviando || !itemId}>
        {enviando ? "Sacando…" : "Sacar del inventario"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 2. Piezas que entregas
// ---------------------------------------------------------------------------

export function FormularioPiezaEntregada({
  jobId,
  materiales,
}: {
  jobId: string;
  materiales: OpcionMaterialTrabajo[];
}) {
  const [estado, accion, enviando] = useActionState(registrarPieza, ESTADO_FORM_INICIAL);
  const clave = useExito(estado, "Pieza registrada.");
  const [comprimiendo, setComprimiendo] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Piezas que entregas</CardTitle>
        <CardDescription>
          Las medidas de lo que se lleva el cliente (por ejemplo, el acrílico de
          50 × 50). Así se sabe cuánto se perdió en recortes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!materiales.length ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Primero saca del inventario el material que vas a cortar.
          </p>
        ) : (
          <form key={clave} action={accion} className="flex flex-col gap-4">
            <input type="hidden" name="job_id" value={jobId} />
            <div className="grid gap-2">
              <Label htmlFor="material_pieza">Material</Label>
              <select id="material_pieza" name="material_id" required defaultValue={materiales.length === 1 ? materiales[0].id : ""} className={CLASE_SELECT}>
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
            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="ancho_pieza">Ancho (cm)</Label>
                <Input id="ancho_pieza" name="ancho_cm" inputMode="decimal" placeholder="50" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="alto_pieza">Alto (cm)</Label>
                <Input id="alto_pieza" name="alto_cm" inputMode="decimal" placeholder="50" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cantidad_pieza">Cantidad</Label>
                <Input id="cantidad_pieza" name="cantidad" type="number" min="1" step="1" defaultValue="1" required />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="descripcion_pieza">Descripción (opcional)</Label>
              <Input id="descripcion_pieza" name="descripcion" placeholder="Letra corpórea, forma irregular…" />
            </div>
            {FOTOS_ACTIVAS ? <CampoFoto etiqueta="Foto de la pieza" onEstadoChange={setComprimiendo} /> : null}
            <MensajeError estado={estado} />
            <Button type="submit" variant="outline" disabled={enviando || comprimiendo}>
              {comprimiendo ? "Preparando foto…" : enviando ? "Guardando…" : "Registrar pieza"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Devolver sobrante
// ---------------------------------------------------------------------------

export function FormularioDevolver({
  jobId,
  materiales,
}: {
  jobId: string;
  materiales: OpcionMaterialTrabajo[];
}) {
  const [estado, accion, enviando] = useActionState(registrarSobranteDeCorte, ESTADO_FORM_INICIAL);
  const clave = useExito(estado, "Sobrante devuelto al inventario con su código.");
  const [comprimiendo, setComprimiendo] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Devolver sobrante</CardTitle>
        <CardDescription>
          Lo que te sobró y se puede volver a usar vuelve al inventario como un
          retal, con su código SOB. Escríbelo con marcador sobre el material.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!materiales.length ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Aquí devolverás lo que sobre de las láminas o retales que saques.
          </p>
        ) : (
          <form key={clave} action={accion} className="flex flex-col gap-4">
            <input type="hidden" name="job_id" value={jobId} />
            <div className="grid gap-2">
              <Label htmlFor="material_devuelto">Material</Label>
              <select id="material_devuelto" name="material_id" required defaultValue={materiales.length === 1 ? materiales[0].id : ""} className={CLASE_SELECT}>
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
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="ancho_devuelto">Ancho (cm)</Label>
                <Input id="ancho_devuelto" name="ancho_cm" inputMode="decimal" placeholder="120" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="alto_devuelto">Alto (cm)</Label>
                <Input id="alto_devuelto" name="alto_cm" inputMode="decimal" placeholder="130" required />
              </div>
            </div>
            {FOTOS_ACTIVAS ? <CampoFoto etiqueta="Foto del sobrante" onEstadoChange={setComprimiendo} /> : null}
            <MensajeError estado={estado} />
            <Button type="submit" variant="outline" disabled={enviando || comprimiendo}>
              {comprimiendo ? "Preparando foto…" : enviando ? "Guardando…" : "Devolver al inventario"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
