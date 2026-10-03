"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { invitarEmpleadoFormulario } from "@/app/(dashboard)/configuracion/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_FORM_INICIAL } from "@/lib/form-state";
import { DESCRIPCION_ROL, ETIQUETA_ROL, ROLES } from "@/lib/roles";
import { cn } from "@/lib/utils";

/** Botón «Invitar empleado» y su ventana con el formulario. */
export function ModalInvitar() {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button size="lg" onClick={() => setAbierto(true)}>
        Invitar empleado
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          {/* Se remonta con una key nueva cada vez que se abre, para que el
              formulario y useActionState arranquen siempre limpios. */}
          <FormularioInvitar
            key={abierto ? "abierto" : "cerrado"}
            onEnviada={() => setAbierto(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormularioInvitar({ onEnviada }: { onEnviada: () => void }) {
  const [estado, accion, enviando] = useActionState(
    invitarEmpleadoFormulario,
    ESTADO_FORM_INICIAL,
  );
  // Controlado sólo para poder nombrar el correo en el aviso de éxito.
  const [email, setEmail] = useState("");

  // La lista de invitaciones se actualiza sola: la acción hace revalidatePath.
  useEffect(() => {
    if (!estado.ok) return;
    if (estado.aviso) toast.warning(estado.aviso);
    else toast.success(`Invitación enviada a ${email}`);
    onEnviada();
    // Sólo reacciona al resultado de cada envío.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Invitar empleado</DialogTitle>
        <DialogDescription>
          Le enviaremos un correo con un enlace para unirse a tu taller. El enlace
          vale 7 días.
        </DialogDescription>
      </DialogHeader>

      <form action={accion} className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="nombre_invitado">Nombre (opcional)</Label>
          <Input
            id="nombre_invitado"
            name="nombre_invitado"
            autoComplete="off"
            maxLength={80}
            placeholder="Carlos Gómez"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="email_invitado">Correo</Label>
          <Input
            id="email_invitado"
            name="email"
            type="email"
            autoComplete="off"
            required
            placeholder="empleado@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Rol</legend>
          {ROLES.map((rol) => (
            <label
              key={rol}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border p-3",
                "has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50",
              )}
            >
              <input
                type="radio"
                name="rol"
                value={rol}
                defaultChecked={rol === "operario"}
                className="mt-1 accent-emerald-600"
              />
              <span>
                <span className="block text-sm font-medium">{ETIQUETA_ROL[rol]}</span>
                <span className="block text-xs text-muted-foreground">
                  {DESCRIPCION_ROL[rol]}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {estado.error ? (
          <p
            aria-live="polite"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {estado.error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="submit" disabled={enviando}>
            {enviando ? "Enviando…" : "Enviar invitación"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
