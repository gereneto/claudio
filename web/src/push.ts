// Lado do cliente das notificações push.
import { api } from "./api.ts";

export type EstadoPush = "indisponivel" | "sem_https" | "negado" | "desligado" | "ligado";

function base64ParaBytes(b64: string): Uint8Array {
  const preenchido = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(preenchido.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function registrarSw(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!window.isSecureContext) return "sem_https";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "indisponivel";
  if (Notification.permission === "denied") return "negado";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "ligado" : "desligado";
}

export async function ligarPush(): Promise<EstadoPush> {
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registrarSw());
  if (!reg) return "indisponivel";
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return "negado";
  const { chave } = await api.pushChave();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(chave) as BufferSource });
  await api.pushAssinar(sub.toJSON(), navigator.userAgent.slice(0, 120));
  return "ligado";
}

export async function desligarPush(): Promise<EstadoPush> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.pushCancelar(sub.endpoint);
    await sub.unsubscribe();
  }
  return "desligado";
}
