import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BotonCerrarSesiones, FormularioClave, FormularioNombre } from "./formularios-perfil";
import { TarjetaSoporte } from "@/components/configuracion/tarjeta-soporte";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { ETIQUETA_ROL } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mi perfil · ECO-SIGN" };

/**
 * Perfil de quien está conectado. Para TODOS los roles: un operario o un
 * usuario de solo lectura también tiene que poder cambiar su contraseña.
 * Se llega tocando el nombre en la cabecera.
 */
export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("nombre, email, rol")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <>
      <EncabezadoPagina titulo="Mi perfil" descripcion="Tu nombre, tu contraseña y tus sesiones." />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <FormularioNombre
            nombre={perfil?.nombre ?? ""}
            correo={perfil?.email ?? user.email ?? ""}
            rol={perfil ? ETIQUETA_ROL[perfil.rol] : "—"}
          />
          <FormularioClave />
          <BotonCerrarSesiones />
        </div>

        <div className="flex flex-col gap-6">
          <TarjetaSoporte />
        </div>
      </div>
    </>
  );
}
