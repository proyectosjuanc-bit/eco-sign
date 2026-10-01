import type { ReactNode } from "react";

import { PestanasCapacidad } from "@/components/capacidad/pestanas-capacidad";
import { createClient } from "@/lib/supabase/server";
import { obtenerTenantId } from "@/lib/supabase/tenant";

/** Marco común de Capacidad: las pestañas, con las solicitudes por contestar. */
export default async function CapacidadLayout({ children }: { children: ReactNode }) {
  const [supabase, tenantId] = await Promise.all([createClient(), obtenerTenantId()]);

  // RLS deja ver las solicitudes enviadas y las recibidas; el filtro por
  // propietario deja sólo las que me toca contestar.
  const { count } = tenantId
    ? await supabase
        .from("machine_requests")
        .select("id", { count: "exact", head: true })
        .eq("tenant_propietario", tenantId)
        .eq("estado", "pendiente")
    : { count: 0 };

  return (
    <>
      <PestanasCapacidad pendientes={count ?? 0} />
      {children}
    </>
  );
}
