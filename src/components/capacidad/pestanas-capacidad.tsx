"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const PESTANAS = [
  { href: "/capacidad", etiqueta: "Mis máquinas" },
  { href: "/capacidad/disponibles", etiqueta: "Red de talleres" },
  { href: "/capacidad/solicitudes-recibidas", etiqueta: "Recibidas" },
  { href: "/capacidad/solicitudes-enviadas", etiqueta: "Enviadas" },
] as const;

/**
 * Navegación entre las cuatro vistas de Capacidad. Con scroll horizontal en
 * móvil en vez de saltar de línea, para que no empuje el contenido hacia abajo.
 */
export function PestanasCapacidad({ pendientes }: { pendientes: number }) {
  const pathname = usePathname();

  // "Mis máquinas" también cubre /capacidad/nueva y /capacidad/[id]/editar.
  const activa = (href: string) =>
    href === "/capacidad"
      ? !PESTANAS.some((p) => p.href !== "/capacidad" && pathname.startsWith(p.href))
      : pathname.startsWith(href);

  return (
    <nav className="-mx-4 mb-6 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1">
        {PESTANAS.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              className={cn(
                "flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                activa(p.href)
                  ? "border-emerald-600 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {p.etiqueta}
              {p.href === "/capacidad/solicitudes-recibidas" && pendientes > 0 ? (
                <span className="rounded-full bg-emerald-600 px-1.5 text-xs text-white">
                  {pendientes}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
