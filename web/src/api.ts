// Cliente da API do Claudio.
export interface Projeto {
  id: number;
  nome: string;
  repo: string | null;
  caminho: string | null;
  instrucoes: string | null;
  modelo_padrao: string | null;
  visivel: number;
  satelite_de: number | null;
  ordens_ligadas: number;
  ordens_total: number;
}
export interface Ordem {
  id: number;
  projeto_id: number;
  titulo: string;
  prompt: string;
  tipo: "pontual" | "continua";
  ligada: number;
  prioridade: number;
  estado: "fila" | "rodando" | "aguardando_decisao" | "pausada" | "concluida" | "erro";
  unidade: string | null;
  progresso_feito: number;
  progresso_total: number | null;
  criterio_fim: string | null;
  criado_em: string;
  atualizado_em: string;
}
export interface Execucao {
  id: number;
  ordem_id: number;
  session_id: string | null;
  modelo: string | null;
  inicio: string;
  fim: string | null;
  tokens_in: number;
  tokens_out: number;
  tokens_cache: number;
  custo_usd: number;
  resultado: string | null;
  resumo: string | null;
  erro: string | null;
}
export interface Conversa {
  id: number;
  titulo: string;
  pasta_id: number | null;
  projeto_id: number | null;
  ordem_id: number | null;
  lida: number;
  atualizado_em: string;
  projeto_nome?: string | null;
  pasta_nome?: string | null;
  ultima?: string | null;
}
export interface Mensagem {
  id: number;
  conversa_id: number;
  papel: "eu" | "claudio" | "claude";
  tipo: string;
  texto: string;
  criado_em: string;
}
export interface Decisao {
  id: number;
  execucao_id: number | null;
  conversa_id: number | null;
  tipo: "permissao" | "pergunta";
  payload: string;
  resposta: string | null;
  criado_em: string;
}
export interface Limites {
  h5_pct: number | null;
  h5_reset: number | null;
  d7_pct: number | null;
  d7_reset: number | null;
  momento: string;
  fonte: string;
}
export interface Estado {
  limites: Limites | null;
  ritmo_alvo: number | null;
  avaliacao_pontual: { podeRodar: boolean; motivo: string };
  avaliacao_continua: { podeRodar: boolean; motivo: string };
  rodando: number[];
  fila: Ordem[];
  escalonador: { pausado: boolean; ultima: { quando: string; texto: string } };
  nao_lidas: number;
  decisoes_pendentes: number;
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { "content-type": "application/json" }, ...init });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.erro ?? `HTTP ${r.status}`);
  return r.json();
}

export const api = {
  estado: () => pedir<Estado>("/api/estado"),
  projetos: (todos = false) => pedir<Projeto[]>(`/api/projetos${todos ? "?todos=1" : ""}`),
  importarProjetos: () => pedir("/api/projetos/importar", { method: "POST" }),
  editarProjeto: (id: number, dados: Partial<Projeto>) => pedir<Projeto>(`/api/projetos/${id}`, { method: "PATCH", body: JSON.stringify(dados) }),
  ordens: (projetoId?: number) => pedir<Ordem[]>(`/api/ordens${projetoId ? `?projeto_id=${projetoId}` : ""}`),
  criarOrdem: (dados: Partial<Ordem>) => pedir<Ordem>("/api/ordens", { method: "POST", body: JSON.stringify(dados) }),
  editarOrdem: (id: number, dados: Partial<Ordem>) => pedir<Ordem>(`/api/ordens/${id}`, { method: "PATCH", body: JSON.stringify(dados) }),
  apagarOrdem: (id: number) => pedir(`/api/ordens/${id}`, { method: "DELETE" }),
  rodarOrdem: (id: number) => pedir(`/api/ordens/${id}/rodar`, { method: "POST" }),
  execucoes: (ordemId: number) => pedir<Execucao[]>(`/api/ordens/${ordemId}/execucoes`),
  conversas: (naoLidas = false) => pedir<Conversa[]>(`/api/conversas${naoLidas ? "?nao_lidas=1" : ""}`),
  conversa: (id: number) => pedir<{ conversa: Conversa; mensagens: Mensagem[]; decisoes: Decisao[]; ordem: Ordem | null }>(`/api/conversas/${id}`),
  criarConversa: (titulo: string, projeto_id?: number | null) => pedir<Conversa>("/api/conversas", { method: "POST", body: JSON.stringify({ titulo, projeto_id: projeto_id ?? null }) }),
  marcarLida: (id: number) => pedir(`/api/conversas/${id}/lida`, { method: "POST" }),
  enviarMensagem: (id: number, texto: string) => pedir(`/api/conversas/${id}/mensagens`, { method: "POST", body: JSON.stringify({ texto }) }),
  decisoes: () => pedir<Decisao[]>("/api/decisoes"),
  responderDecisao: (id: number, resposta: string) => pedir(`/api/decisoes/${id}/responder`, { method: "POST", body: JSON.stringify({ resposta }) }),
  pausar: () => pedir("/api/escalonador/pausar", { method: "POST" }),
  retomar: () => pedir("/api/escalonador/retomar", { method: "POST" }),
  limitesManual: (d: Partial<Limites>) => pedir("/api/limites/manual", { method: "POST", body: JSON.stringify(d) }),
  atualizarLimites: () => pedir<{ ok: boolean }>("/api/limites/atualizar", { method: "POST" }),
};

/** Assina os eventos ao vivo do servidor. Devolve a função para cancelar. */
export function assinarEventos(aoEvento: (tipo: string, dados: unknown) => void): () => void {
  const es = new EventSource("/api/eventos");
  const tipos = ["ordem", "mensagem", "conversa", "decisao", "limites", "progresso", "escalonador", "notificacao"];
  for (const t of tipos) es.addEventListener(t, (e) => aoEvento(t, JSON.parse((e as MessageEvent).data)));
  return () => es.close();
}
