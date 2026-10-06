"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

import { iniciarSesion } from "../actions";
import { ESTADO_AUTH_INICIAL } from "@/lib/form-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { enviarSinLimpiar } from "@/lib/enviar-formulario";

export function FormularioLogin() {
  const [estado, accion, enviando] = useActionState(
    iniciarSesion,
    ESTADO_AUTH_INICIAL,
  );
  // El proxy guarda aquí la ruta que el usuario intentaba abrir sin sesión.
  const parametros = useSearchParams();
  const destino = parametros.get("redirect") ?? "";
  // /auth/confirmar manda aquí cuando el enlace del correo no sirvió.
  const confirmacionFallida = parametros.get("confirmacion") === "fallida";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Accede al panel de tu empresa.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviarSinLimpiar(accion)} className="flex flex-col gap-4">
          <input type="hidden" name="redirect" value={destino} />

          {confirmacionFallida && !estado.error ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Ese enlace de confirmación ya se usó o venció. Si ya confirmaste
              tu cuenta, entra con tu correo y contraseña.
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

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Link
                href="/recuperar"
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
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
            {enviando ? "Entrando…" : "Entrar"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="font-medium text-foreground underline">
              Crear una
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
