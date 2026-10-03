"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  cancelarInvitacion,
  reenviarInvitacion,
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
import { ETIQUETA_ROL } from "@/lib/roles";
import type { Rol } from "@/types/database";

export interface InvitacionPendiente {
  id: string;
  email: string;
  rol: Rol;
  /** Ya formateada para mostrar. */
  expira: string;
}

/** Invitaciones enviadas que todavía no se han aceptado ni vencido. */
export function TablaInvitaciones({ invitaciones }: { invitaciones: InvitacionPendiente[] }) {
  const [enCurso, iniciar] = useTransition();
  const [ocupada, setOcupada] = useState<string | null>(null);

  function ejecutar(id: string, accion: () => Promise<ResultadoEquipo>, exito: string) {
    setOcupada(id);
    iniciar(async () => {
      const resultado = await accion();
      if (resultado.ok) toast.success(exito);
      else toast.error(resultado.error ?? "No pudimos completar la acción.");
      setOcupada(null);
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Correo</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead>Expira</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitaciones.map((invitacion) => {
          const bloqueada = enCurso && ocupada === invitacion.id;
          return (
            <TableRow key={invitacion.id}>
              <TableCell className="font-medium">{invitacion.email}</TableCell>
              <TableCell>
                <Badge variant="outline">{ETIQUETA_ROL[invitacion.rol]}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{invitacion.expira}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bloqueada}
                    onClick={() =>
                      ejecutar(
                        invitacion.id,
                        () => reenviarInvitacion(invitacion.id),
                        `Invitación reenviada a ${invitacion.email}.`,
                      )
                    }
                  >
                    {bloqueada ? "Enviando…" : "Reenviar"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={bloqueada}
                    onClick={() => {
                      if (!window.confirm(`¿Cancelar la invitación a ${invitacion.email}?`)) return;
                      ejecutar(
                        invitacion.id,
                        () => cancelarInvitacion(invitacion.id),
                        "Invitación cancelada.",
                      );
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
