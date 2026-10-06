import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatearMoneda, formatearMomento } from "@/lib/format";
import { aFechaIso, rangoMesActual } from "@/lib/roi";
import { exigirSuperadmin } from "@/lib/superadmin";
import { ListaBuscable } from "@/components/ui/lista-buscable";

export const metadata: Metadata = {
  title: "Talleres · Superadmin · ECO-SIGN",
  robots: { index: false, follow: false },
};

const DIA = 24 * 60 * 60 * 1000;

/**
 * La hora de esta petición. Es un componente de servidor que se renderiza una
 * vez por visita, así que leer el reloj aquí es intencional.
 */
function ahoraMs(): number {
  return Date.now();
}

/**
 * Todos los talleres con su actividad, para ver quién usa la app de verdad.
 *
 * Lee con la clave de servicio (exigirSuperadmin). Trae columnas mínimas y
 * cuenta aquí: para decenas de talleres sobra. Con cientos habrá que pasar los
 * conteos a funciones de la base (PostgREST corta en 1.000 filas por consulta).
 */
export default async function AdminTalleresPage() {
  const { admin } = await exigirSuperadmin();

  const ahora = ahoraMs();
  const hace30 = new Date(ahora - 30 * DIA).toISOString();
  const { inicio: inicioMes } = rangoMesActual();

  const [
    { data: talleres },
    { data: perfiles },
    { data: materiales },
    { data: trabajos },
    { data: ahorros },
    { data: usuarios },
    { count: invitacionesAceptadas },
  ] = await Promise.all([
    admin.from("tenants").select("id, nombre, ciudad, estado, created_at").order("created_at", { ascending: false }),
    admin.from("profiles").select("id, tenant_id, activo"),
    admin.from("materials").select("tenant_id").eq("archivado", false),
    admin.from("jobs").select("tenant_id").gte("created_at", hace30),
    admin.from("savings").select("tenant_id, monto").gte("fecha", inicioMes),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("invitaciones").select("id", { count: "exact", head: true }).eq("aceptada", true),
  ]);

  // Último ingreso de cada usuario (Auth) → último ingreso del taller.
  const ultimoIngresoUsuario = new Map(
    (usuarios?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]),
  );

  const porTaller = new Map<
    string,
    { usuarios: number; ultimoIngreso: string | null; materiales: number; trabajos30: number; ahorroMes: number }
  >();
  const fila = (id: string) => {
    let f = porTaller.get(id);
    if (!f) {
      f = { usuarios: 0, ultimoIngreso: null, materiales: 0, trabajos30: 0, ahorroMes: 0 };
      porTaller.set(id, f);
    }
    return f;
  };

  for (const p of perfiles ?? []) {
    const f = fila(p.tenant_id);
    if (p.activo) f.usuarios++;
    const ingreso = ultimoIngresoUsuario.get(p.id);
    if (ingreso && (!f.ultimoIngreso || ingreso > f.ultimoIngreso)) f.ultimoIngreso = ingreso;
  }
  for (const m of materiales ?? []) fila(m.tenant_id).materiales++;
  for (const j of trabajos ?? []) fila(j.tenant_id).trabajos30++;
  for (const a of ahorros ?? []) fila(a.tenant_id).ahorroMes += Number(a.monto);

  const lista = talleres ?? [];
  const activos30 = lista.filter((t) => {
    const f = porTaller.get(t.id);
    return Boolean(f && ((f.ultimoIngreso && f.ultimoIngreso >= hace30) || f.trabajos30 > 0));
  }).length;
  const totalUsuarios = (perfiles ?? []).filter((p) => p.activo).length;

  // Registros por semana, últimas 8 semanas (la más reciente primero).
  const semanas = Array.from({ length: 8 }, (_, i) => {
    const fin = ahora - i * 7 * DIA;
    const inicio = fin - 7 * DIA;
    const n = lista.filter((t) => {
      const c = new Date(t.created_at).getTime();
      return c > inicio && c <= fin;
    }).length;
    return { etiqueta: i === 0 ? "Esta semana" : `Hace ${i} sem.`, desde: aFechaIso(new Date(inicio)), n };
  });
  const maxSemana = Math.max(1, ...semanas.map((s) => s.n));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dato titulo="Talleres registrados" valor={lista.length} />
        <Dato titulo="Activos (últimos 30 días)" valor={activos30} nota="con ingreso o trabajos" />
        <Dato titulo="Usuarios activos" valor={totalUsuarios} />
        <Dato titulo="Invitaciones aceptadas" valor={invitacionesAceptadas ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Talleres nuevos por semana</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-sm">
          {semanas.map((s) => (
            <div key={s.desde} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-muted-foreground">{s.etiqueta}</span>
              <div className="h-3 flex-1 rounded bg-muted">
                <div className="h-3 rounded bg-emerald-600" style={{ width: `${(s.n / maxSemana) * 100}%` }} />
              </div>
              <span className="w-6 text-right tabular-nums">{s.n}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Talleres</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ListaBuscable placeholder="Buscar taller o correo…">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Taller</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead className="text-right">Usuarios</TableHead>
                <TableHead>Último ingreso</TableHead>
                <TableHead className="text-right">Materiales</TableHead>
                <TableHead className="text-right">Trabajos 30 d</TableHead>
                <TableHead className="text-right">Ahorro del mes</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((t) => {
                const f = porTaller.get(t.id);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/talleres/${t.id}`} className="underline underline-offset-4">
                        {t.nombre}
                      </Link>
                      {t.ciudad ? <span className="block text-xs text-muted-foreground">{t.ciudad}</span> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatearMomento(t.created_at)}</TableCell>
                    <TableCell className="text-right">{f?.usuarios ?? 0}</TableCell>
                    <TableCell className="text-muted-foreground">{formatearMomento(f?.ultimoIngreso, true)}</TableCell>
                    <TableCell className="text-right">{f?.materiales ?? 0}</TableCell>
                    <TableCell className="text-right">{f?.trabajos30 ?? 0}</TableCell>
                    <TableCell className="text-right">{formatearMoneda(f?.ahorroMes ?? 0)}</TableCell>
                    <TableCell>
                      {t.estado === "suspendido" ? (
                        <Badge variant="destructive">Suspendido</Badge>
                      ) : (
                        <Badge className="bg-emerald-600 text-white">Activo</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </ListaBuscable>
        </CardContent>
      </Card>
    </div>
  );
}

function Dato({ titulo, valor, nota }: { titulo: string; valor: number; nota?: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
        {nota ? <p className="text-xs text-muted-foreground">{nota}</p> : null}
      </CardContent>
    </Card>
  );
}
