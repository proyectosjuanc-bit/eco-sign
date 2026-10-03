import type { Rol } from "@/types/database";

/** Los tres roles, en el orden en que se ofrecen en la interfaz. */
export const ROLES: readonly Rol[] = ["admin", "operario", "lectura"];

/** Nombre del rol tal como lo ve una persona. */
export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: "Administrador",
  operario: "Operario",
  lectura: "Solo lectura",
};

/** Qué puede hacer cada rol, para el formulario de invitación. */
export const DESCRIPCION_ROL: Record<Rol, string> = {
  admin: "Acceso total. Puede gestionar el equipo y la configuración del taller.",
  operario:
    "Registra materiales, sobrantes, trabajos y desperdicios. No gestiona el equipo.",
  lectura: "Solo puede ver la información. No modifica nada.",
};

/** Días que una invitación sigue siendo válida desde que se envía. */
export const DIAS_VIGENCIA_INVITACION = 7;
