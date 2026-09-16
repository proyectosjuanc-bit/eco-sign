"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { EstadoAuth } from "@/lib/form-state";
import { sendWelcomeEmail } from "@/lib/email/send";
import { createClient } from "@/lib/supabase/server";

/** Estado que `useActionState` devuelve a los formularios de auth. */
function textoDe(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
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
  // usuario a un dominio externo con un enlace manipulado.
  const destino = redirigirA.startsWith("/") && !redirigirA.startsWith("//")
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
    // El trigger handle_new_user lee esta metadata para crear el tenant con el
    // nombre de la empresa y el profile del usuario.
    options: { data: { nombre, empresa } },
  });

  if (error) {
    return { error: traducirError(error.message) };
  }

  // El correo de bienvenida no se espera: la cuenta ya está creada y el usuario
  // no debería aguardar a un proveedor externo para ver la confirmación. Si
  // falla, `sendWelcomeEmail` lo registra y devuelve ok:false sin lanzar, así
  // que el `catch` es sólo una red de seguridad para un fallo inesperado.
  //
  // Va aquí, antes del redirect: `redirect()` lanza internamente en Next para
  // cortar la ejecución, así que cualquier cosa escrita después no correría.
  void sendWelcomeEmail(email, nombre, empresa).catch((fallo) => {
    console.error("[registro] Falló el correo de bienvenida:", fallo);
  });

  // Sin sesión activa, el proyecto tiene la confirmación por correo activada.
  if (!data.session) {
    return {
      error: null,
      mensaje: `Cuenta creada. Te enviamos un correo a ${email} para confirmarla.`,
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
