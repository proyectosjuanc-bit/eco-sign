import type { Metadata } from "next";
import Link from "next/link";

import { FormularioNuevaClave } from "./formulario-nueva-clave";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ocultarCorreo } from "@/lib/format";
import { getUsuarioActual } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Nueva contraseña · ECO-SIGN",
  robots: { index: false, follow: false },
};

/**
 * Pantalla para elegir la nueva contraseña.
 *
 * Se llega desde el enlace del correo: /auth/confirmar lo valida e inicia la
 * sesión antes de redirigir aquí. Sin sesión (el enlace se abrió directo, venció
 * o ya se usó) no hay cuenta a la que cambiarle la contraseña.
 */
export default async function NuevaClavePage() {
  const usuario = await getUsuarioActual();

  if (!usuario?.email) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>El enlace ya no sirve</CardTitle>
          <CardDescription>
            El enlace para crear una nueva contraseña venció o ya se usó. Pide uno
            nuevo; dura 1 hora.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/recuperar" className={cn(buttonVariants(), "w-full")}>
            Pedir un enlace nuevo
          </Link>
        </CardContent>
      </Card>
    );
  }

  return <FormularioNuevaClave correoOculto={ocultarCorreo(usuario.email)} />;
}
