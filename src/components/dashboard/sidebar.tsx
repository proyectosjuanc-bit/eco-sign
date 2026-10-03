"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/utils";

/**
 * Navegación principal. En escritorio es una columna fija a la izquierda; en
 * móvil se convierte en una barra inferior, que es donde el pulgar alcanza.
 */
export function Sidebar({ esAdmin = false }: { esAdmin?: boolean }) {
  const pathname = usePathname();

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
      <aside className="hidden w-60 shrink-0 border-r bg-card md:flex md:flex-col">
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/dashboard" className="text-lg font-bold tracking-tight">
            ECO<span className="text-emerald-600">·</span>SIGN
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                esActivo(item.href)
                  ? "bg-emerald-600 text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icono d={item.icono} />
              {item.etiqueta}
            </Link>
          ))}
        </nav>
        <p className="border-t p-4 text-xs text-muted-foreground">
          Tu desperdicio paga el software.
        </p>
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
