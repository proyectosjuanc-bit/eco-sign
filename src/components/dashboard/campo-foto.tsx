"use client";

import { useEffect, useId, useRef, useState } from "react";

import { comprimirEnInput } from "@/lib/comprimir-foto";
import { cn } from "@/lib/utils";

/**
 * Campo de foto pensado para el taller.
 *
 * Un input de archivo se ve diminuto en el móvil y no invita a pulsarlo, así
 * que se oculta detrás de un botón grande que abre la cámara trasera. La imagen
 * se comprime antes de enviarla: una foto de celular supera el límite de
 * tamaño de las Server Actions y gasta datos sin necesidad.
 */
export function CampoFoto({
  name = "foto",
  etiqueta = "Foto",
  obligatoria = false,
  onEstadoChange,
}: {
  name?: string;
  etiqueta?: string;
  obligatoria?: boolean;
  /** Avisa mientras se comprime, para bloquear el envío. */
  onEstadoChange?: (comprimiendo: boolean) => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [peso, setPeso] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const avisar = (valor: boolean) => {
    setComprimiendo(valor);
    onEstadoChange?.(valor);
  };

  const alElegir = async () => {
    const input = inputRef.current;
    if (!input?.files?.length) return;

    avisar(true);
    const archivo = await comprimirEnInput(input);
    avisar(false);

    if (!archivo) return;
    setPreview(URL.createObjectURL(archivo));
    setPeso(`${(archivo.size / 1024 / 1024).toFixed(1)} MB`);
  };

  const quitar = () => {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
    setPeso(null);
  };

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">
        {etiqueta}
        {!obligatoria ? (
          <span className="ml-1 font-normal text-muted-foreground">
            (opcional)
          </span>
        ) : null}
      </span>

      {/* El input real queda oculto: lo dispara el botón de abajo. */}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept="image/*"
        capture="environment"
        required={obligatoria}
        onChange={alElegir}
        className="sr-only"
      />

      {preview ? (
        <div className="relative overflow-hidden rounded-md border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Vista previa de la foto"
            className="h-44 w-full object-cover"
          />
          <div className="flex items-center justify-between gap-2 border-t bg-card px-3 py-2">
            <span className="text-xs text-muted-foreground">
              Foto lista{peso ? ` · ${peso}` : ""}
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-xs font-medium underline underline-offset-4"
              >
                Cambiar
              </button>
              <button
                type="button"
                onClick={quitar}
                className="text-xs font-medium text-destructive underline underline-offset-4"
              >
                Quitar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={comprimiendo}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 transition-colors",
            comprimiendo
              ? "border-input text-muted-foreground"
              : "border-emerald-600/40 text-emerald-700 hover:border-emerald-600 hover:bg-emerald-50",
          )}
        >
          <IconoCamara />
          <span className="text-sm font-medium">
            {comprimiendo ? "Preparando foto…" : "Tomar foto"}
          </span>
          <span className="text-xs text-muted-foreground">
            Se abre la cámara. También puedes elegir una de la galería.
          </span>
        </button>
      )}
    </div>
  );
}

function IconoCamara() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-7"
    >
      <path d="M3 8h3l2-3h8l2 3h3v12H3V8Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
