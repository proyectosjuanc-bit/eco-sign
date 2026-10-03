import type { Metadata } from "next";

import {
  FormularioAceptarInvitacion,
  type DatosInvitacion,
} from "@/components/auth/formulario-aceptar-invitacion";
import { ocultarCorreo } from "@/lib/format";
import { mensajeInvitacionInvalida } from "@/lib/invitaciones";
import { createClient } from "@/lib/supabase/server";
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
 *
 * Siempre se dibuja el MISMO componente, sea la invitación válida o no. Al
 * crear la cuenta, Supabase escribe una cookie y Next vuelve a renderizar esta
 * página: para entonces la invitación ya figura como usada. Si aquí se
 * devolviera otro componente, React descartaría el aviso de éxito y mostraría
 * "ya fue usada" a quien acaba de registrarse. Con el mismo componente en el
 * mismo sitio, su estado ("cuenta creada") sobrevive a ese re-render.
 */
export default async function AceptarInvitacionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const datos = await leerInvitacion(token);

  return <FormularioAceptarInvitacion token={token ?? ""} datos={datos} />;
}

async function leerInvitacion(token: string | undefined): Promise<DatosInvitacion> {
  if (!token) {
    return { valida: false, mensaje: mensajeInvitacionInvalida("Token vacío") };
  }

  const supabase = await createClient();
  const { data: filas, error } = await supabase.rpc("obtener_invitacion_por_token", {
    p_token: token,
  });
  const invitacion = filas?.[0];

  if (error || !invitacion) {
    console.error("[auth] No se pudo consultar la invitación", error);
    return {
      valida: false,
      mensaje: "No pudimos verificar la invitación. Intenta de nuevo en un momento.",
    };
  }

  if (!invitacion.valida || !invitacion.email) {
    return { valida: false, mensaje: mensajeInvitacionInvalida(invitacion.mensaje_error) };
  }

  // ¿Hay otra cuenta con sesión abierta en este navegador? (p. ej. el admin
  // probando, o un computador compartido del taller). Se avisa en el formulario.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sesionAbierta =
    user?.email && user.email.toLowerCase() !== invitacion.email.toLowerCase()
      ? ocultarCorreo(user.email)
      : undefined;

  return {
    valida: true,
    sesionAbierta,
    correoOculto: ocultarCorreo(invitacion.email),
    taller: invitacion.nombre_taller ?? "un taller",
    invitador: invitacion.nombre_invitador ?? "Un administrador",
    rol: invitacion.rol as Rol,
  };
}
