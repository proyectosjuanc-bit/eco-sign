import { formatearMoneda, formatearNumero } from "@/lib/format";
import { ETIQUETA_ROL } from "@/lib/roles";
import type { Rol } from "@/types/database";

/**
 * Plantillas del correo transaccional de ECO-SIGN.
 *
 * Cada plantilla es una función pura que devuelve `{ subject, html, text }`.
 * No tocan la red ni leen variables de entorno, así que se pueden probar
 * sueltas y también importar desde el cliente sin filtrar nada (aunque hoy
 * sólo las usa `send.ts`, que sí es de servidor).
 *
 * Sobre el HTML: los clientes de correo (Gmail, Outlook) descartan las hojas
 * de estilo y no soportan flex ni grid de forma fiable, así que la maqueta usa
 * tablas y estilos en línea. Es deliberado, no descuido: es la única forma de
 * que se vea igual en el móvil del taller y en Outlook de escritorio.
 */

export interface Plantilla {
  subject: string;
  html: string;
  text: string;
}

const VERDE = "#16a34a";
const TINTA = "#111827";
const GRIS = "#6b7280";
const BORDE = "#e5e7eb";
const FONDO = "#f6f7f6";

const TIPOGRAFIA =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const PIE = "ECO-SIGN — Convierte desperdicio en valor";

