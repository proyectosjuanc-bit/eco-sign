"use client";

import { useState } from "react";

import { medirSobrante, type MeasureResult, type TipoReferencia } from "@/lib/opencv/measure";
import { cn } from "@/lib/utils";

/** Texto de cada referencia: el botón y la instrucción de cómo colocarla. */
const REFERENCIAS: { valor: TipoReferencia; titulo: string; instruccion: string }[] = [
  {
    valor: "a4_horizontal",
    titulo: "Hoja A4 horizontal",
    instruccion:
      "Coloca la hoja A4 acostada (lado largo de izquierda a derecha), completa y plana junto al sobrante, sin que se tapen entre sí.",
  },
  {
    valor: "a4_vertical",
    titulo: "Hoja A4 vertical",
    instruccion:
      "Coloca la hoja A4 de pie (lado largo de arriba abajo), completa y plana junto al sobrante, sin que se tapen entre sí.",
  },
  {
    valor: "regla",
    titulo: "Regla 30 cm",
    instruccion:
      "Coloca la regla completa junto al sobrante, horizontal o vertical. Tiene que verse de punta a punta.",
  },
];

/**
 * Mide un sobrante a partir de la foto tomada en el formulario, usando un
 * objeto de referencia de tamaño conocido.
 *
 * No reemplaza los campos de ancho, alto y color del formulario: los rellena.
 * El usuario siempre puede corregirlos a mano, porque OpenCV.js con contornos
 * geométricos no es infalible con luz mala o un fondo desordenado.
 *
 * Si la detección falla, se puede cambiar de referencia y volver a medir con
 * la MISMA foto: no hay que repetirla. Es lo normal cuando alguien elige "A4
 * horizontal" y la hoja salió de pie en la imagen.
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

  const instruccion =
    REFERENCIAS.find((r) => r.valor === referencia)?.instruccion ?? "";

  const medir = async (conReferencia: TipoReferencia) => {
    if (!archivo) return;
    setProcesando(true);
    setResultado(null);
    try {
      const medida = await medirSobrante(archivo, conReferencia);
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
        avisos: [],
        error: "No se pudo procesar la foto. Inténtalo de nuevo o ingresa las medidas a mano.",
      });
    } finally {
      setProcesando(false);
    }
  };

  /** Cambiar de referencia limpia el resultado anterior: ya no corresponde. */
  const elegirReferencia = (valor: TipoReferencia) => {
    setReferencia(valor);
    setResultado(null);
  };

  if (!archivo) return null;

  return (
    <div className="grid gap-3 rounded-md border border-dashed p-3">
      <p className="text-sm font-medium">Medir automáticamente</p>

      <div className="grid gap-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {REFERENCIAS.map((r) => (
            <BotonReferencia
              key={r.valor}
              activo={referencia === r.valor}
              onClick={() => elegirReferencia(r.valor)}
              titulo={r.titulo}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{instruccion}</p>
      </div>

      <button
        type="button"
        onClick={() => medir(referencia)}
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

      {resultado ? (
        <ResultadoMedicion
          resultado={resultado}
          referencia={referencia}
          procesando={procesando}
          onReintentarCon={(otra) => {
            setReferencia(otra);
            void medir(otra);
          }}
        />
      ) : null}
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

function ResultadoMedicion({
  resultado,
  referencia,
  procesando,
  onReintentarCon,
}: {
  resultado: MeasureResult;
  referencia: TipoReferencia;
  procesando: boolean;
  onReintentarCon: (otra: TipoReferencia) => void;
}) {
  if (resultado.error) {
    // Las otras referencias posibles, para reintentar con la misma foto en vez
    // de obligar a repetirla: el fallo más común es haber elegido la
    // orientación equivocada, no una foto mala.
    const alternativas = REFERENCIAS.filter((r) => r.valor !== referencia);

    return (
      <div className="grid gap-2">
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {resultado.error}
        </p>
        <p className="text-xs text-muted-foreground">
          ¿Usaste otra referencia? Prueba con la misma foto:
        </p>
        <div className="flex flex-wrap gap-2">
          {alternativas.map((r) => (
            <button
              key={r.valor}
              type="button"
              disabled={procesando}
              onClick={() => onReintentarCon(r.valor)}
              className="rounded-md border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              Medir como {r.titulo}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {resultado.imagenProcesada ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resultado.imagenProcesada}
            alt="Objetos detectados en la foto, marcados con un recuadro de color"
            className="w-full rounded-md border"
          />
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm bg-[#2563EB]" />
              Referencia
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm bg-[#059669]" />
              Sobrante
            </span>
          </p>
        </>
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

      {resultado.avisos.map((aviso) => (
        <p
          key={aviso}
          className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900"
        >
          {aviso}
        </p>
      ))}

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
