export type TipoOrdem = "pontual" | "continua";
export type EstadoOrdem = "fila" | "rodando" | "aguardando_decisao" | "pausada" | "concluida" | "erro";
export type ResultadoExecucao = "concluida" | "precisa_decisao" | "erro" | "limite" | "cancelada";
export type Papel = "eu" | "claudio" | "claude";
export type TipoMensagem = "resumo" | "decisao" | "livre" | "sistema";

export interface Projeto {
  id: number;
  nome: string;
  repo: string | null;
  caminho: string | null;
  instrucoes: string | null;
  modelo_padrao: string | null;
  visivel: number;
  satelite_de: number | null;
  criado_em: string;
}

export interface Ordem {
  id: number;
  projeto_id: number;
  titulo: string;
  prompt: string;
  tipo: TipoOrdem;
  ligada: number;
  prioridade: number;
  estado: EstadoOrdem;
  unidade: string | null;
  progresso_feito: number;
  progresso_total: number | null;
  criterio_fim: string | null;
  session_id: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Execucao {
  id: number;
  ordem_id: number;
  session_id: string | null;
  modelo: string | null;
  effort: string | null;
  inicio: string;
  fim: string | null;
  tokens_in: number;
  tokens_out: number;
  tokens_cache: number;
  custo_usd: number;
  resultado: ResultadoExecucao | null;
  resumo: string | null;
  erro: string | null;
}

export interface Decisao {
  id: number;
  execucao_id: number | null;
  conversa_id: number | null;
  tipo: "permissao" | "pergunta";
  payload: string;
  resposta: string | null;
  criado_em: string;
  respondido_em: string | null;
}

export interface Conversa {
  id: number;
  titulo: string;
  pasta_id: number | null;
  projeto_id: number | null;
  ordem_id: number | null;
  session_id: string | null;
  lida: number;
  atualizado_em: string;
}

export interface Mensagem {
  id: number;
  conversa_id: number;
  papel: Papel;
  tipo: TipoMensagem;
  texto: string;
  lida: number;
  criado_em: string;
}

export interface SnapshotUso {
  id: number;
  momento: string;
  h5_pct: number | null;
  h5_reset: number | null;
  d7_pct: number | null;
  d7_reset: number | null;
  fonte: string;
}
