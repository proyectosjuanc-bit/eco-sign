"use client";

import { useTransition } from "react";

import { cerrarSesion } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

/** Cierra la sesión con una Server Action y deshabilita el botón mientras corre. */
export function BotonLogout() {
  const [enviando, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={enviando}
      onClick={() => startTransition(() => cerrarSesion())}
    >
      {enviando ? "Saliendo…" : "Salir"}
    </Button>
  );
}
