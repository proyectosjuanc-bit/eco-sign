import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CORREO_SOPORTE,
  WHATSAPP_SOPORTE_VISIBLE,
  enlaceWhatsApp,
} from "@/lib/soporte";

/** Cómo pedir ayuda. Aparece en Configuración (admins) y en Mi perfil (todos). */
export function TarjetaSoporte() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Soporte y ayuda</CardTitle>
        <CardDescription>
          ¿Algo no funciona o tienes una duda? Escríbenos y te ayudamos.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <a
          href={enlaceWhatsApp()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
        >
          Escribir por WhatsApp ({WHATSAPP_SOPORTE_VISIBLE})
        </a>
        <p className="text-muted-foreground">
          O por correo:{" "}
          <a
            href={`mailto:${CORREO_SOPORTE}?subject=${encodeURIComponent("Soporte ECO-SIGN")}`}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {CORREO_SOPORTE}
          </a>
        </p>
        <p className="text-muted-foreground">
          Antes de escribir, quizá te sirva la{" "}
          <Link href="/guia" className="font-medium text-foreground underline underline-offset-4">
            guía de uso
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
