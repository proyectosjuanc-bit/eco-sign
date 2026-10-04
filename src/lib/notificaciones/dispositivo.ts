"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Avisos push en ESTE dispositivo (navegador del celular o del PC).
 *
 * El navegador entrega una "suscripción" (dirección del servicio push de
 * Google, Apple, Mozilla o Microsoft + llaves de cifrado) y se guarda en la
 * base asociada a la persona con sesión (registrar_suscripcion_push).
 */

export type EstadoAvisos =
  | "cargando"
  /** El navegador no tiene avisos push. */
  | "no-soportado"
  /** iPhone/iPad: sólo hay avisos si la app está agregada a la pantalla de inicio. */
  | "ios-sin-instalar"
  /** La persona bloqueó los avisos en el navegador. */
  | "bloqueado"
  | "inactivo"
  | "activo";

export function esIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function esInstalada(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function soportaPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Registra el service worker (una vez por carga; el navegador lo reutiliza). */
export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  } catch (e) {
    console.error("[avisos] No se pudo registrar el service worker", e);
    return null;
  }
}

export async function estadoAvisos(): Promise<EstadoAvisos> {
  if (!soportaPush()) return esIOS() && !esInstalada() ? "ios-sin-instalar" : "no-soportado";
  if (Notification.permission === "denied") return "bloqueado";
  const registro = await navigator.serviceWorker.getRegistration("/");
  const suscripcion = await registro?.pushManager.getSubscription();
  return suscripcion && Notification.permission === "granted" ? "activo" : "inactivo";
}

function llaveABytes(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const crudo = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

/** Pide permiso y suscribe el dispositivo. Devuelve el estado final. */
export async function activarAvisos(llavePublica: string): Promise<EstadoAvisos> {
  const permiso = await Notification.requestPermission();
  if (permiso === "denied") return "bloqueado";
  if (permiso !== "granted") return "inactivo";

  const registro = (await registrarServiceWorker()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  const suscripcion =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: llaveABytes(llavePublica),
    }));

  const json = suscripcion.toJSON();
  const { error } = await createClient().rpc("registrar_suscripcion_push", {
    p_endpoint: suscripcion.endpoint,
    p_p256dh: json.keys?.p256dh ?? "",
    p_auth: json.keys?.auth ?? "",
    p_user_agent: navigator.userAgent.slice(0, 300),
  });
  if (error) {
    await suscripcion.unsubscribe();
    throw new Error(error.message);
  }
  return "activo";
}

/** Deja de recibir avisos en este dispositivo (también al cerrar sesión). */
export async function desactivarAvisos(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registro = await navigator.serviceWorker.getRegistration("/");
  const suscripcion = await registro?.pushManager.getSubscription();
  if (!suscripcion) return;
  await createClient().rpc("quitar_suscripcion_push", { p_endpoint: suscripcion.endpoint });
  await suscripcion.unsubscribe();
}
