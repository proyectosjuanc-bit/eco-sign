"use client";

import { useState, useTransition } from "react";

import { iniciarConfiguracion, verificarCodigo } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Segundo paso del panel de superadmin.
 * - Con `factorId`: ya está configurado, sólo pide el código.
 * - Sin él: guía la configuración (QR) y luego pide el primer código.
 */
export function FormularioVerificacion({ factorId: factorInicial }: { factorId: string | null }) {
  const [factorId, setFactorId] = useState(factorInicial);
  const [qr, setQr] = useState<string | null>(null);
  const [secreto, setSecreto] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enCurso, iniciar] = useTransition();

  function configurar() {
    setError(null);
    iniciar(async () => {
      const r = await iniciarConfiguracion();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setFactorId(r.factorId);
      setQr(r.qr);
      setSecreto(r.secreto);
    });
  }

  function verificar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    iniciar(async () => {
      // Si es correcto, la acción redirige al panel.
      const r = await verificarCodigo(factorId, codigo);
      if (r && !r.ok) setError(r.error);
    });
  }

  const configurando = !factorInicial;

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Verificación en dos pasos</CardTitle>
        <CardDescription>
          {configurando
            ? "El panel de superadmin ve los datos de todos los talleres. Por eso, además de tu contraseña, pide un código de una app en tu celular."
            : "Escribe el código de 6 números que muestra tu app de autenticación."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {configurando && !qr ? (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Instala en tu celular <strong>Google Authenticator</strong> (o Microsoft Authenticator).</li>
              <li>Pulsa el botón de abajo y escanea el código QR con esa app.</li>
              <li>Escribe el código de 6 números que te muestre.</li>
            </ol>
            <Button onClick={configurar} disabled={enCurso}>
              {enCurso ? "Preparando…" : "Configurar verificación"}
            </Button>
          </>
        ) : null}

        {qr ? (
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- QR en SVG de Supabase */}
            <img src={qr} alt="Código QR para la app de autenticación" className="size-48 bg-white p-2" />
            {secreto ? (
              <p className="text-center text-xs text-muted-foreground">
                ¿No puedes escanear? Escribe esta clave en la app:{" "}
                <code className="break-all font-mono text-foreground">{secreto}</code>
              </p>
            ) : null}
          </div>
        ) : null}

        {factorId ? (
          <form onSubmit={verificar} className="flex flex-col gap-3">
            <div className="grid gap-2">
              <Label htmlFor="codigo">Código de 6 números</Label>
              <Input
                id="codigo"
                name="codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                className="text-center font-mono text-lg tracking-widest"
                autoFocus
                required
              />
            </div>
            <Button type="submit" disabled={enCurso || codigo.length !== 6}>
              {enCurso ? "Verificando…" : "Verificar y entrar"}
            </Button>
          </form>
        ) : null}

        {error ? (
          <p aria-live="polite" className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
