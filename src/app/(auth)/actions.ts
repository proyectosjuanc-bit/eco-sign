"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { EstadoAuth } from "@/lib/form-state";
import { mensajeInvitacionInvalida } from "@/lib/invitaciones";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Estado que `useActionState` devuelve a los formularios de auth. */
function textoDe(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * Dominio desde el que se usa la app (producción o localhost), para que el
 * enlace de confirmación vuelva al mismo sitio donde se hizo el registro.
 */
async function origenDeLaApp(): Promise<string> {
  const h = await headers();
  const origen = h.get("origin");
  if (origen) return origen;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const protocolo = h.get("x-forwarded-proto") ?? "https";
  return host ? `${protocolo}://${host}` : "https://reutilizando.online";
}

/** Traduce los errores de Supabase Auth, que llegan en inglés. */
function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) {
    return "Debes confirmar tu correo antes de entrar. Revisa tu bandeja.";
  }
  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "Ya existe una cuenta con ese correo.";
  }
  if (m.includes("password should be at least")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  // El límite de correos es del proyecto, no del usuario: no ha hecho nada mal
  // y reintentar con otros datos tampoco funciona. Conviene decirlo aparte del
  // límite de intentos, porque la salida es distinta.
  if (m.includes("email rate limit") || m.includes("over_email_send_rate_limit")) {
    return (
      "El servicio de correo alcanzó su límite por ahora y no pudimos enviarte " +
      "la confirmación. Tus datos están bien: vuelve a intentarlo en una hora."
    );
  }
  if (m.includes("rate limit") || m.includes("too many requests")) {
    return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  }
  return mensaje;
}

