"use client";

import { useActionState, useMemo, useState } from "react";

import { agregarPieza, registrarSobranteDeCorte } from "../actions";
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

export interface OpcionLamina {
  id: string;
  etiqueta: string;
  ancho_cm: number;
  alto_cm: number;
  stock_laminas: number;
}

export interface OpcionSobrante {
  id: string;
  codigo: string | null;
  material_id: string;
  ancho_cm: number;
  alto_cm: number;
  etiqueta: string;
}

type OrigenMaterial = "manual" | "lamina" | "sobrante";

/**
 * Añade consumo a un trabajo, en uno de dos modos.
 *
 * "Pieza" es un corte individual y admite cantidad. "Lámina" es el material
 * total gastado de un tipo: sirve cuando se aprovechó una plancha entera y
 * contar los cortes uno a uno daría un consumo menor que el real, inflando el
 * ahorro. El cálculo por debajo es el mismo, ancho × alto × cantidad.
 *
 * Antes de escribir medidas, se elige de dónde sale el material: a mano (como
 * siempre), de una lámina nueva de stock, o de un sobrante ya guardado en
 * Inventario. Elegir un sobrante cierra su código al guardar la pieza.
 */
export function FormularioPieza({
  jobId,
  materiales,
  laminas,
  sobrantes,
  origenSobranteId,
}: {
  jobId: string;
  materiales: OpcionMaterial[];
  laminas: OpcionLamina[];
  sobrantes: OpcionSobrante[];
  origenSobranteId: string | null;
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
      laminas={laminas}
      sobrantes={sobrantes}
      origenSobranteId={origenSobranteId}
      accion={accion}
      enviando={enviando}
      error={estado.error}
    />
  );
}

function CamposPieza({
  jobId,
  materiales,
  laminas,
  sobrantes,
  origenSobranteId,
  accion,
  enviando,
  error,
}: {
  jobId: string;
  materiales: OpcionMaterial[];
  laminas: OpcionLamina[];
  sobrantes: OpcionSobrante[];
  origenSobranteId: string | null;
  accion: (formData: FormData) => void;
  enviando: boolean;
  error: string | null;
}) {
  const sobrantePrecargado = origenSobranteId
    ? (sobrantes.find((s) => s.id === origenSobranteId) ?? null)
    : null;

  const [modo, setModo] = useState<ModoPieza>("pieza");
  const [origen, setOrigen] = useState<OrigenMaterial>(
    sobrantePrecargado ? "sobrante" : "manual",
  );
  const [materialId, setMaterialId] = useState("");
  const [laminaId, setLaminaId] = useState("");
  const [sobranteId, setSobranteId] = useState(sobrantePrecargado?.id ?? "");
  const [ancho, setAncho] = useState(
    sobrantePrecargado ? String(sobrantePrecargado.ancho_cm) : "",
  );
  const [alto, setAlto] = useState(
    sobrantePrecargado ? String(sobrantePrecargado.alto_cm) : "",
  );
  const [cantidad, setCantidad] = useState("1");
  const [comprimiendo, setComprimiendo] = useState(false);

  // El material a enviar depende del origen: manual lo elige la persona,
  // lámina/sobrante lo trae ya fijo la opción elegida.
  const materialEfectivo =
    origen === "lamina"
      ? laminas.find((l) => l.id === laminaId)
      : origen === "sobrante"
        ? sobrantes.find((s) => s.id === sobranteId)
        : null;
  const materialIdEfectivo =
    origen === "manual"
      ? materialId
      : origen === "lamina"
        ? laminaId
        : (materialEfectivo as OpcionSobrante | undefined)?.material_id ?? "";

  const unidades = modo === "lamina" ? 1 : Math.max(Number(cantidad) || 0, 0);
  const area =
    areaM2(
      Number(ancho.replace(",", ".")) || 0,
      Number(alto.replace(",", ".")) || 0,
    ) * unidades;

  function elegirLamina(id: string) {
    setLaminaId(id);
    const lamina = laminas.find((l) => l.id === id);
    if (lamina) {
      setAncho(String(lamina.ancho_cm));
      setAlto(String(lamina.alto_cm));
    }
  }

  function elegirSobrante(id: string) {
    setSobranteId(id);
    const sobrante = sobrantes.find((s) => s.id === id);
    if (sobrante) {
      setAncho(String(sobrante.ancho_cm));
      setAlto(String(sobrante.alto_cm));
    }
  }

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
          <input type="hidden" name="material_id" value={materialIdEfectivo} />
          <input
            type="hidden"
            name="origen_inventory_item_id"
            value={origen === "sobrante" ? sobranteId : ""}
          />

          <div className="grid gap-2">
            <Label>Origen del material</Label>
            <div className="grid grid-cols-3 gap-2">
              <BotonModo
                activo={origen === "manual"}
                onClick={() => setOrigen("manual")}
                titulo="A mano"
                detalle="Escribo el material"
              />
              <BotonModo
                activo={origen === "lamina"}
                onClick={() => setOrigen("lamina")}
                titulo="Lámina de stock"
                detalle="Sale de Materiales"
              />
              <BotonModo
                activo={origen === "sobrante"}
                onClick={() => setOrigen("sobrante")}
                titulo="Sobrante"
                detalle="Sale de Inventario"
              />
            </div>
          </div>

          {origen === "manual" ? (
            <div className="grid gap-2">
              <Label htmlFor="material_id_manual">Material</Label>
              <select
                id="material_id_manual"
                value={materialId}
                onChange={(evento) => setMaterialId(evento.target.value)}
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
          ) : null}

          {origen === "lamina" ? (
            <div className="grid gap-2">
              <Label htmlFor="lamina_id">Lámina de stock</Label>
              <select
                id="lamina_id"
                value={laminaId}
                onChange={(evento) => elegirLamina(evento.target.value)}
                required
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="" disabled>
                  Elige una lámina
                </option>
                {laminas.map((lamina) => (
                  <option key={lamina.id} value={lamina.id}>
                    {lamina.etiqueta} · {formatearNumero(lamina.ancho_cm)}×
                    {formatearNumero(lamina.alto_cm)} cm · quedan{" "}
                    {lamina.stock_laminas}
                  </option>
                ))}
              </select>
              {!laminas.length ? (
                <p className="text-xs text-muted-foreground">
                  No hay materiales con existencias de lámina registradas.
                </p>
              ) : null}
            </div>
          ) : null}

          {origen === "sobrante" ? (
            <div className="grid gap-2">
              <Label htmlFor="sobrante_id">Sobrante disponible</Label>
              <select
                id="sobrante_id"
                value={sobranteId}
                onChange={(evento) => elegirSobrante(evento.target.value)}
                required
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="" disabled>
                  Elige un sobrante
                </option>
                {sobrantes.map((sobrante) => (
                  <option key={sobrante.id} value={sobrante.id}>
                    {sobrante.codigo ?? "Sin código"} · {sobrante.etiqueta} ·{" "}
                    {formatearNumero(sobrante.ancho_cm)}×
                    {formatearNumero(sobrante.alto_cm)} cm
                  </option>
                ))}
              </select>
              {!sobrantes.length ? (
                <p className="text-xs text-muted-foreground">
                  No hay sobrantes disponibles en Inventario.
                </p>
              ) : null}
            </div>
          ) : null}

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
              ¿Forma irregular, como un triángulo? Anota el ancho y alto del
              rectángulo que la contiene: es el material que de verdad se
              consume para sacarla.
            </p>
          </div>

          {modo === "pieza" && Number(cantidad) === 1 ? (
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                name="guardar_sobrante"
                className="mt-0.5 size-4"
              />
              <span>
                <span className="block font-medium">
                  Esta pieza es un recorte aprovechable
                </span>
                <span className="block text-xs text-muted-foreground">
                  Por ejemplo la punta que sobra al cortar un triángulo. Sigue
                  contando como material consumido en este trabajo, pero
                  además queda guardada en Inventario, así que no se cuenta
                  como desperdicio si pulsas &laquo;Registrar recortes&raquo;.
                </span>
              </span>
            </label>
          ) : null}

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

        <FormularioSobranteDeCorte
          jobId={jobId}
          materialSugeridoId={materialIdEfectivo || undefined}
          materiales={materiales}
        />
      </CardContent>
    </Card>
  );
}

