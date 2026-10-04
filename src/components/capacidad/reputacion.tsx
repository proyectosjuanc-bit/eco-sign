import { formatearNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Reputación de un taller o una máquina (ver 20261004_reputacion.sql).
 *
 * Todos empiezan en 5,0; hasta tener RESENAS_PARA_PUNTAJE reseñas se muestra
 * "Nuevo", porque con una o dos el número dice poco. Sin estado ni hooks: sirve
 * en páginas de servidor y en componentes de cliente.
 */
export const RESENAS_PARA_PUNTAJE = 3;

export function Reputacion({
  promedio,
  total,
  className,
}: {
  /** null o undefined = sin reseñas todavía (se muestra 5,0). */
  promedio: number | null | undefined;
  total: number | null | undefined;
  className?: string;
}) {
  const n = Number(total ?? 0);
  const valor = n > 0 && promedio != null ? Number(promedio) : 5;
  const nuevo = n < RESENAS_PARA_PUNTAJE;

  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs", className)}
      title={
        nuevo
          ? `Taller nuevo en la red: ${n} ${n === 1 ? "reseña" : "reseñas"}. El puntaje se muestra desde ${RESENAS_PARA_PUNTAJE}.`
          : `${formatearNumero(valor)} de 5, con ${n} reseñas`
      }
    >
      <span aria-hidden="true" className="text-amber-500">★</span>
      {nuevo ? (
        <span className="rounded-full bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700">
          Nuevo{n > 0 ? ` · ${n} ${n === 1 ? "reseña" : "reseñas"}` : ""}
        </span>
      ) : (
        <span>
          <strong className="text-foreground">{valor.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
          <span className="text-muted-foreground"> ({n})</span>
        </span>
      )}
    </span>
  );
}

/** Estrellas fijas para mostrar una calificación dada: ★★★★☆. */
export function EstrellasFijas({ estrellas, className }: { estrellas: number; className?: string }) {
  return (
    <span className={cn("text-amber-500", className)} aria-label={`${estrellas} de 5 estrellas`}>
      {"★".repeat(estrellas)}
      <span className="text-muted-foreground/40">{"★".repeat(5 - estrellas)}</span>
    </span>
  );
}
