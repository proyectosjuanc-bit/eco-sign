import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FormularioVerificacion } from "./formulario-verificacion";
import { exigirSuperadminSinMfa } from "@/lib/superadmin";

export const metadata: Metadata = {
  title: "Verificación · Superadmin · ECO-SIGN",
  robots: { index: false, follow: false },
};

/**
 * Segundo paso para entrar al panel de superadmin: configurar la app de
 * autenticación la primera vez, o pedir el código en cada sesión nueva.
 */
export default async function VerificacionPage() {
  const { supabase } = await exigirSuperadminSinMfa();

  const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (nivel?.currentLevel === "aal2") redirect("/admin");

  const { data: factores } = await supabase.auth.mfa.listFactors();
  const verificado = factores?.totp.find((f) => f.status === "verified");

  return <FormularioVerificacion factorId={verificado?.id ?? null} />;
}
