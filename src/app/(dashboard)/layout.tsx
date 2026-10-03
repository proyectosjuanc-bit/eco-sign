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
    .select("nombre, email, tenant_id, rol, activo")
    .eq("id", user.id)
    .maybeSingle();

  const { data: tenant } = perfil?.tenant_id
    ? await supabase
        .from("tenants")
        .select("nombre")
        .eq("id", perfil.tenant_id)
        .maybeSingle()
    : { data: null };

  // Un admin desactivó esta cuenta: la base ya no le devuelve datos del taller
  // (RLS), y aquí se le explica en vez de mostrarle un panel vacío. No se
  // redirige a /login porque el proxy devuelve al panel a quien tiene sesión.
  if (perfil && !perfil.activo) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-muted/30 p-6 text-center">
        <h1 className="text-xl font-semibold">Tu cuenta está desactivada</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Un administrador de tu taller desactivó tu acceso. Si crees que es un
          error, habla con él para que te vuelva a activar.
        </p>
        <BotonLogout />
      </div>
    );
  }

  // Equivale a es_admin() de la base (rol admin y activo); se aprovecha el
  // perfil ya cargado en vez de otra consulta.
  const esAdmin = perfil?.rol === "admin";

  return (
    <div className="flex min-h-svh bg-muted/30">
      <Sidebar esAdmin={esAdmin} />

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

        {/* La base ya impide que un usuario de solo lectura cree, edite o
            borre; el aviso evita que piense que los botones están rotos. */}
        {perfil?.rol === "lectura" ? (
          <p className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 md:px-8">
            Tienes acceso de <strong>solo lectura</strong>: puedes ver toda la
            información del taller, pero no crear, editar ni borrar nada.
          </p>
        ) : null}

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
