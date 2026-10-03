"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { exigirSuperadminSinMfa } from "@/lib/superadmin";

/**
 * Empieza a configurar la verificación en dos pasos: crea un factor TOTP y
 * devuelve el QR para escanearlo con Google Authenticator (o similar).
 * Antes borra los intentos sin terminar, para no acumular factores a medias.
 */
export async function iniciarConfiguracion(): Promise<
  { ok: true; factorId: string; qr: string; secreto: string } | { ok: false; error: string }
> {
  const { supabase } = await exigirSuperadminSinMfa();

  const { data: factores } = await supabase.auth.mfa.listFactors();
  for (const f of factores?.all ?? []) {
    if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `ECO-SIGN superadmin ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) {
    console.error("[superadmin] No se pudo iniciar la verificación en dos pasos", error?.message);
    return {
      ok: false,
      error:
        "No pudimos iniciar la configuración. Revisa que la verificación en dos pasos (TOTP) esté activada en Supabase.",
    };
  }

  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret };
}

const esquemaCodigo = z.object({
  factorId: z.string().min(1),
  codigo: z.string().trim().regex(/^\d{6}$/, { error: "Escribe los 6 números que muestra la app." }),
});

/** Comprueba el código de 6 dígitos y sube la sesión al nivel aal2. */
export async function verificarCodigo(
  factorId: string,
  codigo: string,
): Promise<{ ok: false; error: string }> {
  const validacion = esquemaCodigo.safeParse({ factorId, codigo });
  if (!validacion.success) {
    return { ok: false, error: validacion.error.issues[0]?.message ?? "Código no válido." };
  }

  const { supabase } = await exigirSuperadminSinMfa();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: validacion.data.factorId,
    code: validacion.data.codigo,
  });
  if (error) {
    return { ok: false, error: "Código incorrecto o vencido. Espera el siguiente y vuelve a intentar." };
  }

  redirect("/admin");
}
