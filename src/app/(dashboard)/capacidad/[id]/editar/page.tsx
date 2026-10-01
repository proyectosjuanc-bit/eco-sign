import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FormularioMaquina } from "@/components/capacidad/formulario-maquina";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";
import { esquemaId } from "@/lib/capacidad/esquemas";
import { createClient } from "@/lib/supabase/server";
import { firmarFotos } from "@/lib/supabase/subir-foto";
import { obtenerTenantId } from "@/lib/supabase/tenant";

export const metadata: Metadata = { title: "Editar máquina · ECO-SIGN" };

/** En Next 16 los params de una ruta llegan como promesa. */
export default async function EditarMaquinaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!esquemaId.safeParse(id).success) notFound();

  const [supabase, tenantId] = await Promise.all([createClient(), obtenerTenantId()]);
  if (!tenantId) notFound();

  // Filtro por tenant: una máquina publicada de otro taller también se puede
  // leer, pero no editar.
  const { data: maquina } = await supabase
    .from("machines")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!maquina) notFound();

  const firmas = await firmarFotos(supabase, maquina.fotos, "maquinas");

  return (
    <>
      <EncabezadoPagina titulo="Editar máquina" descripcion={maquina.nombre} />
      <FormularioMaquina
        maquina={maquina}
        fotos={maquina.fotos.map((ruta) => ({ ruta, url: firmas.get(ruta) ?? null }))}
      />
    </>
  );
}
