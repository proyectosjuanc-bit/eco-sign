"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const SECCIONES = [
  { href: "/admin", etiqueta: "Talleres" },
  { href: "/admin/superadmins", etiqueta: "Superadmins" },
  { href: "/admin/registro", etiqueta: "Registro de acciones" },
];

export function NavAdmin() {
  const ruta = usePathname();
  const activa = (href: string) =>
    href === "/admin" ? ruta === "/admin" || ruta.startsWith("/admin/talleres") : ruta.startsWith(href);

  return (
    <nav className="mb-6 flex flex-wrap gap-2">
      {SECCIONES.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium",
            activa(s.href) ? "bg-slate-900 text-white" : "border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {s.etiqueta}
        </Link>
      ))}
    </nav>
  );
}
