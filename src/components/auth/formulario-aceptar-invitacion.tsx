"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { aceptarInvitacion } from "@/app/(auth)/actions";
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
import { PasswordInput } from "@/components/ui/password-input";
import { ETIQUETA_ROL } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { Rol } from "@/types/database";

const MIN_PASSWORD = 10;

/**
 * Formulario de la persona invitada: nombre, contraseña y aceptación de términos.
 *
 * Valida en el navegador para dar respuesta inmediata; el servidor repite las
 * mismas reglas (el navegador se puede saltar).
 */
export function FormularioAceptarInvitacion({
  token,
  correoOculto,
  taller,
  invitador,
  rol,
}: {
  token: string;
  /** Ya enmascarado en el servidor, por ejemplo "j***@gmail.com". */
  correoOculto: string;
  taller: string;
  invitador: string;
  rol: Rol;
}) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creada, setCreada] = useState(false);
  const [yaExistia, setYaExistia] = useState(false);
  // Candado síncrono contra el doble envío: `enviando` (useTransition) sólo
  // cambia después del siguiente render, y dos clics rápidos o Enter + clic
  // caben dentro de ese margen. El ref cambia al instante.
  const enviadoRef = useRef(false);

  const nombreLimpio = nombre.trim();
  const coinciden = password === confirmacion;

  function validar(): string | null {
    if (nombreLimpio.length < 2) return "Escribe tu nombre completo.";
    if (password.length < MIN_PASSWORD) {
      return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
    }
    if (!coinciden) return "Las contraseñas no coinciden.";
    if (!aceptaTerminos) {
      return "Debes aceptar los Términos y Condiciones y la Política de Privacidad.";
    }
    return null;
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviadoRef.current) return;
    const problema = validar();
    if (problema) {
      setError(problema);
      return;
    }
    setError(null);
    enviadoRef.current = true;

    iniciar(async () => {
      const resultado = await aceptarInvitacion({
        token,
        nombre: nombreLimpio,
        password,
        aceptaTerminos,
      });

      if (!resultado.ok) {
        // Falló: se libera el candado para que pueda corregir y reintentar.
        enviadoRef.current = false;
        setError(resultado.error ?? "No pudimos crear tu cuenta. Intenta de nuevo.");
        return;
      }
      // La cuenta ya estaba creada (p. ej. un envío anterior sí funcionó).
      if (resultado.yaExistia) {
        setYaExistia(true);
        return;
      }
      // Sin confirmación de correo ya hay sesión: directo al panel.
      if (resultado.sesionIniciada) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      setCreada(true);
    });
  }

  if (yaExistia) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tu cuenta ya está lista</CardTitle>
          <CardDescription>
            Esta cuenta ya existía. Inicia sesión con tu correo y contraseña para
            entrar a tu taller.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className={cn(buttonVariants(), "w-full")}>
            Ir al login
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Con la confirmación de correo activada no hay sesión todavía: se muestra el
  // aviso en lugar del formulario (mismo patrón que /register).
  if (creada) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>¡Bienvenido a {taller}!</CardTitle>
          <CardDescription>
            Tu cuenta fue creada. Revisa tu correo ({correoOculto}) y toca el enlace
            de confirmación para activarla. Si no lo ves, revisa la carpeta de spam.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className={cn(buttonVariants(), "w-full")}>
            Ir al login
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Únete a {taller}</CardTitle>
        <CardDescription>
          {invitador} te invitó como {ETIQUETA_ROL[rol].toLowerCase()}. Usarás el
          correo {correoOculto}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="nombre">Nombre completo</Label>
            <Input
              id="nombre"
              name="nombre"
              autoComplete="name"
              maxLength={100}
              placeholder="María Restrepo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Mínimo {MIN_PASSWORD} caracteres.
              {password.length > 0 && password.length < MIN_PASSWORD
                ? ` Te faltan ${MIN_PASSWORD - password.length}.`
                : ""}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="confirmacion">Confirmar contraseña</Label>
            <PasswordInput
              id="confirmacion"
              name="confirmacion"
              autoComplete="new-password"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              aria-invalid={confirmacion.length > 0 && !coinciden}
              required
            />
            {confirmacion.length > 0 && !coinciden ? (
              <p className="text-xs text-destructive">Las contraseñas no coinciden.</p>
            ) : null}
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="acepta_terminos"
              checked={aceptaTerminos}
              onChange={(e) => setAceptaTerminos(e.target.checked)}
              className="mt-1 accent-emerald-600"
              required
            />
            <span>
              Acepto los{" "}
              <Link href="/terminos" target="_blank" className="font-medium underline">
                Términos y Condiciones
              </Link>{" "}
              y la{" "}
              <Link href="/privacidad" target="_blank" className="font-medium underline">
                Política de Privacidad
              </Link>
              .
            </span>
          </label>

          {error ? (
            <p
              aria-live="polite"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={enviando} aria-busy={enviando}>
            {enviando ? "Creando cuenta…" : "Crear cuenta y unirme"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
