import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { formatearMoneda } from "@/lib/format";
import { SUSCRIPCION_MENSUAL } from "@/lib/roi";
import { getUsuarioActual } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/** Portada pública. Con sesión iniciada, lleva directo al panel. */
export default async function Home() {
  if (await getUsuarioActual()) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col items-center justify-center gap-8 p-6 text-center">
      <div>
        <p className="text-3xl font-bold tracking-tight">
          ECO<span className="text-emerald-600">·</span>SIGN
        </p>
        <h1 className="mt-6 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Tu desperdicio paga el software.
        </h1>
        <p className="mt-4 text-pretty text-lg text-muted-foreground">
          Mide el material que pierdes, reutiliza los sobrantes y comprueba en
          pesos cuánto ahorra tu taller cada mes.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/register" className={cn(buttonVariants({ size: "lg" }))}>
          Crear cuenta
        </Link>
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
        >
          Entrar
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        Suscripción fija de {formatearMoneda(SUSCRIPCION_MENSUAL)} al mes.
      </p>
    </main>
  );
}
