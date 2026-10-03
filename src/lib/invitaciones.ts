/**
 * Mensajes para la persona que abre un enlace de invitación.
 *
 * Los motivos son los que devuelve la función obtener_invitacion_por_token de
 * la base (columna mensaje_error).
 */
export function mensajeInvitacionInvalida(motivo: string | null): string {
  switch (motivo) {
    case "Invitación ya usada":
      return "Esta invitación ya fue usada.";
    case "Invitación expirada":
      return "Esta invitación expiró. Pide una nueva al administrador de tu taller.";
    case "Token vacío":
      return "El enlace de invitación no es válido. Pide al administrador de tu taller que te envíe uno nuevo.";
    default:
      return "El enlace no es válido. Pide al administrador de tu taller que te envíe uno nuevo.";
  }
}
