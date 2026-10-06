"use client";

import Link from "next/link";
import { useActionState } from "react";

import { solicitarRecuperacion } from "../actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_AUTH_INICIAL } from "@/lib/form-state";
import { cn } from "@/lib/utils";
import { enviarSinLimpiar } from "@/lib/enviar-formulario";

export function FormularioRecuperar({ enlaceInvalido }: { enlaceInvalido: boolean }) {
  const [estado, accion, enviando] = useActionState(
    solicitarRecuperacion,
    ESTADO_AUTH_INICIAL,
  );

  // Enviado: se muestra el aviso en lugar del formulario para que no lo reenvíe
  // varias veces (mismo patrón que /register).
  if (estado.mensaje) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Revisa tu correo</CardTitle>
          <CardDescription>{estado.mensaje}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
            Volver a entrar
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>¿Olvidaste tu contraseña?</CardTitle>
        <CardDescription>
          Escribe el correo con el que entras a ECO-SIGN y te enviamos un enlace
          para crear una nueva.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviarSinLimpiar(accion)} className="flex flex-col gap-4">
          {enlaceInvalido && !estado.error ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Ese enlace ya se usó o venció (duran 1 hora). Pide uno nuevo aquí.
            </p>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="tu@empresa.com"
              required
            />
          </div>

          {estado.error ? (
            <p
              aria-live="polite"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {estado.error}
            </p>
          ) : null}

          <Button type="submit" disabled={enviando}>
            {enviando ? "Enviando…" : "Enviarme el enlace"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            ¿La recordaste?{" "}
            <Link href="/login" className="font-medium text-foreground underline">
              Entrar
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
