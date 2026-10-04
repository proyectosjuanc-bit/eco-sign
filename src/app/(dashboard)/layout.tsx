import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { BotonLogout } from "@/components/dashboard/boton-logout";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Campana } from "@/components/notificaciones/campana";
import { enlaceWhatsApp } from "@/lib/soporte";
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

  const [{ data: perfil }, { data: acceso }, { data: esSuperadmin }] = await Promise.all([
    supabase
      .from("profiles")
      .select("nombre, email, tenant_id, rol, activo")
      .eq("id", user.id)
      .maybeSingle(),
    // Por qué podría no ver datos: cuenta desactivada o taller suspendido.
    supabase.rpc("mi_acceso"),
    supabase.rpc("es_superadmin"),
  ]);
  const tallerSuspendido = acceso?.[0]?.taller_estado === "suspendido";

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

  // Un superadmin suspendió el taller: sus datos siguen guardados, pero nadie
  // del taller los ve hasta que lo reactiven.
  if (tallerSuspendido) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-muted/30 p-6 text-center">
        <h1 className="text-xl font-semibold">El acceso de tu taller está suspendido</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Los datos de {acceso?.[0]?.taller_nombre ?? "tu taller"} siguen guardados y
          no se ha borrado nada. Para reactivarlo, escríbenos.
        </p>
        <a
          href={enlaceWhatsApp("Hola, el acceso de mi taller en ECO-SIGN está suspendido y quiero reactivarlo.")}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Escribir a soporte por WhatsApp
        </a>
        {esSuperadmin ? (
          <Link href="/admin" className="text-sm underline underline-offset-4">
            Ir al panel de superadmin
          </Link>
        ) : null}
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
            {/* El nombre lleva a Mi perfil (nombre, contraseña, soporte). */}
            <Link
              href="/perfil"
              title="Mi perfil"
              className="block truncate text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {perfil?.nombre ?? user.email}
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {perfil ? (
              <Campana
                userId={user.id}
                llavePublica={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
              />
            ) : null}
            {esSuperadmin ? (
              <Link
                href="/admin"
                className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700"
              >
                Superadmin
              </Link>
            ) : null}
            <BotonLogout />
          </div>
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
