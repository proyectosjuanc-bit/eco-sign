import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { ModalInvitar } from "@/components/configuracion/modal-invitar";
import {
  TablaInvitaciones,
  type InvitacionPendiente,
} from "@/components/configuracion/tabla-invitaciones";
import { TablaMiembros, type Miembro } from "@/components/configuracion/tabla-miembros";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatearMomento } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Equipo · ECO-SIGN" };

/**
 * Miembros del taller e invitaciones pendientes. Sólo para admins.
 *
 * La comprobación de rol es es_admin() en la base (la misma que usan las
 * políticas RLS); aunque alguien llegara aquí, sin ser admin la base no le
 * devolvería los miembros ni las invitaciones.
 */
export default async function EquipoPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (!esAdmin) redirect("/dashboard");

  const [{ data: perfiles }, { data: invitaciones }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nombre, email, rol, activo, ultimo_acceso")
      .order("email"),
    supabase
      .from("invitaciones")
      .select("id, email, rol, expira_en, created_at")
      .eq("aceptada", false)
      .gt("expira_en", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  const miembros: Miembro[] = (perfiles ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    email: p.email,
    rol: p.rol,
    activo: p.activo,
    ultimoAcceso: formatearMomento(p.ultimo_acceso, true),
  }));

  const pendientes: InvitacionPendiente[] = (invitaciones ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    rol: i.rol,
    expira: formatearMomento(i.expira_en),
  }));

  return (
    <>
      <EncabezadoPagina
        titulo="Equipo"
        descripcion="Quién puede entrar a tu taller y qué puede hacer."
      >
        <ModalInvitar />
      </EncabezadoPagina>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Miembros del taller</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <TablaMiembros miembros={miembros} usuarioActualId={user.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invitaciones pendientes</CardTitle>
          </CardHeader>
          <CardContent className={pendientes.length ? "p-0" : undefined}>
            {pendientes.length ? (
              <TablaInvitaciones invitaciones={pendientes} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay invitaciones pendientes. Usa «Invitar empleado» para sumar a alguien.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
