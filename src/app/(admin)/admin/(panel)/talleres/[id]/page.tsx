import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BotonEstadoTaller } from "../../botones-admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatearMoneda, formatearMomento } from "@/lib/format";
import { ETIQUETA_ROL } from "@/lib/roles";
import { rangoMesActual } from "@/lib/roi";
import { exigirSuperadmin } from "@/lib/superadmin";
import type { Rol } from "@/types/database";

export const metadata: Metadata = {
  title: "Ficha del taller · Superadmin · ECO-SIGN",
  robots: { index: false, follow: false },
};

/** Ficha de un taller, sólo para ver (más suspender/reactivar). */
export default async function FichaTallerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { admin } = await exigirSuperadmin();
  const { inicio: inicioMes } = rangoMesActual();

  const { data: taller } = await admin.from("tenants").select("*").eq("id", id).maybeSingle();
  if (!taller) notFound();

  const [
    { data: equipo },
    { data: usuarios },
    { count: materiales },
    { data: sobrantes },
    { count: trabajos },
    { data: ahorros },
    { data: desperdicio },
    { count: invitacionesPendientes },
    { count: maquinas },
  ] = await Promise.all([
    admin.from("profiles").select("id, nombre, email, rol, activo").eq("tenant_id", id).order("email"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("materials").select("id", { count: "exact", head: true }).eq("tenant_id", id).eq("archivado", false),
    admin.from("inventory_items").select("costo_estimado").eq("tenant_id", id).eq("usado", false),
    admin.from("jobs").select("id", { count: "exact", head: true }).eq("tenant_id", id),
    admin.from("savings").select("monto").eq("tenant_id", id).gte("fecha", inicioMes),
    admin.from("waste_logs").select("costo").eq("tenant_id", id),
    admin
      .from("invitaciones")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", id)
      .eq("aceptada", false)
      .gt("expira_en", new Date().toISOString()),
    admin.from("machines").select("id", { count: "exact", head: true }).eq("tenant_id", id),
  ]);

  const ingreso = new Map((usuarios?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));
  const suma = (filas: { [k: string]: unknown }[] | null, campo: string) =>
    (filas ?? []).reduce((t, f) => t + Number(f[campo] ?? 0), 0);

  const suspendido = taller.estado === "suspendido";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-muted-foreground underline underline-offset-4">
            ← Todos los talleres
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{taller.nombre}</h1>
          <p className="text-sm text-muted-foreground">
            Registrado el {formatearMomento(taller.created_at)} ·{" "}
            {suspendido ? (
              <Badge variant="destructive">Suspendido desde {formatearMomento(taller.suspendido_en)}</Badge>
            ) : (
              <Badge className="bg-emerald-600 text-white">Activo</Badge>
            )}
          </p>
        </div>
        <BotonEstadoTaller tenantId={taller.id} nombre={taller.nombre} suspendido={suspendido} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dato titulo="Materiales activos" valor={String(materiales ?? 0)} />
        <Dato
          titulo="Sobrantes disponibles"
          valor={String(sobrantes?.length ?? 0)}
          nota={formatearMoneda(suma(sobrantes, "costo_estimado"))}
        />
        <Dato titulo="Trabajos" valor={String(trabajos ?? 0)} />
        <Dato titulo="Ahorro del mes" valor={formatearMoneda(suma(ahorros, "monto"))} />
        <Dato titulo="Desperdicio acumulado" valor={formatearMoneda(suma(desperdicio, "costo"))} />
        <Dato titulo="Máquinas en Capacidad" valor={String(maquinas ?? 0)} />
        <Dato titulo="Invitaciones pendientes" valor={String(invitacionesPendientes ?? 0)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de la empresa</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p><span className="text-muted-foreground">NIT:</span> {taller.nit ?? "—"}</p>
          <p><span className="text-muted-foreground">Teléfono:</span> {taller.telefono ?? "—"}</p>
          <p><span className="text-muted-foreground">Ciudad:</span> {taller.ciudad ?? "—"}</p>
          <p><span className="text-muted-foreground">Dirección:</span> {taller.direccion ?? "—"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equipo</CardTitle>
          <CardDescription>Sólo lectura: los cambios los hace el administrador del taller.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Último ingreso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(equipo ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.nombre ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  <TableCell>{ETIQUETA_ROL[m.rol as Rol] ?? m.rol}</TableCell>
                  <TableCell>{m.activo ? "Activo" : "Inactivo"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatearMomento(ingreso.get(m.id), true)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Dato({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
        <p className="mt-1 text-xl font-bold tabular-nums">{valor}</p>
        {nota ? <p className="text-xs text-muted-foreground">{nota}</p> : null}
      </CardContent>
    </Card>
  );
}
