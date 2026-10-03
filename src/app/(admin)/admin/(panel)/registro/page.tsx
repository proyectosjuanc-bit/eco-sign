import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatearMomento } from "@/lib/format";
import { exigirSuperadmin } from "@/lib/superadmin";

export const metadata: Metadata = {
  title: "Registro de acciones · Superadmin · ECO-SIGN",
  robots: { index: false, follow: false },
};

const ETIQUETA_ACCION: Record<string, string> = {
  suspender_taller: "Suspendió un taller",
  reactivar_taller: "Reactivó un taller",
  agregar_superadmin: "Agregó un superadmin",
  quitar_superadmin: "Quitó un superadmin",
};

/** Las últimas 100 acciones de superadmin: quién, qué y cuándo. */
export default async function RegistroPage() {
  const { admin } = await exigirSuperadmin();
  const { data: acciones } = await admin
    .from("superadmin_log")
    .select("id, actor_email, accion, detalle, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Registro de acciones</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!acciones?.length ? (
          <p className="p-6 text-sm text-muted-foreground">Todavía no hay acciones registradas.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Quién</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Sobre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {acciones.map((a) => {
                const d = a.detalle as { taller?: string; email?: string };
                return (
                  <TableRow key={a.id}>
                    <TableCell className="text-muted-foreground">{formatearMomento(a.created_at, true)}</TableCell>
                    <TableCell>{a.actor_email ?? "—"}</TableCell>
                    <TableCell>{ETIQUETA_ACCION[a.accion] ?? a.accion}</TableCell>
                    <TableCell className="text-muted-foreground">{d.taller ?? d.email ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
