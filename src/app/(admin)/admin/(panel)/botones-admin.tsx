"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";

import { agregarSuperadmin, cambiarEstadoTaller, quitarSuperadmin } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_FORM_INICIAL } from "@/lib/form-state";
import { enviarSinLimpiar } from "@/lib/enviar-formulario";

export function BotonEstadoTaller({
  tenantId,
  nombre,
  suspendido,
}: {
  tenantId: string;
  nombre: string;
  suspendido: boolean;
}) {
  const [enCurso, iniciar] = useTransition();
  const nuevo = suspendido ? "activo" : "suspendido";

  return (
    <Button
      variant={suspendido ? "default" : "destructive"}
      disabled={enCurso}
      onClick={() => {
        const pregunta = suspendido
          ? `¿Reactivar «${nombre}»? Sus usuarios vuelven a ver y registrar sus datos.`
          : `¿Suspender «${nombre}»?\n\nSus usuarios dejarán de ver y registrar datos y verán un aviso para contactar a soporte. No se borra nada; puedes reactivarlo cuando quieras.`;
        if (!window.confirm(pregunta)) return;
        iniciar(async () => {
          const r = await cambiarEstadoTaller(tenantId, nuevo);
          if (r.ok) toast.success(r.mensaje);
          else toast.error(r.mensaje);
        });
      }}
    >
      {enCurso ? "Guardando…" : suspendido ? "Reactivar taller" : "Suspender taller"}
    </Button>
  );
}

export function FormularioAgregarSuperadmin() {
  const [estado, accion, enviando] = useActionState(agregarSuperadmin, ESTADO_FORM_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok) {
      toast.success("Superadmin agregado.");
      formulario.current?.reset();
    }
  }, [estado]);

  return (
    <form ref={formulario} onSubmit={enviarSinLimpiar(accion)} className="flex flex-col gap-3">
      <div className="grid gap-2">
        <Label htmlFor="email">Correo de la cuenta</Label>
        <Input id="email" name="email" type="email" placeholder="persona@correo.com" required />
        <p className="text-xs text-muted-foreground">
          Debe ser una cuenta de ECO-SIGN ya registrada y con el correo confirmado.
          Al entrar a este panel, se le pedirá configurar su verificación en dos pasos.
        </p>
      </div>
      {estado.error ? (
        <p aria-live="polite" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {estado.error}
        </p>
      ) : null}
      <Button type="submit" className="w-fit" disabled={enviando}>
        {enviando ? "Agregando…" : "Agregar superadmin"}
      </Button>
    </form>
  );
}

export function BotonQuitarSuperadmin({ userId, email }: { userId: string; email: string }) {
  const [enCurso, iniciar] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-destructive"
      disabled={enCurso}
      onClick={() => {
        if (!window.confirm(`¿Quitar a ${email} como superadmin?`)) return;
        iniciar(async () => {
          const r = await quitarSuperadmin(userId);
          if (r.ok) toast.success(r.mensaje);
          else toast.error(r.mensaje);
        });
      }}
    >
      {enCurso ? "Quitando…" : "Quitar"}
    </Button>
  );
}
