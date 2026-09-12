"use client";

import { useActionState, useState } from "react";

import { crearSobrante } from "./actions";
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
import { CampoFoto } from "@/components/dashboard/campo-foto";
import { PanelMedicion } from "@/components/inventario/panel-medicion";
import { areaM2, formatearNumero } from "@/lib/format";

export interface OpcionMaterial {
  id: string;
  etiqueta: string;
}

/**
 * Alta de sobrante desde el taller.
 *
 * El input de foto usa capture="environment" para que en el móvil abra la
 * cámara trasera directamente. Con una hoja A4 en la foto, OpenCV.js sugiere
 * el ancho, el alto y el color; el usuario siempre puede corregirlos a mano,
 * y sin foto los escribe todos él mismo como antes.
 */
export function FormularioSobrante({ materiales }: { materiales: OpcionMaterial[] }) {
  const [estado, accion, enviando] = useActionState(
    crearSobrante,
    ESTADO_FORM_INICIAL,
  );

  // Cada alta correcta cambia la key y remonta el formulario con el estado
  // limpio. Es preferible a vaciar los campos desde un efecto, que provoca un
  // render en cascada.
  return (
    <CamposSobrante
      key={estado.ok ? `guardado-${estado.marca}` : "editando"}
      materiales={materiales}
      accion={accion}
      enviando={enviando}
      error={estado.error}
    />
  );
}

function CamposSobrante({
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
  const [comprimiendo, setComprimiendo] = useState(false);
  const [archivoFoto, setArchivoFoto] = useState<File | null>(null);
  const [ancho, setAncho] = useState("");
  const [alto, setAlto] = useState("");
  const [color, setColor] = useState("");

  const area = areaM2(
    Number(ancho.replace(",", ".")) || 0,
    Number(alto.replace(",", ".")) || 0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar sobrante</CardTitle>
        <CardDescription>
          Toma la foto del retal. Con una hoja A4 junto a él, el sistema
          sugiere las medidas y el color.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={accion} className="flex flex-col gap-4">
          <CampoFoto
            etiqueta="Foto del sobrante"
            onEstadoChange={setComprimiendo}
            onArchivo={setArchivoFoto}
          />

          <PanelMedicion
            archivo={archivoFoto}
            onMedido={(medida) => {
              setAncho(String(medida.anchoCm));
              setAlto(String(medida.altoCm));
              if (medida.colorHex) setColor(medida.colorHex);
            }}
          />

          <div className="grid gap-2">
            <Label htmlFor="material_id">Material</Label>
            <select
              id="material_id"
              name="material_id"
              defaultValue=""
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Sin material</option>
              {materiales.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.etiqueta}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Elegir material permite valorar el sobrante en pesos.
            </p>
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
          </div>

          {area > 0 ? (
            <p className="text-sm text-muted-foreground">
              Área: <strong>{formatearNumero(area)} m²</strong>
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="color">Color</Label>
              <Input
                id="color"
                name="color"
                placeholder="Blanco"
                value={color}
                onChange={(evento) => setColor(evento.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="grosor_mm">Grosor (mm)</Label>
              <Input
                id="grosor_mm"
                name="grosor_mm"
                type="number"
                step="0.1"
                min="0"
                inputMode="decimal"
              />
            </div>
          </div>

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
                ? "Guardando…"
                : "Guardar sobrante"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
