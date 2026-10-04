"use server";

import { after } from "next/server";

import { despacharPush } from "@/lib/notificaciones/push";
import { createClient } from "@/lib/supabase/server";

/**
 * Manda un aviso de prueba a la propia persona: aparece en la campanita y en
 * todos sus dispositivos con avisos activos. La base limita a 5 por hora.
 */
export async function probarAviso(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("probar_aviso");
  if (error) {
    return {
      error: error.code === "P0001" ? error.message : "No pudimos enviar el aviso de prueba.",
    };
  }
  after(despacharPush);
  return { error: null };
}
