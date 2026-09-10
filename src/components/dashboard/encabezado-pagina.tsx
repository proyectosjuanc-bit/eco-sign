import type { ReactNode } from "react";

/** Título, descripción y acción opcional, repetidos en cada página del panel. */
export function EncabezadoPagina({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {descripcion ? (
          <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
