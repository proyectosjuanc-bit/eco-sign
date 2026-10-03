import type { Metadata } from "next";

import { BotonQuitarSuperadmin, FormularioAgregarSuperadmin } from "../botones-admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatearMomento } from "@/lib/format";
import { exigirSuperadmin } from "@/lib/superadmin";

export const metadata: Metadata = {
  title: "Superadmins · ECO-SIGN",
  robots: { index: false, follow: false },
};

export default async function SuperadminsPage() {
  const { admin, userId } = await exigirSuperadmin();

  const [{ data: lista }, { data: usuarios }] = await Promise.all([
    admin.from("superadmins").select("user_id, agregado_por, created_at").order("created_at"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const correo = new Map((usuarios?.users ?? []).map((u) => [u.id, u.email ?? "—"]));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Superadmins</CardTitle>
          <CardDescription>
            Ven y administran todos los talleres. Nadie puede quitarse a sí mismo
            y siempre queda al menos uno.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y text-sm">
            {(lista ?? []).map((s) => (
              <li key={s.user_id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">{correo.get(s.user_id)}</span>
                  {s.user_id === userId ? <span className="ml-2 text-xs text-muted-foreground">(tú)</span> : null}
                  <span className="block text-xs text-muted-foreground">
                    Desde {formatearMomento(s.created_at)}
                    {s.agregado_por ? ` · agregado por ${correo.get(s.agregado_por) ?? "—"}` : " · primer superadmin"}
                  </span>
                </span>
                {s.user_id === userId ? null : (
                  <BotonQuitarSuperadmin userId={s.user_id} email={correo.get(s.user_id) ?? ""} />
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agregar superadmin</CardTitle>
        </CardHeader>
        <CardContent>
          <FormularioAgregarSuperadmin />
        </CardContent>
      </Card>
    </div>
  );
}
