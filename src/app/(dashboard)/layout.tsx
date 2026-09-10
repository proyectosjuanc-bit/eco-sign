import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { BotonLogout } from "@/components/dashboard/boton-logout";
import { Sidebar } from "@/components/dashboard/sidebar";
import { createClient } from "@/lib/supabase/server";

/**
 * Marco de todas las páginas privadas.
 *
 * El proxy ya bloquea el acceso sin sesión; esta segunda comprobación en el
 * servidor es la que de verdad protege los datos, porque el proxy solo mira
 * cookies y aquí se valida el usuario contra Auth.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("nombre, email, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const { data: tenant } = perfil?.tenant_id
    ? await supabase
        .from("tenants")
        .select("nombre")
        .eq("id", perfil.tenant_id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="flex min-h-svh bg-muted/30">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b bg-card px-4 md:px-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {tenant?.nombre ?? "Mi empresa"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {perfil?.nombre ?? user.email}
            </p>
          </div>
          <BotonLogout />
        </header>

        {/* pb-20 deja sitio a la barra de navegación inferior en móvil. */}
        <main className="flex-1 p-4 pb-20 md:p-8">{children}</main>
      </div>

      {!perfil ? (
        <div className="fixed inset-x-0 bottom-16 z-50 mx-auto w-fit rounded-md bg-amber-500 px-4 py-2 text-sm text-white shadow-lg md:bottom-4">
          Tu usuario no tiene perfil asociado. Sin él, RLS oculta todos los datos.
        </div>
      ) : null}
    </div>
  );
}
