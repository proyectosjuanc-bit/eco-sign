"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "./nav-items";
import { COOKIE_BARRA } from "@/lib/preferencias";
import { enlaceWhatsApp } from "@/lib/soporte";
import { cn } from "@/lib/utils";


/**
 * Navegación principal. En escritorio es una columna fija a la izquierda que
 * se puede colapsar a sólo íconos (para dar más ancho a las tablas); en móvil
 * se convierte en una barra inferior, que es donde el pulgar alcanza.
 *
 * La preferencia va en una cookie y no en localStorage: así el servidor ya
 * pinta la barra como estaba y no «salta» al cargar la página.
 */
export function Sidebar({
  esAdmin = false,
  colapsadaInicial = false,
}: {
  esAdmin?: boolean;
  colapsadaInicial?: boolean;
}) {
  const pathname = usePathname();
  const [colapsada, setColapsada] = useState(colapsadaInicial);

  const alternar = () => {
    const nueva = !colapsada;
    setColapsada(nueva);
    // Un año; sólo es una preferencia de pantalla.
    document.cookie = `${COOKIE_BARRA}=${nueva ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  // Los ítems de administración sólo los ven los admins (la ruta además se
  // protege en el servidor: esto es sólo para no mostrar enlaces inútiles).
  const items = NAV_ITEMS.filter((item) => !item.soloAdmin || esAdmin);

  // Se marca el ítem de la ruta más específica: /configuracion/equipo no debe
  // encender también /configuracion.
  const hrefActivo = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const esActivo = (href: string) => href === hrefActivo;

  return (
    <>
      <aside
        className={cn(
          // Fija en la pantalla: al deslizar una página larga, el menú y el botón
          // de ocultarlo siguen a la vista.
          "hidden shrink-0 border-r bg-card transition-[width] duration-200 md:sticky md:top-0 md:flex md:h-svh md:flex-col",
          colapsada ? "w-16" : "w-60",
        )}
      >
        <div className={cn("flex h-16 items-center border-b", colapsada ? "justify-center px-2" : "px-6")}>
          <Link
            href={esAdmin ? "/dashboard" : "/trabajos"}
            className="text-lg font-bold tracking-tight"
            title="ECO·SIGN"
          >
            {colapsada ? (
              <>
                E<span className="text-emerald-600">·</span>S
              </>
            ) : (
              <>
                ECO<span className="text-emerald-600">·</span>SIGN
              </>
            )}
          </Link>
        </div>
        <nav className={cn("flex flex-1 flex-col gap-1 overflow-y-auto", colapsada ? "p-2" : "p-3")}>
          {items.map((item, i) => (
            <Fragment key={item.href}>
              {/* Una línea separa los ítems de administración del uso diario. */}
              {item.gestion && !items[i - 1]?.gestion ? (
                <div role="separator" className="my-2 border-t" />
              ) : null}
              <Link
                href={item.href}
                // Colapsada sólo se ve el ícono: el nombre sale al pasar el mouse.
                title={colapsada ? item.etiqueta : undefined}
                aria-label={colapsada ? item.etiqueta : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors",
                  colapsada ? "justify-center px-2" : "px-3",
                  esActivo(item.href)
                    ? "bg-emerald-600 text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icono d={item.icono} />
                {colapsada ? null : item.etiqueta}
              </Link>
            </Fragment>
          ))}
        </nav>
        <div className={cn("border-t text-xs text-muted-foreground", colapsada ? "p-2" : "p-4")}>
          {colapsada ? (
            <a
              href={enlaceWhatsApp()}
              target="_blank"
              rel="noopener noreferrer"
              title="¿Necesitas ayuda? Escríbenos"
              aria-label="¿Necesitas ayuda? Escríbenos"
              className="mb-2 flex justify-center rounded-md py-2 font-bold text-emerald-700 hover:bg-muted"
            >
              ?
            </a>
          ) : (
            <>
              <a
                href={enlaceWhatsApp()}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-2 block font-medium text-emerald-700 hover:underline"
              >
                ¿Necesitas ayuda? Escríbenos
              </a>
              <p className="mb-3">Tu desperdicio paga el software.</p>
            </>
          )}
          <button
            type="button"
            onClick={alternar}
            aria-expanded={!colapsada}
            title={colapsada ? "Mostrar el menú" : "Ocultar el menú"}
            className={cn(
              "flex w-full items-center gap-2 rounded-md py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
              colapsada ? "justify-center px-2" : "px-3",
            )}
          >
            <Icono d={colapsada ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} />
            {colapsada ? <span className="sr-only">Mostrar el menú</span> : "Ocultar menú"}
          </button>
        </div>
      </aside>

      {/* Con los ítems de admin hay 8 entradas: no caben en 360 px, así que la
          barra se desplaza en horizontal. Con 6 (no admin) se reparten igual. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t bg-card md:hidden">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-w-16 flex-1 flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium",
              esActivo(item.href) ? "text-emerald-600" : "text-muted-foreground",
            )}
          >
            <Icono d={item.icono} />
            {item.etiqueta}
          </Link>
        ))}
      </nav>
    </>
  );
}

function Icono({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-5 shrink-0"
    >
      <path d={d} />
    </svg>
  );
}
