"use client";

import Link from "next/link";
import { useActionState } from "react";

import { registrarse } from "../actions";
import { ESTADO_AUTH_INICIAL } from "@/lib/form-state";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * Alta de empresa. "empresa" y "nombre" viajan como user metadata del signUp:
 * el trigger handle_new_user los usa para crear el tenant y el profile.
 */
export default function RegisterPage() {
  const [estado, accion, enviando] = useActionState(
    registrarse,
    ESTADO_AUTH_INICIAL,
  );

  // Con confirmación por correo activada no hay sesión todavía: se muestra el
  // aviso en lugar del formulario para que nadie lo reenvíe.
  if (estado.mensaje) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Revisa tu correo</CardTitle>
          <CardDescription>{estado.mensaje}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className={cn(buttonVariants(), "w-full")}>
            Ir a entrar
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>
          Registra tu empresa y empieza a medir tu ahorro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={accion} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="empresa">Empresa</Label>
            <Input
              id="empresa"
              name="empresa"
              placeholder="Publicidad del Norte"
              autoComplete="organization"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="nombre">Tu nombre</Label>
            <Input
              id="nombre"
              name="nombre"
              placeholder="María Restrepo"
              autoComplete="name"
              required
            />
          </div>

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
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
            />
            <p className="text-xs text-muted-foreground">Mínimo 6 caracteres.</p>
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
            {enviando ? "Creando cuenta…" : "Crear cuenta"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-foreground underline">
              Entrar
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
