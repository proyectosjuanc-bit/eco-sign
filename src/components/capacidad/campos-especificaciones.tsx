"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CAMPOS_POR_TIPO, PREFIJO_ESPECIFICACION } from "@/lib/capacidad/tipos";
import type { TipoMaquina } from "@/types/database";

/**
 * Campos que dependen del tipo de máquina (ancho máximo, potencia…).
 *
 * La lista sale de `CAMPOS_POR_TIPO`, la misma que usa el servidor para
 * validar, así que no se pueden desalinear. Los valores se manejan como
 * texto crudo, tal cual se escriben; el servidor los convierte a número o
 * lista al guardar.
 */
export function CamposEspecificaciones({
  tipo,
  valores,
  onCambio,
}: {
  tipo: TipoMaquina;
  valores: Record<string, string>;
  onCambio: (clave: string, valor: string) => void;
}) {
  const campos = CAMPOS_POR_TIPO[tipo];

  return (
    <fieldset className="grid gap-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">
        Especificaciones <span className="font-normal text-muted-foreground">(opcional)</span>
      </legend>

      <div className="grid gap-3 sm:grid-cols-2">
        {campos.map((campo) => {
          const id = `${PREFIJO_ESPECIFICACION}${campo.clave}`;
          const comun = {
            id,
            name: id,
            placeholder: campo.placeholder,
            value: valores[campo.clave] ?? "",
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              onCambio(campo.clave, e.target.value),
          };

          return (
            <div
              key={campo.clave}
              className={campo.formato === "largo" ? "grid gap-2 sm:col-span-2" : "grid gap-2"}
            >
              <Label htmlFor={id}>{campo.etiqueta}</Label>
              {campo.formato === "largo" ? (
                <Textarea rows={3} maxLength={1000} {...comun} />
              ) : (
                <Input
                  type={campo.formato === "numero" ? "number" : "text"}
                  inputMode={campo.formato === "numero" ? "decimal" : undefined}
                  step={campo.formato === "numero" ? "any" : undefined}
                  min={campo.formato === "numero" ? "0" : undefined}
                  maxLength={campo.formato === "numero" ? undefined : campo.formato === "lista" ? 500 : 120}
                  {...comun}
                />
              )}
              {campo.formato === "lista" ? (
                <p className="text-xs text-muted-foreground">Separa con comas.</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
