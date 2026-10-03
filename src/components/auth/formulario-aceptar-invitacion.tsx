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

/** Lo que la página sabe de la invitación al dibujarse. */
export type DatosInvitacion =
  | {
      valida: true;
      /** Ya enmascarado en el servidor, por ejemplo "j***@gmail.com". */
      correoOculto: string;
      taller: string;
      invitador: string;
      rol: Rol;
      /** Correo (oculto) de otra cuenta con sesión abierta en este navegador. */
      sesionAbierta?: string;
    }
  | { valida: false; mensaje: string };

/**
 * Pantalla completa de la invitación: el formulario, el aviso de invitación
 * inválida y los avisos de éxito.
 *
 * Todo vive en este único componente a propósito (ver la página): al crear la
 * cuenta, Next vuelve a renderizar la página y `datos` pasa a "ya usada", pero
 * el estado `creada` de aquí se conserva y sigue mostrando el éxito.
 *
 * Valida en el navegador para dar respuesta inmediata; el servidor repite las
 * mismas reglas (el navegador se puede saltar).
 */
export function FormularioAceptarInvitacion({
  token,
  datos,
}: {
  token: string;
  datos: DatosInvitacion;
}) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Al crear la cuenta se guarda lo que muestra el aviso de éxito, porque
  // después `datos` llega como "invitación ya usada" y ya no los trae.
  const [creada, setCreada] = useState<{ taller: string; correoOculto: string } | null>(null);
  const [yaExistia, setYaExistia] = useState(false);
  // Cuenta creada y sesión iniciada: mientras navega al panel se muestra un
  // aviso, para que el re-render de la página (invitación ya usada) no asome.
  const [entrando, setEntrando] = useState(false);
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
      // Cuenta creada y sesión iniciada: directo al panel.
      if (resultado.sesionIniciada) {
        setEntrando(true);
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      if (datos.valida) {
        setCreada({ taller: datos.taller, correoOculto: datos.correoOculto });
      } else {
        setCreada({ taller: "tu taller", correoOculto: "tu correo" });
      }
    });
  }

  if (entrando) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>¡Listo! Entrando a tu taller…</CardTitle>
          <CardDescription>Tu cuenta quedó creada. En un momento verás el panel.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (yaExistia) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tu cuenta ya está lista</CardTitle>
          <CardDescription>
            Inicia sesión con tu correo y la contraseña que elegiste para entrar a
            tu taller.
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
          <CardTitle>¡Bienvenido a {creada.taller}!</CardTitle>
          <CardDescription>
            Tu cuenta fue creada. Revisa tu correo ({creada.correoOculto}) y toca el enlace
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

  if (!datos.valida) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No pudimos abrir la invitación</CardTitle>
          <CardDescription>{datos.mensaje}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Link href="/login" className={cn(buttonVariants(), "w-full")}>
            Ir al login
          </Link>
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
            Ir al inicio
          </Link>
        </CardContent>
      </Card>
    );
  }

  const { taller, invitador, rol, correoOculto, sesionAbierta } = datos;

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
        {sesionAbierta ? (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            En este navegador hay una sesión abierta con otra cuenta ({sesionAbierta}).
            Al crear tu cuenta se cerrará y entrarás con la nueva.
          </p>
        ) : null}
        {/* method="post": si el JavaScript no llegara a cargar, el navegador
            enviaría el formulario por su cuenta; con GET la contraseña
            acabaría en la URL (historial, registros del servidor). */}
        <form onSubmit={enviar} method="post" className="flex flex-col gap-4" noValidate>
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
