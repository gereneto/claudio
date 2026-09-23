// Notificações push (Web Push com VAPID) para o PWA no celular.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import webpush, { type PushSubscription } from "web-push";
import { config } from "./config.ts";
import { executar, todos } from "./db.ts";

interface Chaves {
  publicKey: string;
  privateKey: string;
}

let chaves: Chaves | null = null;

function carregarChaves(): Chaves {
  if (chaves) return chaves;
  const pasta = resolve(config.raiz, "dados");
  mkdirSync(pasta, { recursive: true });
  const arquivo = resolve(pasta, "vapid.json");
  if (existsSync(arquivo)) chaves = JSON.parse(readFileSync(arquivo, "utf8"));
  else {
    chaves = webpush.generateVAPIDKeys();
    writeFileSync(arquivo, JSON.stringify(chaves, null, 2));
  }
  // O "subject" é um contato para o serviço de push; um URL do projeto basta.
  webpush.setVapidDetails("https://github.com/gereneto/claudio", chaves!.publicKey, chaves!.privateKey);
  return chaves!;
}

export function chavePublica(): string {
  return carregarChaves().publicKey;
}

export function assinar(sub: PushSubscription, aparelho?: string) {
  executar(
    "INSERT INTO assinaturas_push (endpoint, dados, aparelho) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET dados = excluded.dados, aparelho = excluded.aparelho",
    sub.endpoint,
    JSON.stringify(sub),
    aparelho ?? null,
  );
}

export function cancelarAssinatura(endpoint: string) {
  executar("DELETE FROM assinaturas_push WHERE endpoint = ?", endpoint);
}

export function assinaturas() {
  return todos<{ id: number; endpoint: string; aparelho: string | null; criado_em: string; ultimo_envio: string | null }>(
    "SELECT id, endpoint, aparelho, criado_em, ultimo_envio FROM assinaturas_push ORDER BY id",
  );
}

export interface Notificacao {
  titulo: string;
  corpo: string;
  url?: string;
  etiqueta?: string;
}

/** Envia a notificação a todos os aparelhos assinados. Remove assinaturas mortas. */
export async function notificar(n: Notificacao): Promise<{ enviadas: number; removidas: number }> {
  carregarChaves();
  const lista = todos<{ id: number; endpoint: string; dados: string }>("SELECT id, endpoint, dados FROM assinaturas_push");
  let enviadas = 0;
  let removidas = 0;
  const carga = JSON.stringify({ titulo: n.titulo, corpo: n.corpo, url: n.url ?? "/", etiqueta: n.etiqueta ?? "claudio" });
  await Promise.all(
    lista.map(async (a) => {
      try {
        await webpush.sendNotification(JSON.parse(a.dados) as PushSubscription, carga, { TTL: 60 * 60 * 6 });
        executar("UPDATE assinaturas_push SET ultimo_envio = datetime('now') WHERE id = ?", a.id);
        enviadas++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          executar("DELETE FROM assinaturas_push WHERE id = ?", a.id);
          removidas++;
        } else console.warn("[push] falha ao enviar:", (e as Error).message);
      }
    }),
  );
  return { enviadas, removidas };
}
