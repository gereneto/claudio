// Escalonador: escolhe a próxima ordem ligada e a executa respeitando os limites.
import { executar, lerConfig, todos, um } from "./db.ts";
import { barramento } from "./eventos.ts";
import { avaliar } from "./limites.ts";
import { emExecucao, executarOrdem } from "./runner.ts";
import { atualizarLimites, atualizarSeVelho } from "./sentinela.ts";
import type { Ordem } from "./tipos.ts";

let timer: NodeJS.Timeout | undefined;
let pausado = false;
export let ultimaDecisao = { quando: new Date().toISOString(), texto: "ainda não rodou" };

function anotar(texto: string) {
  ultimaDecisao = { quando: new Date().toISOString(), texto };
  barramento.publicar("escalonador", ultimaDecisao);
}

/** Próxima ordem: pontuais ligadas por prioridade, depois contínuas em rodízio (a menos executada recentemente primeiro). */
export function proximaOrdem(): { ordem: Ordem; motivoBloqueio?: string } | undefined {
  const intervaloContinuaMin = Number(lerConfig("intervalo_continua_min", "60"));
  const pontual = um<Ordem>(
    "SELECT * FROM ordens WHERE ligada = 1 AND estado = 'fila' AND tipo = 'pontual' ORDER BY prioridade ASC, criado_em ASC LIMIT 1",
  );
  if (pontual) {
    const av = avaliar("pontual");
    return av.podeRodar ? { ordem: pontual } : { ordem: pontual, motivoBloqueio: av.motivo };
  }
  // O intervalo entre blocos conta a partir do fim da última execução da ordem, não de edições.
  const continua = um<Ordem>(
    `SELECT * FROM ordens WHERE ligada = 1 AND estado = 'fila' AND tipo = 'continua'
       AND NOT EXISTS (SELECT 1 FROM execucoes e WHERE e.ordem_id = ordens.id AND (e.fim IS NULL OR e.fim > datetime('now', ?)))
     ORDER BY prioridade ASC,
       (SELECT MAX(e.fim) FROM execucoes e WHERE e.ordem_id = ordens.id) ASC NULLS FIRST LIMIT 1`,
    `-${intervaloContinuaMin} minutes`,
  );
  if (continua) {
    const av = avaliar("continua");
    return av.podeRodar ? { ordem: continua } : { ordem: continua, motivoBloqueio: av.motivo };
  }
  return undefined;
}

let emTique = false;

async function tique() {
  if (pausado || emTique) return;
  emTique = true;
  try {
    const maxParalelas = Number(lerConfig("max_paralelas", "1"));
    if (emExecucao.size >= maxParalelas) return;
    const haFila = um<{ n: number }>("SELECT COUNT(*) AS n FROM ordens WHERE ligada = 1 AND estado = 'fila'")?.n ?? 0;
    if (!haFila) {
      anotar("fila vazia");
      return;
    }
    // Antes de decidir, garante uma leitura recente dos limites.
    await atualizarSeVelho();
    const escolha = proximaOrdem();
    if (!escolha) {
      anotar(`${haFila} ordem(ns) contínua(s) aguardando o intervalo entre blocos`);
      return;
    }
    if (escolha.motivoBloqueio) {
      anotar(`esperando: ${escolha.motivoBloqueio} (próxima: #${escolha.ordem.id} ${escolha.ordem.titulo})`);
      return;
    }
    anotar(`executando #${escolha.ordem.id} ${escolha.ordem.titulo}`);
    try {
      await executarOrdem(escolha.ordem);
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      executar("UPDATE ordens SET estado = 'erro', atualizado_em = datetime('now') WHERE id = ?", escolha.ordem.id);
      anotar(`falha em #${escolha.ordem.id}: ${msg}`);
    }
    void atualizarLimites("fim de execução");
  } finally {
    emTique = false;
  }
}

export function iniciarEscalonador(intervaloMs = 20_000) {
  // Ordens marcadas como rodando de uma execução anterior (queda do servidor) voltam para a fila.
  executar("UPDATE ordens SET estado = 'fila' WHERE estado = 'rodando'");
  timer = setInterval(() => void tique(), intervaloMs);
  void tique();
}

export function pararEscalonador() {
  if (timer) clearInterval(timer);
}

export function setPausado(valor: boolean) {
  pausado = valor;
  anotar(valor ? "pausado pelo usuário" : "retomado");
}
export const estaPausado = () => pausado;

/** Dispara agora uma ordem específica, ignorando a fila (mas não o limite de paralelismo). */
export async function rodarAgora(ordemId: number) {
  const ordem = um<Ordem>("SELECT * FROM ordens WHERE id = ?", ordemId);
  if (!ordem) throw new Error("ordem não existe");
  if (emExecucao.has(ordemId)) throw new Error("já está rodando");
  anotar(`execução manual de #${ordem.id}`);
  return executarOrdem(ordem);
}

export function filaAtual(): Ordem[] {
  return todos<Ordem>("SELECT * FROM ordens WHERE ligada = 1 AND estado IN ('fila','rodando','aguardando_decisao') ORDER BY tipo = 'continua', prioridade, criado_em");
}
