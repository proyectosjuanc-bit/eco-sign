import type { Metadata } from "next";
import Link from "next/link";

import { FormularioAceptarInvitacion } from "@/components/auth/formulario-aceptar-invitacion";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ocultarCorreo } from "@/lib/format";
import { mensajeInvitacionInvalida } from "@/lib/invitaciones";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { Rol } from "@/types/database";

export const metadata: Metadata = {
  title: "Aceptar invitación · ECO-SIGN",
  // El token va en la URL: que no se indexe.
  robots: { index: false, follow: false },
};

/**
 * Destino del enlace del correo de invitación.
 *
 * La persona todavía no tiene cuenta ni sesión, así que la invitación se
 * consulta con obtener_invitacion_por_token (pública por diseño, devuelve sólo
 * lo necesario). El correo completo no llega al navegador: se muestra oculto.
 */
export default async function AceptarInvitacionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <Aviso mensaje={mensajeInvitacionInvalida("Token vacío")} />;
  }

  const supabase = await createClient();
  const { data: filas, error } = await supabase.rpc("obtener_invitacion_por_token", {
    p_token: token,
  });
  const invitacion = filas?.[0];

  if (error || !invitacion) {
    console.error("[auth] No se pudo consultar la invitación", error);
    return <Aviso mensaje="No pudimos verificar la invitación. Intenta de nuevo en un momento." />;
  }

  if (!invitacion.valida || !invitacion.email) {
    return <Aviso mensaje={mensajeInvitacionInvalida(invitacion.mensaje_error)} />;
  }

  return (
    <FormularioAceptarInvitacion
      token={token}
      correoOculto={ocultarCorreo(invitacion.email)}
      taller={invitacion.nombre_taller ?? "un taller"}
      invitador={invitacion.nombre_invitador ?? "Un administrador"}
      rol={invitacion.rol as Rol}
    />
  );
}

/** Invitación inválida, usada o vencida: se explica y se ofrece salida. */
function Aviso({ mensaje }: { mensaje: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No pudimos abrir la invitación</CardTitle>
        <CardDescription>{mensaje}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Link href="/login" className={cn(buttonVariants(), "w-full")}>
          Ir al login
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
          Ir al inicio
        </Link>
      </CardContent>
    </Card>
  );
}
