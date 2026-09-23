// Decisões pendentes: pedidos de permissão (hook HTTP) e perguntas (saída estruturada).
import { executar, todos, um } from "./db.ts";
import { barramento } from "./eventos.ts";
import { notificar } from "./push.ts";
import type { Decisao } from "./tipos.ts";

const pendentes = new Map<number, (resposta: string) => void>();

export function criarDecisao(dados: { execucao_id: number | null; conversa_id: number | null; tipo: "permissao" | "pergunta"; payload: unknown }): Decisao {
  const r = executar(
    "INSERT INTO decisoes (execucao_id, conversa_id, tipo, payload) VALUES (?, ?, ?, ?)",
    dados.execucao_id,
    dados.conversa_id,
    dados.tipo,
    JSON.stringify(dados.payload),
  );
  const d = um<Decisao>("SELECT * FROM decisoes WHERE id = ?", Number(r.lastInsertRowid))!;
  if (dados.conversa_id) executar("UPDATE conversas SET lida = 0, atualizado_em = datetime('now') WHERE id = ?", dados.conversa_id);
  barramento.publicar("decisao", d);
  const p = dados.payload as { questions?: { question: string }[]; tool_name?: string };
  const corpo = dados.tipo === "pergunta" ? (p.questions?.map((q) => q.question).join(" · ") ?? "Claude tem uma pergunta.") : `Permissão pedida: ${p.tool_name ?? "ferramenta"}`;
  void notificar({ titulo: "Claudio precisa de você", corpo: corpo.slice(0, 180), url: dados.conversa_id ? `/#/conversa/${dados.conversa_id}` : "/#/conversas", etiqueta: `decisao-${d.id}` });
  return d;
}

/** Espera a resposta do usuário até `timeoutMs`; devolve null se estourar. */
export function esperarResposta(id: number, timeoutMs: number): Promise<string | null> {
  return new Promise((resolver) => {
    const timer = setTimeout(() => {
      pendentes.delete(id);
      resolver(null);
    }, timeoutMs);
    pendentes.set(id, (resposta) => {
      clearTimeout(timer);
      pendentes.delete(id);
      resolver(resposta);
    });
  });
}

export function responder(id: number, resposta: string): Decisao | undefined {
  executar("UPDATE decisoes SET resposta = ?, respondido_em = datetime('now') WHERE id = ?", resposta, id);
  const d = um<Decisao>("SELECT * FROM decisoes WHERE id = ?", id);
  pendentes.get(id)?.(resposta);
  barramento.publicar("decisao", d);
  return d;
}

export function pendentesLista(): Decisao[] {
  return todos<Decisao>("SELECT * FROM decisoes WHERE resposta IS NULL ORDER BY id");
}

export function estaPendenteAoVivo(id: number) {
  return pendentes.has(id);
}
