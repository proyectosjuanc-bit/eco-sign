"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  activarEmpleado,
  cambiarRol,
  desactivarEmpleado,
  type ResultadoEquipo,
} from "@/app/(dashboard)/configuracion/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ETIQUETA_ROL, ROLES } from "@/lib/roles";
import type { Rol } from "@/types/database";
import { ListaBuscable } from "@/components/ui/lista-buscable";

export interface Miembro {
  id: string;
  nombre: string | null;
  email: string;
  rol: Rol;
  activo: boolean;
  /** Ya formateado para mostrar ("—" si nunca ha entrado). */
  ultimoAcceso: string;
}

const CLASE_SELECT =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

/** Miembros del taller, con acciones para el admin (menos sobre sí mismo). */
export function TablaMiembros({
  miembros,
  usuarioActualId,
}: {
  miembros: Miembro[];
  usuarioActualId: string;
}) {
  const [enCurso, iniciar] = useTransition();
  // Fila que está esperando respuesta, para deshabilitar sólo sus controles.
  const [ocupado, setOcupado] = useState<string | null>(null);

  function ejecutar(id: string, accion: () => Promise<ResultadoEquipo>, exito: string) {
    setOcupado(id);
    iniciar(async () => {
      const resultado = await accion();
      if (resultado.ok) toast.success(exito);
      else toast.error(resultado.error ?? "No pudimos completar la acción.");
      setOcupado(null);
    });
  }

  return (
    <ListaBuscable placeholder="Buscar persona o correo…">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Correo</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Último acceso</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {miembros.map((miembro) => {
          const esYo = miembro.id === usuarioActualId;
          const bloqueada = enCurso && ocupado === miembro.id;
          return (
            <TableRow key={miembro.id}>
              <TableCell className="font-medium">
                {miembro.nombre ?? "—"}
                {esYo ? <span className="ml-2 text-xs text-muted-foreground">(tú)</span> : null}
              </TableCell>
              <TableCell className="text-muted-foreground">{miembro.email}</TableCell>
              <TableCell>
                {esYo ? (
                  <Badge variant="outline">{ETIQUETA_ROL[miembro.rol]}</Badge>
                ) : (
                  <select
                    aria-label={`Rol de ${miembro.nombre ?? miembro.email}`}
                    className={CLASE_SELECT}
                    value={miembro.rol}
                    disabled={bloqueada}
                    onChange={(e) => {
                      const nuevo = e.target.value as Rol;
                      ejecutar(
                        miembro.id,
                        () => cambiarRol(miembro.id, nuevo),
                        `Rol cambiado a ${ETIQUETA_ROL[nuevo].toLowerCase()}.`,
                      );
                    }}
                  >
                    {ROLES.map((rol) => (
                      <option key={rol} value={rol}>
                        {ETIQUETA_ROL[rol]}
                      </option>
                    ))}
                  </select>
                )}
              </TableCell>
              <TableCell>
                {miembro.activo ? (
                  <Badge className="bg-emerald-600 text-white">Activo</Badge>
                ) : (
                  <Badge variant="secondary">Inactivo</Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{miembro.ultimoAcceso}</TableCell>
              <TableCell className="text-right">
                {esYo ? null : miembro.activo ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={bloqueada}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `¿Desactivar a ${miembro.nombre ?? miembro.email}? Ya no podrá ver ni registrar nada en el taller.`,
                        )
                      ) {
                        return;
                      }
                      ejecutar(miembro.id, () => desactivarEmpleado(miembro.id), "Usuario desactivado.");
                    }}
                  >
                    Desactivar
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bloqueada}
                    onClick={() =>
                      ejecutar(miembro.id, () => activarEmpleado(miembro.id), "Usuario activado.")
                    }
                  >
                    Activar
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    </ListaBuscable>
  );
}
