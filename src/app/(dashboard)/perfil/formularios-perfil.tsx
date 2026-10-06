"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { actualizarMiNombre, cambiarMiClave, cerrarOtrasSesiones } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { ESTADO_FORM_INICIAL, type EstadoForm } from "@/lib/form-state";
import { enviarSinLimpiar } from "@/lib/enviar-formulario";

/** Avisa con un toast cada envío correcto. */
function useAvisoExito(estado: EstadoForm, mensaje: string) {
  useEffect(() => {
    if (estado.ok) toast.success(mensaje);
    // Sólo reacciona al resultado de cada envío.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);
}

function MensajeError({ estado }: { estado: EstadoForm }) {
  return estado.error ? (
    <p
      aria-live="polite"
      className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {estado.error}
    </p>
  ) : null;
}

export function FormularioNombre({
  nombre,
  correo,
  rol,
}: {
  nombre: string;
  correo: string;
  rol: string;
}) {
  const [estado, accion, enviando] = useActionState(actualizarMiNombre, ESTADO_FORM_INICIAL);
  useAvisoExito(estado, "Nombre actualizado.");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mis datos</CardTitle>
        <CardDescription>
          Correo: {correo} · Rol: {rol}. El correo y el rol los gestiona el
          administrador del taller.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviarSinLimpiar(accion)} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" name="nombre" defaultValue={nombre} maxLength={100} required />
          </div>
          <MensajeError estado={estado} />
          <Button type="submit" className="w-fit" disabled={enviando}>
            {enviando ? "Guardando…" : "Guardar nombre"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function FormularioClave() {
  const [estado, accion, enviando] = useActionState(cambiarMiClave, ESTADO_FORM_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);
  useAvisoExito(estado, "Contraseña cambiada. Se cerró tu sesión en los demás dispositivos.");

  // Tras un cambio correcto se limpian los campos.
  useEffect(() => {
    if (estado.ok) formulario.current?.reset();
  }, [estado]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cambiar contraseña</CardTitle>
        <CardDescription>
          Por seguridad te pedimos la actual. Al cambiarla se cierra tu sesión en
          los demás celulares y computadores.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formulario} onSubmit={enviarSinLimpiar(accion)} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="actual">Contraseña actual</Label>
            <PasswordInput id="actual" name="actual" autoComplete="current-password" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nueva">Nueva contraseña</Label>
            <PasswordInput
              id="nueva"
              name="nueva"
              autoComplete="new-password"
              minLength={10}
              required
            />
            <p className="text-xs text-muted-foreground">Mínimo 10 caracteres.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmacion">Repetir nueva contraseña</Label>
            <PasswordInput
              id="confirmacion"
              name="confirmacion"
              autoComplete="new-password"
              required
            />
          </div>
          <MensajeError estado={estado} />
          <Button type="submit" className="w-fit" disabled={enviando}>
            {enviando ? "Cambiando…" : "Cambiar contraseña"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function BotonCerrarSesiones() {
  const [estado, accion, enviando] = useActionState(cerrarOtrasSesiones, ESTADO_FORM_INICIAL);
  useAvisoExito(estado, "Se cerró tu sesión en los demás dispositivos.");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sesiones abiertas</CardTitle>
        <CardDescription>
          ¿Entraste desde un computador que no es tuyo o perdiste el celular?
          Cierra la sesión en todos los demás dispositivos. Ésta sigue abierta.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form onSubmit={enviarSinLimpiar(accion)}>
          <Button type="submit" variant="outline" disabled={enviando}>
            {enviando ? "Cerrando…" : "Cerrar sesión en los demás dispositivos"}
          </Button>
        </form>
        <MensajeError estado={estado} />
      </CardContent>
    </Card>
  );
}
