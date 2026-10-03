import type { Metadata } from "next";

import { FormularioRecuperar } from "./formulario-recuperar";

export const metadata: Metadata = { title: "Recuperar contraseña · ECO-SIGN" };

/**
 * "¿Olvidaste tu contraseña?": pide el correo y envía el enlace para crear una
 * nueva. `?enlace=invalido` llega desde /auth/confirmar cuando el enlace del
 * correo ya se usó o venció.
 */
export default async function RecuperarPage({
  searchParams,
}: {
  searchParams: Promise<{ enlace?: string }>;
}) {
  const { enlace } = await searchParams;
  return <FormularioRecuperar enlaceInvalido={enlace === "invalido"} />;
}
