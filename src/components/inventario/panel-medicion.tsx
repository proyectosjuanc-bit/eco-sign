"use client";

import { useState } from "react";

import { medirSobrante, type MeasureResult, type TipoReferencia } from "@/lib/opencv/measure";
import { cn } from "@/lib/utils";

/**
 * Mide un sobrante a partir de la foto tomada en el formulario, usando una
 * hoja A4 de referencia.
 *
 * No reemplaza los campos de ancho, alto y color del formulario: los rellena.
 * El usuario siempre puede corregirlos a mano, porque OpenCV.js con contornos
 * geométricos no es infalible con luz mala o un fondo desordenado.
 */
export function PanelMedicion({
  archivo,
  onMedido,
}: {
  /** Foto ya comprimida por CampoFoto; null mientras no se ha tomado ninguna. */
  archivo: File | null;
  /** Se llama con las medidas y el color detectados, para volcarlos al formulario. */
  onMedido: (resultado: { anchoCm: number; altoCm: number; colorHex: string | null }) => void;
}) {
  const [referencia, setReferencia] = useState<TipoReferencia>("a4_horizontal");
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<MeasureResult | null>(null);

  const medir = async () => {
    if (!archivo) return;
    setProcesando(true);
    setResultado(null);
    try {
      const medida = await medirSobrante(archivo, referencia);
      setResultado(medida);
      if (medida.anchoCm !== null && medida.altoCm !== null) {
        onMedido({
          anchoCm: medida.anchoCm,
          altoCm: medida.altoCm,
          colorHex: medida.colorHex,
        });
      }
    } catch (excepcion) {
      console.error("Fallo midiendo el sobrante:", excepcion);
      setResultado({
        anchoCm: null,
        altoCm: null,
        colorHex: null,
        rectanguloReferencia: null,
        rectanguloSobrante: null,
        imagenProcesada: "",
        confianza: 0,
        error: "No se pudo procesar la foto. Inténtalo de nuevo o ingresa las medidas a mano.",
      });
    } finally {
      setProcesando(false);
    }
  };

  if (!archivo) return null;

  return (
    <div className="grid gap-3 rounded-md border border-dashed p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Medir automáticamente</p>
        <span className="text-xs text-muted-foreground">Fase 1 · con hoja A4</span>
      </div>

      <div className="grid gap-2">
        <div className="grid grid-cols-2 gap-2">
          <BotonReferencia
            activo={referencia === "a4_horizontal"}
            onClick={() => setReferencia("a4_horizontal")}
            titulo="Hoja A4 horizontal"
          />
          <BotonReferencia
            activo={referencia === "a4_vertical"}
            onClick={() => setReferencia("a4_vertical")}
            titulo="Hoja A4 vertical"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Toma la foto con una hoja A4 completa y plana junto al sobrante, sin
          que se tapen entre sí.
        </p>
      </div>

      <button
        type="button"
        onClick={medir}
        disabled={procesando}
        className={cn(
          "rounded-md px-3 py-2 text-sm font-medium transition-colors",
          procesando
            ? "bg-muted text-muted-foreground"
            : "bg-emerald-600 text-white hover:bg-emerald-700",
        )}
      >
        {procesando ? "Midiendo…" : "Medir con esta foto"}
      </button>

      {resultado ? <ResultadoMedicion resultado={resultado} /> : null}
    </div>
  );
}

function BotonReferencia({
  activo,
  onClick,
  titulo,
}: {
  activo: boolean;
  onClick: () => void;
  titulo: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "rounded-md border px-3 py-2 text-left text-sm transition-colors",
        activo
          ? "border-emerald-600 bg-emerald-50 text-emerald-900"
          : "border-input hover:bg-muted",
      )}
    >
      {titulo}
    </button>
  );
}

function ResultadoMedicion({ resultado }: { resultado: MeasureResult }) {
  if (resultado.error) {
    return (
      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {resultado.error}
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {resultado.imagenProcesada ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resultado.imagenProcesada}
          alt="Rectángulos detectados: azul la referencia, verde el sobrante"
          className="w-full rounded-md border"
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>
          <strong>{resultado.anchoCm} × {resultado.altoCm} cm</strong> detectado
        </span>
        {resultado.colorHex ? (
          <span className="flex items-center gap-1">
            <span
              className="size-4 rounded-full border"
              style={{ backgroundColor: resultado.colorHex }}
            />
            {resultado.colorHex}
          </span>
        ) : null}
      </div>

      {resultado.confianza < 0.5 ? (
        <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">
          La detección no fue precisa. Verifica las medidas antes de guardar.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Revisa los campos de abajo y ajústalos si algo no coincide.
        </p>
      )}
    </div>
  );
}