export async function iniciarSesion(
  _estadoPrevio: EstadoAuth,
  formData: FormData,
): Promise<EstadoAuth> {
  const email = textoDe(formData, "email");
  const password = textoDe(formData, "password");
  const redirigirA = textoDe(formData, "redirect");

  if (!email || !password) {
    return { error: "Escribe tu correo y tu contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: traducirError(error.message) };
  }

  revalidatePath("/", "layout");
  // Solo se aceptan rutas internas: un redirect abierto permitiría enviar al
  // usuario a un dominio externo con un enlace manipulado. Tras la "/" no puede
  // venir otra "/" ni una "\": los navegadores tratan "/\evil.com" como "//evil.com".
  const destino = /^\/[^/\\]/.test(redirigirA)
    ? redirigirA
    : "/dashboard";
  redirect(destino);
}

export async function registrarse(
  _estadoPrevio: EstadoAuth,
  formData: FormData,
): Promise<EstadoAuth> {
  const email = textoDe(formData, "email");
  const password = textoDe(formData, "password");
  const nombre = textoDe(formData, "nombre");
  const empresa = textoDe(formData, "empresa");

  if (!email || !password || !nombre || !empresa) {
    return { error: "Completa todos los campos." };
  }
  if (password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // El trigger handle_new_user lee esta metadata para crear el tenant con
      // el nombre de la empresa y el profile del usuario.
      data: { nombre, empresa },
      // El enlace del correo vuelve a /auth/confirmar, que inicia la sesión y
      // envía la bienvenida. Debe estar en Redirect URLs de Supabase (Auth >
      // URL Configuration); si no, Supabase usa la Site URL.
      emailRedirectTo: `${await origenDeLaApp()}/auth/confirmar`,
    },
  });

  if (error) {
    return { error: traducirError(error.message) };
  }

  // La bienvenida ya no sale aquí sino al confirmar (/auth/confirmar): si
  // llegaba junto al correo de confirmación, su botón "Entrar al panel"
  // llevaba a un login que todavía no dejaba entrar.

  // Sin sesión activa, el proyecto tiene la confirmación por correo activada.
  if (!data.session) {
    return {
      error: null,
      mensaje: `Cuenta creada. Te enviamos un correo a ${email}: ábrelo y toca el enlace para confirmar tu cuenta y entrar. Si no lo ves, revisa la carpeta de spam.`,
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Aceptar una invitación a un taller
// ---------------------------------------------------------------------------

const esquemaAceptarInvitacion = z.object({
  token: z.uuid({ error: "El enlace de invitación no es válido." }),
  nombre: z
    .string()
    .trim()
    .min(2, { error: "Escribe tu nombre completo (mínimo 2 caracteres)." })
    .max(100, { error: "El nombre es demasiado largo (máximo 100 caracteres)." }),
  password: z
    .string()
    .min(10, { error: "La contraseña debe tener al menos 10 caracteres." })
    .max(72, { error: "La contraseña es demasiado larga (máximo 72 caracteres)." }),
  // La casilla también se exige aquí: el navegador se puede saltar.
  aceptaTerminos: z.literal(true, {
    error: "Debes aceptar los Términos y Condiciones y la Política de Privacidad.",
  }),
});

/**
 * Crea la cuenta de una persona invitada y la une al taller.
 *
 * El correo NO viene del navegador: se toma de la invitación en la base, así
 * que nadie puede usar un token con otro correo. El trigger handle_new_user ve
 * `invitacion_token` en la metadata, une al usuario al taller con el rol de la
 * invitación y la marca como aceptada.
 *
 * Si el proyecto exige confirmar el correo (hoy sí), no hay sesión todavía: se
 * devuelve ok sin `sesionIniciada` y el formulario pide revisar el correo.
 *
 * Es idempotente: si la cuenta de esa invitación ya existe en el taller correcto
 * (doble clic, reenvío del navegador, volver a abrir el enlace) devuelve
 * `yaExistia` en vez de un error, y la persona sólo tiene que iniciar sesión.
 */
export async function aceptarInvitacion(input: {
  token: string;
  nombre: string;
  password: string;
  aceptaTerminos: boolean;
}): Promise<{
  ok: boolean;
  error?: string;
  sesionIniciada?: boolean;
  /** La cuenta ya estaba creada en el taller de la invitación. */
  yaExistia?: boolean;
}> {
  const validacion = esquemaAceptarInvitacion.safeParse(input);
  if (!validacion.success) {
    return { ok: false, error: validacion.error.issues[0]?.message ?? "Revisa los datos." };
  }
  const { token, nombre, password } = validacion.data;

  // ¿La cuenta de esta invitación ya existe? Se mira ANTES de validar la
  // invitación porque, tras un primer envío correcto, la invitación queda
  // aceptada y la validación diría "ya usada" a quien sólo reenvió el formulario.
  const previa = await cuentaDeLaInvitacion(token);
  if (previa === "mismo_taller") return { ok: true, yaExistia: true };
  if (previa === "otro_taller") return { ok: false, error: MENSAJE_OTRO_TALLER };

  const supabase = await createClient();

  // Defensa en profundidad: la página ya lo comprobó, pero entre abrirla y
  // enviar el formulario la invitación pudo vencer o cancelarse.
  const { data: filas, error: errorRpc } = await supabase.rpc("obtener_invitacion_por_token", {
    p_token: token,
  });
  const invitacion = filas?.[0];
  if (errorRpc || !invitacion) {
    console.error("[auth] No se pudo consultar la invitación", errorRpc);
    return { ok: false, error: "No pudimos verificar la invitación. Intenta de nuevo." };
  }
  if (!invitacion.valida || !invitacion.email) {
    return { ok: false, error: mensajeInvitacionInvalida(invitacion.mensaje_error) };
  }

  const { data, error } = await supabase.auth.signUp({
    email: invitacion.email,
    password,
    options: {
      data: {
        invitacion_token: token,
        nombre,
        // Constancia de la aceptación de términos (Ley 1581): queda en la
        // metadata del usuario con su fecha.
        acepto_terminos_en: new Date().toISOString(),
      },
      emailRedirectTo: `${await origenDeLaApp()}/auth/confirmar`,
    },
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("already registered") || m.includes("already been registered")) {
      return resolverCuentaExistente(token);
    }
    // Si el trigger rechaza la invitación, Supabase lo devuelve como un error
    // genérico de base de datos (no deja pasar el texto de la excepción).
    if (m.includes("database error")) {
      console.error("[auth] El alta por invitación fue rechazada", error.message);
      return {
        ok: false,
        error:
          "No pudimos crear tu cuenta. Es posible que la invitación ya no sea válida: pide una nueva al administrador de tu taller.",
      };
    }
    console.error("[auth] signUp por invitación falló", error.message);
    return { ok: false, error: traducirError(error.message) };
  }

  // Con la confirmación de correo activada, si el correo ya tiene cuenta
  // Supabase no da error (para no revelar qué correos existen): devuelve un
  // usuario sin identidades y no envía nada. Se detecta aquí; si no, la persona
  // esperaría un correo que nunca llega.
  if (data.user && data.user.identities?.length === 0) {
    return resolverCuentaExistente(token);
  }

  // OJO: aquí NO se llama a revalidatePath. La invitación ya quedó aceptada
  // (la marcó el trigger al crear la cuenta); revalidar volvería a renderizar la
  // página /auth/aceptar-invitacion, que consulta la invitación, la ve usada y
  // reemplazaría el aviso de éxito por "No pudimos abrir la invitación". Si hay
  // sesión, el formulario navega al panel y refresca por su cuenta.
  return { ok: true, sesionIniciada: Boolean(data.session) };
}

/**
 * Cuando el signUp dice que el correo ya tiene cuenta, se distingue el caso
 * inofensivo (la cuenta es de ESTA invitación, p. ej. un doble envío) del real
 * (el correo ya está en uso en otro lugar).
 */
async function resolverCuentaExistente(
  token: string,
): Promise<{ ok: boolean; error?: string; yaExistia?: boolean }> {
  const estado = await cuentaDeLaInvitacion(token);
  if (estado === "mismo_taller") return { ok: true, yaExistia: true };
  if (estado === "otro_taller") return { ok: false, error: MENSAJE_OTRO_TALLER };
  return { ok: false, error: MENSAJE_CUENTA_EXISTENTE };
}

/**
 * ¿Ya existe una cuenta con el correo de esta invitación, y de qué taller?
 *
 * Usa el cliente admin porque quien llama no tiene sesión y la invitación y
 * los perfiles están protegidos por RLS. Sólo devuelve un estado, nunca datos.
 * Si no hay clave de servicio configurada devuelve "desconocido" y el flujo
 * sigue como si no existiera (el signUp igualmente rechaza un correo repetido).
 */
async function cuentaDeLaInvitacion(
  token: string,
): Promise<"no_existe" | "mismo_taller" | "otro_taller" | "desconocido"> {
  const admin = crearClienteAdmin();
  if (!admin) {
    console.error("[auth] Falta SUPABASE_SERVICE_ROLE_KEY: no se puede verificar la cuenta previa");
    return "desconocido";
  }

  const { data: invitacion, error: errorInvitacion } = await admin
    .from("invitaciones")
    .select("email, tenant_id")
    .eq("token", token)
    .maybeSingle();
  if (errorInvitacion) {
    console.error("[auth] No se pudo leer la invitación", errorInvitacion);
    return "desconocido";
  }
  // Sin invitación no hay de qué cuenta hablar: que decida la validación normal.
  if (!invitacion) return "no_existe";

  const { data: perfil, error: errorPerfil } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("email", invitacion.email.toLowerCase())
    .limit(1)
    .maybeSingle();
  if (errorPerfil) {
    console.error("[auth] No se pudo buscar el perfil", errorPerfil);
    return "desconocido";
  }
  if (!perfil) return "no_existe";

  return perfil.tenant_id === invitacion.tenant_id ? "mismo_taller" : "otro_taller";
}

const MENSAJE_CUENTA_EXISTENTE =
  "Este correo ya tiene una cuenta. Intenta iniciar sesión o recuperar tu contraseña.";

const MENSAJE_OTRO_TALLER = "Ese correo ya está registrado en otro taller.";
