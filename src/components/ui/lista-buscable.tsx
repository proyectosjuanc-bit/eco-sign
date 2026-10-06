"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** "Acrílico" y "acrilico" son lo mismo para buscar. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Buscador encima de un listado que ya está completo en la página (tablas y
 * tarjetas). Filtra mientras se escribe, sin tildes ni mayúsculas, ocultando
 * las filas (`tbody tr`) o los elementos marcados con `data-buscable` que no
 * contienen el texto. Con pocos elementos no se muestra, para no estorbar.
 *
 * Para listados paginados en el servidor (los retales) no sirve: ahí la
 * búsqueda va en la consulta.
 */
export function ListaBuscable({
  children,
  placeholder = "Buscar…",
  minimo = 6,
  className,
}: {
  children: ReactNode;
  placeholder?: string;
  /** A partir de cuántos elementos aparece el buscador. */
  minimo?: number;
  className?: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [texto, setTexto] = useState("");
  const [total, setTotal] = useState(0);
  const [visibles, setVisibles] = useState(0);

  useEffect(() => {
    const raiz = contenedor.current;
    if (!raiz) return;
    const elementos = Array.from(
      raiz.querySelectorAll<HTMLElement>("[data-buscable], tbody > tr"),
    ).filter((el) => !el.parentElement?.closest("[data-buscable]"));
    const buscado = normalizar(texto.trim());
    let cuenta = 0;
    for (const el of elementos) {
      const coincide = !buscado || normalizar(el.textContent ?? "").includes(buscado);
      el.hidden = !coincide;
      if (coincide) cuenta++;
    }
    setTotal(elementos.length);
    setVisibles(cuenta);
  }, [texto, children]);

  const conBuscador = total >= minimo || texto !== "";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {conBuscador ? (
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-10 w-full rounded-md border border-input bg-card pr-3 pl-9 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {texto ? (
            <span className="pointer-events-none absolute top-1/2 right-10 -translate-y-1/2 text-xs text-muted-foreground">
              {visibles} de {total}
            </span>
          ) : null}
        </div>
      ) : null}
      <div ref={contenedor}>{children}</div>
      {texto && visibles === 0 ? (
        <p className="rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">
          No hay nada que coincida con «{texto}».
        </p>
      ) : null}
    </div>
  );
}
