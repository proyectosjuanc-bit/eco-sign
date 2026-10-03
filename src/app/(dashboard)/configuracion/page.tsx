import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FormularioTaller } from "@/components/configuracion/formulario-taller";
import { TarjetaSoporte } from "@/components/configuracion/tarjeta-soporte";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Configuración · ECO-SIGN" };

/**
 * Administración del taller: datos de la empresa, acceso al equipo, al perfil
 * propio y a soporte. Sólo admins (es_admin() en la base; la política de
 * tenants además impide que otro rol guarde cambios aunque llegara aquí).
 */
export default async function ConfiguracionPage() {
  const supabase = await createClient();

  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (!esAdmin) redirect("/dashboard");

  const { data: tenantId } = await supabase.rpc("current_tenant_id");

  const [{ data: taller }, { count: activos }, { count: pendientes }] = await Promise.all([
    supabase
      .from("tenants")
      .select("nombre, nit, telefono, ciudad, direccion")
      .eq("id", tenantId ?? "")
      .maybeSingle(),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("activo", true),
    supabase
      .from("invitaciones")
      .select("id", { count: "exact", head: true })
      .eq("aceptada", false)
      .gt("expira_en", new Date().toISOString()),
  ]);

  return (
    <>
      <EncabezadoPagina
        titulo="Configuración"
        descripcion="Los datos de tu taller, tu equipo y cómo pedir ayuda."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          {taller ? (
            <FormularioTaller taller={taller} />
          ) : (
            <Card>
              <CardContent className="text-sm text-destructive">
                No pudimos cargar los datos del taller. Recarga la página.
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Equipo</CardTitle>
              <CardDescription>
                {activos ?? 0} {activos === 1 ? "usuario activo" : "usuarios activos"}
                {pendientes
                  ? ` · ${pendientes} ${pendientes === 1 ? "invitación pendiente" : "invitaciones pendientes"}`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/configuracion/equipo"
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              >
                Gestionar equipo →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mi perfil</CardTitle>
              <CardDescription>Tu nombre, tu contraseña y tus sesiones abiertas.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/perfil" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                Ir a mi perfil →
              </Link>
            </CardContent>
          </Card>

          <TarjetaSoporte />
        </div>
      </div>
    </>
  );
}
