import type { Metadata } from "next";

import { FormularioMaquina } from "@/components/capacidad/formulario-maquina";
import { EncabezadoPagina } from "@/components/dashboard/encabezado-pagina";

export const metadata: Metadata = { title: "Publicar máquina · ECO-SIGN" };

export default function NuevaMaquinaPage() {
  return (
    <>
      <EncabezadoPagina
        titulo="Publicar máquina"
        descripcion="Puedes guardarla como borrador y publicarla cuando esté lista."
      />
      <FormularioMaquina />
    </>
  );
}
