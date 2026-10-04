"use client";

import { Button } from "@/components/ui/button";
import { DIAS, PREFIJO_HORARIO, leerFranjas } from "@/lib/capacidad/tipos";
import type { DiaSemana } from "@/types/database";

/**
 * Horario disponible de una máquina, día por día, eligiendo horas en listas en
 * vez de escribirlas.
 *
 * Por dentro sigue siendo el mismo texto de siempre por día
 * ("08:00-12:00, 14:00-18:00"), enviado en un campo oculto `horario_<día>`:
 * así la validación del servidor (leerHorario) y lo guardado en la base no
 * cambian.
 */

interface Franja {
  desde: string;
  hasta: string;
}

/** Máximo de franjas por día (el servidor admite hasta 6). */
const MAX_FRANJAS = 4;
const FRANJA_NUEVA: Franja = { desde: "08:00", hasta: "17:00" };

/** 05:00, 05:30 … 23:00 y 23:59 (para "hasta el final del día"). */
const HORAS: string[] = (() => {
  const lista: string[] = [];
  for (let m = 5 * 60; m <= 23 * 60; m += 30) {
    lista.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  lista.push("23:59");
  return lista;
})();

const CLASE_SELECT =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function aFranjas(texto: string): Franja[] {
  return (leerFranjas(texto) ?? []).map((f) => {
    const [desde, hasta] = f.split("-");
    return { desde, hasta };
  });
}

function aTexto(franjas: Franja[]): string {
  return franjas.map((f) => `${f.desde}-${f.hasta}`).join(", ");
}

/** "Hasta" siempre después de "desde": si no, se corre una hora (o al final del día). */
function ajustar(f: Franja): Franja {
  if (f.hasta > f.desde) return f;
  const siguiente = HORAS.find((h) => h > f.desde && h >= sumarHora(f.desde)) ?? "23:59";
  return { desde: f.desde, hasta: siguiente };
}

function sumarHora(hora: string): string {
  const [h, m] = hora.split(":").map(Number);
  const total = Math.min(h * 60 + m + 60, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Opciones de la lista, incluyendo una hora guardada que no esté en los pasos de 30 min. */
function opciones(valor: string, despuesDe?: string): string[] {
  const base = HORAS.includes(valor) ? HORAS : [...HORAS, valor].sort();
  return despuesDe ? base.filter((h) => h > despuesDe) : base;
}

export function SelectorHorario({
  horario,
  onChange,
}: {
  horario: Record<DiaSemana, string>;
  onChange: (nuevo: Record<DiaSemana, string>) => void;
}) {
  const cambiarDia = (dia: DiaSemana, franjas: Franja[]) =>
    onChange({ ...horario, [dia]: aTexto(franjas) });

  const copiarLunes = () =>
    onChange({
      ...horario,
      martes: horario.lunes,
      miercoles: horario.lunes,
      jueves: horario.lunes,
      viernes: horario.lunes,
    });

  return (
    <div className="grid gap-2">
      {DIAS.map((dia) => {
        const franjas = aFranjas(horario[dia.valor]);
        const disponible = franjas.length > 0;
        return (
          <div key={dia.valor} className="grid gap-2 rounded-md border px-3 py-2 sm:grid-cols-[120px_1fr]">
            {/* Lo que viaja al servidor: el mismo texto de antes. */}
            <input type="hidden" name={`${PREFIJO_HORARIO}${dia.valor}`} value={horario[dia.valor]} />

            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-emerald-600"
                checked={disponible}
                onChange={(e) => cambiarDia(dia.valor, e.target.checked ? [FRANJA_NUEVA] : [])}
              />
              {dia.etiqueta}
            </label>

            {disponible ? (
              <div className="flex flex-col gap-2">
                {franjas.map((f, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">De</span>
                    <select
                      aria-label={`${dia.etiqueta}, franja ${i + 1}: desde`}
                      className={CLASE_SELECT}
                      value={f.desde}
                      onChange={(e) =>
                        cambiarDia(
                          dia.valor,
                          franjas.map((x, j) => (j === i ? ajustar({ ...x, desde: e.target.value }) : x)),
                        )
                      }
                    >
                      {opciones(f.desde).filter((h) => h !== "23:59").map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <span className="text-muted-foreground">a</span>
                    <select
                      aria-label={`${dia.etiqueta}, franja ${i + 1}: hasta`}
                      className={CLASE_SELECT}
                      value={f.hasta}
                      onChange={(e) =>
                        cambiarDia(
                          dia.valor,
                          franjas.map((x, j) => (j === i ? { ...x, hasta: e.target.value } : x)),
                        )
                      }
                    >
                      {opciones(f.hasta, f.desde).map((h) => (
                        <option key={h} value={h}>
                          {h === "23:59" ? "fin del día" : h}
                        </option>
                      ))}
                    </select>
                    {franjas.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => cambiarDia(dia.valor, franjas.filter((_, j) => j !== i))}
                      >
                        Quitar
                      </Button>
                    ) : null}
                  </div>
                ))}
                {franjas.length < MAX_FRANJAS ? (
                  <button
                    type="button"
                    className="w-fit text-xs font-medium text-emerald-700 hover:underline"
                    onClick={() => {
                      const ultima = franjas[franjas.length - 1];
                      const desde = HORAS.find((h) => h > ultima.hasta && h !== "23:59") ?? "14:00";
                      cambiarDia(dia.valor, [...franjas, ajustar({ desde, hasta: sumarHora(sumarHora(desde)) })]);
                    }}
                  >
                    + Otra franja (por ejemplo, mañana y tarde)
                  </button>
                ) : null}
              </div>
            ) : (
              <span className="self-center text-sm text-muted-foreground">No disponible</span>
            )}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={copiarLunes}
        disabled={!horario.lunes}
      >
        Copiar el horario del lunes de martes a viernes
      </Button>
    </div>
  );
}