/**
 * "¿Sobró algo de este corte?" — declara 0..N sobrantes resultantes de un
 * corte, cada uno con su propia foto y su propio código. Un formulario
 * independiente por sobrante, en vez de un array dentro del mismo FormData:
 * más simple y no se pierde si uno falla.
 */
function FormularioSobranteDeCorte({
  jobId,
  materialSugeridoId,
  materiales,
}: {
  jobId: string;
  materialSugeridoId?: string;
  materiales: OpcionMaterial[];
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="mt-6 border-t pt-4">
      {!abierto ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setAbierto(true)}
        >
          ¿Sobró algo de este corte? Añadir sobrante
        </Button>
      ) : (
        <CamposSobranteDeCorte
          key="abierto"
          jobId={jobId}
          materialSugeridoId={materialSugeridoId}
          materiales={materiales}
          onCancelar={() => setAbierto(false)}
        />
      )}
    </div>
  );
}

function CamposSobranteDeCorte({
  jobId,
  materialSugeridoId,
  materiales,
  onCancelar,
}: {
  jobId: string;
  materialSugeridoId?: string;
  materiales: OpcionMaterial[];
  onCancelar: () => void;
}) {
  const [estado, accion, enviando] = useActionState(
    registrarSobranteDeCorte,
    ESTADO_FORM_INICIAL,
  );
  const [comprimiendo, setComprimiendo] = useState(false);

  const materialInicial = useMemo(
    () => materialSugeridoId ?? "",
    [materialSugeridoId],
  );

  const [ultimoVisto, setUltimoVisto] = useState(estado);
  if (estado !== ultimoVisto) {
    setUltimoVisto(estado);
    if (estado.ok) onCancelar();
  }

  return (
    <form
      action={accion}
      className="flex flex-col gap-3 rounded-md border p-3"
    >
      <input type="hidden" name="job_id" value={jobId} />
      <p className="text-sm font-medium">Sobrante de este corte</p>

      <div className="grid gap-2">
        <Label htmlFor="sobrante_material_id">Material</Label>
        <select
          id="sobrante_material_id"
          name="material_id"
          defaultValue={materialInicial}
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
          <Label htmlFor="sobrante_ancho_cm">Ancho (cm)</Label>
          <Input
            id="sobrante_ancho_cm"
            name="ancho_cm"
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sobrante_alto_cm">Alto (cm)</Label>
          <Input
            id="sobrante_alto_cm"
            name="alto_cm"
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            required
          />
        </div>
      </div>

      <CampoFoto etiqueta="Foto del sobrante" onEstadoChange={setComprimiendo} />

      {estado.error ? (
        <p
          aria-live="polite"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {estado.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enviando || comprimiendo}>
          {comprimiendo
            ? "Preparando foto…"
            : enviando
              ? "Guardando…"
              : "Guardar sobrante"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
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
