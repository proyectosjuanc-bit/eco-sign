"use client";

import { useActionState, useState } from "react";

import { guardarNuevaClave } from "../../actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { ESTADO_AUTH_INICIAL } from "@/lib/form-state";

const MIN_PASSWORD = 10;

/** Nueva contraseña y su repetición. Al guardar, entra directo al panel. */
export function FormularioNuevaClave({ correoOculto }: { correoOculto: string }) {
  const [estado, accion, enviando] = useActionState(guardarNuevaClave, ESTADO_AUTH_INICIAL);
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const coinciden = password === confirmacion;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crea una nueva contraseña</CardTitle>
        <CardDescription>Para la cuenta {correoOculto}.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={accion} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="password">Nueva contraseña</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
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
            <Label htmlFor="confirmacion">Repetir contraseña</Label>
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

          {estado.error ? (
            <p
              aria-live="polite"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {estado.error}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={enviando || password.length < MIN_PASSWORD || !coinciden}
          >
            {enviando ? "Guardando…" : "Guardar y entrar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