/** Evita que un dato con `<` o `&` rompa la maqueta o inyecte marcado. */
function escapar(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Envoltorio común: cabecera con el logotipo, cuerpo y pie.
 *
 * `max-width: 560px` con `width: 100%` es el patrón que hace que el correo se
 * lea bien tanto en un móvil como en un cliente de escritorio.
 */
function envolver(contenido: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:${FONDO};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${FONDO};padding:24px 12px;">
<tr>
<td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid ${BORDE};border-radius:8px;overflow:hidden;">
<tr>
<td style="padding:24px 28px 8px 28px;">
<span style="font-family:${TIPOGRAFIA};font-size:18px;font-weight:700;color:${VERDE};letter-spacing:-0.01em;">ECO-SIGN</span>
</td>
</tr>
<tr>
<td style="padding:8px 28px 28px 28px;font-family:${TIPOGRAFIA};font-size:15px;line-height:1.6;color:${TINTA};">
${contenido}
</td>
</tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr>
<td style="padding:16px 28px;font-family:${TIPOGRAFIA};font-size:12px;line-height:1.5;color:${GRIS};text-align:center;">
${PIE}
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

/** Título de nivel 1 dentro del cuerpo. */
function titulo(texto: string): string {
  return `<h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;font-weight:600;color:${TINTA};">${texto}</h1>`;
}

function parrafo(texto: string): string {
  return `<p style="margin:0 0 14px 0;">${texto}</p>`;
}

/** Recuadro para destacar un dato: una cifra, un código de sobrante. */
function recuadro(filas: { etiqueta: string; valor: string }[]): string {
  const celdas = filas
    .map(
      ({ etiqueta, valor }) => `<tr>
<td style="padding:4px 0;font-size:13px;color:${GRIS};">${etiqueta}</td>
<td style="padding:4px 0;font-size:15px;font-weight:600;color:${TINTA};text-align:right;">${valor}</td>
</tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;background-color:${FONDO};border-radius:6px;">
<tr><td style="padding:14px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${TIPOGRAFIA};">
${celdas}
</table>
</td></tr>
</table>`;
}

function boton(href: string, texto: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px 0;">
<tr><td style="background-color:${VERDE};border-radius:6px;">
<a href="${href}" style="display:inline-block;padding:11px 20px;font-family:${TIPOGRAFIA};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${texto}</a>
</td></tr>
</table>`;
}

/** Dominio propio de la aplicación, el mismo desde el que sale el correo. */
const URL_BASE = "https://reutilizando.online";
const URL_PANEL = `${URL_BASE}/dashboard`;
const URL_INVENTARIO = `${URL_BASE}/inventario`;

export function bienvenida({
  nombre,
  empresa,
}: {
  nombre: string;
  empresa: string;
}): Plantilla {
  const n = escapar(nombre);
  const e = escapar(empresa);

  return {
    subject: "Bienvenido a ECO-SIGN",
    html: envolver(
      titulo(`Bienvenido, ${n}`) +
        parrafo(
          `Ya puedes empezar a registrar el material de <strong>${e}</strong> y ver cuánto dinero recuperas de lo que hoy se bota.`,
        ) +
        parrafo("Para arrancar, el orden que mejor funciona es este:") +
        `<ol style="margin:0 0 16px 0;padding-left:20px;">
<li style="margin-bottom:6px;">Carga tus materiales con sus precios y medidas de lámina.</li>
<li style="margin-bottom:6px;">Crea un trabajo y anota lo que consumiste.</li>
<li>Guarda los retales que puedas reutilizar: cada uno recibe un código para pedirlo por nombre en el taller.</li>
</ol>` +
        boton(URL_PANEL, "Entrar al panel") +
        parrafo(
          `<span style="font-size:13px;color:${GRIS};">Si tienes dudas, responde a este correo y te ayudamos.</span>`,
        ),
    ),
    text: `Bienvenido, ${nombre}

Ya puedes empezar a registrar el material de ${empresa} y ver cuánto dinero recuperas de lo que hoy se bota.

Para arrancar:
1. Carga tus materiales con sus precios y medidas de lámina.
2. Crea un trabajo y anota lo que consumiste.
3. Guarda los retales que puedas reutilizar: cada uno recibe un código para pedirlo por nombre en el taller.

Entra al panel: ${URL_PANEL}

Si tienes dudas, responde a este correo y te ayudamos.

${PIE}`,
  };
}

export function resumenMensual({
  nombre,
  ahorro,
  roiCircular,
  suscripcion,
}: {
  nombre: string;
  ahorro: number;
  roiCircular: number;
  suscripcion: number;
}): Plantilla {
  const n = escapar(nombre);
  const ahorroTexto = formatearMoneda(ahorro);
  const suscripcionTexto = formatearMoneda(suscripcion);
  const veces = formatearNumero(roiCircular);
  const balance = ahorro - suscripcion;
  const seAutofinancia = balance >= 0;

  // El mensaje cambia según si el ahorro cubrió la suscripción: es la promesa
  // del producto ("tu desperdicio paga el software"), así que el correo debe
  // decirlo claro en los dos casos, sin maquillar el mes flojo.
  const veredicto = seAutofinancia
    ? parrafo(
        `<strong style="color:${VERDE};">Este mes el software se pagó solo.</strong> Después de cubrir la suscripción te quedaron <strong>${formatearMoneda(balance)}</strong>.`,
      )
    : parrafo(
        `Este mes el ahorro cubrió <strong>${veces} veces</strong> la suscripción. Te faltaron ${formatearMoneda(Math.abs(balance))} para que se pagara sola: guardar más retales aprovechables es la vía más rápida para cerrar esa diferencia.`,
      );

  return {
    subject: "Tu resumen de ahorro de este mes",
    html: envolver(
      titulo(`Tu mes en números, ${n}`) +
        recuadro([
          { etiqueta: "Ahorro del mes", valor: ahorroTexto },
          { etiqueta: "Suscripción", valor: suscripcionTexto },
          { etiqueta: "ROI Circular", valor: `${veces}×` },
        ]) +
        veredicto +
        boton(URL_PANEL, "Ver el detalle"),
    ),
    text: `Tu mes en números, ${nombre}

Ahorro del mes: ${ahorroTexto}
Suscripción: ${suscripcionTexto}
ROI Circular: ${veces}x

${
  seAutofinancia
    ? `Este mes el software se pagó solo. Después de cubrir la suscripción te quedaron ${formatearMoneda(balance)}.`
    : `Este mes el ahorro cubrió ${veces} veces la suscripción. Te faltaron ${formatearMoneda(Math.abs(balance))} para que se pagara sola: guardar más retales aprovechables es la vía más rápida para cerrar esa diferencia.`
}

Ver el detalle: ${URL_PANEL}

${PIE}`,
  };
}

export function alertaSobranteDisponible({
  nombre,
  codigoSobrante,
  material,
  medidas,
}: {
  nombre: string;
  codigoSobrante: string;
  material: string;
  medidas: string;
}): Plantilla {
  const n = escapar(nombre);
  const codigo = escapar(codigoSobrante);
  const mat = escapar(material);
  const med = escapar(medidas);

  return {
    subject: "Tienes un sobrante reutilizable",
    html: envolver(
      titulo("Antes de cortar lámina nueva") +
        parrafo(
          `${n}, tienes este retal guardado que sirve para el trabajo que vas a empezar:`,
        ) +
        recuadro([
          { etiqueta: "Código", valor: codigo },
          { etiqueta: "Material", valor: mat },
          { etiqueta: "Medidas", valor: med },
        ]) +
        parrafo(
          "Usarlo es material que no hay que volver a comprar, y suma directo a tu ahorro del mes.",
        ) +
        boton(URL_INVENTARIO, "Ver el inventario"),
    ),
    text: `Antes de cortar lámina nueva

${nombre}, tienes este retal guardado que sirve para el trabajo que vas a empezar:

Código: ${codigoSobrante}
Material: ${material}
Medidas: ${medidas}

Usarlo es material que no hay que volver a comprar, y suma directo a tu ahorro del mes.

Ver el inventario: ${URL_INVENTARIO}

${PIE}`,
  };
}

// ---------------------------------------------------------------------------
// Capacidad: solicitudes de máquinas entre talleres
// ---------------------------------------------------------------------------

const URL_RECIBIDAS = `${URL_BASE}/capacidad/solicitudes-recibidas`;
const URL_ENVIADAS = `${URL_BASE}/capacidad/solicitudes-enviadas`;

/** Texto libre de otra persona: escapado y con sus saltos de línea. */
function textoLibre(valor: string): string {
  return escapar(valor).replace(/\n/g, "<br>");
}

/**
 * Aviso al dueño de una máquina de que otro taller quiere usarla.
 *
 * El correo sale con `replyTo` apuntando al solicitante (ver
 * `sendSolicitudMaquina`), así que el dueño puede contestar directamente
 * desde su bandeja para coordinar, sin entrar a la aplicación.
 */
export function solicitudMaquinaRecibida({
  nombrePropietario,
  nombreSolicitante,
  nombreMaquina,
  fechaDeseada,
  duracion,
  mensaje,
}: {
  nombrePropietario: string;
  nombreSolicitante: string;
  nombreMaquina: string;
  /** Ya formateada para leer, por ejemplo "15 oct 2026". */
  fechaDeseada: string;
  duracion: string;
  mensaje: string;
}): Plantilla {
  const propietario = escapar(nombrePropietario);
  const solicitante = escapar(nombreSolicitante);
  const maquina = escapar(nombreMaquina);

  return {
    subject: `Nueva solicitud de disponibilidad para ${nombreMaquina}`,
    html: envolver(
      titulo("Un taller quiere usar tu máquina") +
        parrafo(
          `${propietario}, <strong>${solicitante}</strong> pidió disponibilidad de <strong>${maquina}</strong>.`,
        ) +
        recuadro([
          { etiqueta: "Fecha deseada", valor: escapar(fechaDeseada) },
          { etiqueta: "Duración", valor: escapar(duracion) },
        ]) +
        `<p style="margin:0 0 6px 0;font-size:13px;color:${GRIS};">Su mensaje:</p>` +
        `<blockquote style="margin:0 0 16px 0;padding:10px 14px;border-left:3px solid ${VERDE};background-color:${FONDO};">${textoLibre(mensaje)}</blockquote>` +
        parrafo(
          "Acepta o rechaza la solicitud desde la aplicación. Si quieres preguntarle algo antes, responde este correo: le llega directamente a ese taller.",
        ) +
        boton(URL_RECIBIDAS, "Ver la solicitud"),
    ),
    text: `Un taller quiere usar tu máquina

${nombrePropietario}, ${nombreSolicitante} pidió disponibilidad de ${nombreMaquina}.

Fecha deseada: ${fechaDeseada}
Duración: ${duracion}

Su mensaje:
${mensaje}

Acepta o rechaza la solicitud desde la aplicación. Si quieres preguntarle algo antes, responde este correo: le llega directamente a ese taller.

Ver la solicitud: ${URL_RECIBIDAS}

${PIE}`,
  };
}

/**
 * Respuesta del dueño al taller que pidió la máquina.
 *
 * Al aceptar se incluye el teléfono que el dueño publicó con la máquina: el
 * pago y la entrega se coordinan por fuera de la plataforma, y ése es el dato
 * que él mismo decidió hacer público. Su correo no se comparte.
 */
export function respuestaSolicitud({
  nombreSolicitante,
  nombrePropietario,
  nombreMaquina,
  estado,
  telefono,
}: {
  nombreSolicitante: string;
  nombrePropietario: string;
  nombreMaquina: string;
  estado: "aceptada" | "rechazada";
  telefono: string;
}): Plantilla {
  const solicitante = escapar(nombreSolicitante);
  const propietario = escapar(nombrePropietario);
  const maquina = escapar(nombreMaquina);
  const aceptada = estado === "aceptada";

  const cuerpoHtml = aceptada
    ? parrafo(
        `<strong style="color:${VERDE};">${propietario} aceptó tu solicitud</strong> para usar <strong>${maquina}</strong>.`,
      ) +
      recuadro([{ etiqueta: "Teléfono del taller", valor: escapar(telefono) }]) +
      parrafo(
        "Llámalo o escríbele para acordar el horario exacto, el pago y la entrega. ECO-SIGN no cobra ni interviene en ese acuerdo.",
      )
    : parrafo(
        `${propietario} no puede atender tu solicitud para <strong>${maquina}</strong> esta vez.`,
      ) +
      parrafo("Puedes buscar otra máquina parecida en la red de talleres.");

  const cuerpoTexto = aceptada
    ? `${nombrePropietario} aceptó tu solicitud para usar ${nombreMaquina}.

Teléfono del taller: ${telefono}

Llámalo o escríbele para acordar el horario exacto, el pago y la entrega. ECO-SIGN no cobra ni interviene en ese acuerdo.`
    : `${nombrePropietario} no puede atender tu solicitud para ${nombreMaquina} esta vez.

Puedes buscar otra máquina parecida en la red de talleres.`;

  return {
    subject: `Tu solicitud fue ${estado}`,
    html: envolver(
      titulo(aceptada ? "Tienes máquina" : "Solicitud rechazada") +
        parrafo(`Hola, ${solicitante}.`) +
        cuerpoHtml +
        boton(URL_ENVIADAS, "Ver mis solicitudes"),
    ),
    text: `Hola, ${nombreSolicitante}.

${cuerpoTexto}

Ver mis solicitudes: ${URL_ENVIADAS}

${PIE}`,
  };
}

/** Qué podrá hacer la persona invitada, según el rol que se le asigna. */
const DESCRIPCION_ROL_CORREO: Record<Rol, string> = {
  admin:
    "Como administrador podrás gestionar todo, incluyendo el equipo y la configuración del taller.",
  operario:
    "Como operario podrás registrar materiales, sobrantes, trabajos y desperdicios, pero no gestionar el equipo.",
  lectura:
    "Como usuario de solo lectura podrás ver toda la información sin poder modificar nada.",
};

/**
 * Invitación a unirse a un taller que ya usa ECO-SIGN.
 *
 * El enlace lleva el token de la invitación (ver `sendInvitacionEmpleado`).
 */
export function invitacionEmpleado({
  nombreInvitado,
  nombreTaller,
  nombreInvitador,
  rol,
  enlace,
  expiraEn,
}: {
  /** Puede venir vacío: el admin no está obligado a escribirlo. */
  nombreInvitado: string;
  nombreTaller: string;
  nombreInvitador: string;
  rol: Rol;
  /** URL completa, con el token. */
  enlace: string;
  /** Ya formateada para leer, por ejemplo "9 oct 2026". */
  expiraEn: string;
}): Plantilla {
  const invitado = nombreInvitado.trim();
  const saludoHtml = invitado ? `Hola ${escapar(invitado)}` : "Hola";
  const saludoTexto = invitado ? `Hola ${invitado}` : "Hola";
  const taller = escapar(nombreTaller);
  const invitador = escapar(nombreInvitador);
  const etiquetaRol = ETIQUETA_ROL[rol].toLowerCase();
  const descripcionRol = DESCRIPCION_ROL_CORREO[rol];

  const presentacion =
    "ECO-SIGN es la plataforma para gestionar materiales, sobrantes, trabajos y capacidad compartida entre talleres.";

  return {
    subject: `${nombreTaller} te invitó a ECO-SIGN`,
    html: envolver(
      titulo(`${saludoHtml},`) +
        parrafo(
          `<strong>${invitador}</strong> te invitó a unirte al taller <strong>${taller}</strong> en ECO-SIGN con el rol de <strong>${escapar(etiquetaRol)}</strong>. ${presentacion}`,
        ) +
        parrafo(descripcionRol) +
        boton(escapar(enlace), "Aceptar invitación") +
        parrafo(
          `<span style="font-size:13px;color:${GRIS};">Este enlace expira el ${escapar(expiraEn)}.</span>`,
        ),
    ),
    text: `${saludoTexto},

${nombreInvitador} te invitó a unirte al taller ${nombreTaller} en ECO-SIGN con el rol de ${etiquetaRol}. ${presentacion}

${descripcionRol}

Aceptar invitación: ${enlace}

Este enlace expira el ${expiraEn}.

${PIE}`,
  };
}
