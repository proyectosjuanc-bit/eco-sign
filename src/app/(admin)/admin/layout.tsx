import Link from "next/link";
import type { ReactNode } from "react";

import { BotonLogout } from "@/components/dashboard/boton-logout";

/**
 * Marco del panel de superadmin. No comprueba nada: cada sección lo hace por
 * su cuenta (la verificación exige ser superadmin; el resto, además, el
 * segundo paso). Así /admin/verificacion puede vivir aquí sin un bucle.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b bg-slate-900 text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/admin" className="font-bold tracking-tight">
            ECO<span className="text-emerald-400">·</span>SIGN{" "}
            <span className="ml-1 rounded bg-amber-400 px-1.5 py-0.5 text-xs font-semibold text-slate-900">
              SUPERADMIN
            </span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/dashboard" className="text-slate-300 hover:text-white">
              Volver a mi taller
            </Link>
            <BotonLogout />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
    </div>
  );
}
