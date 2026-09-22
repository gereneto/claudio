// Runner: executa uma ordem (ou um pedaço dela) chamando o Claude Code em modo headless.
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { extrairRateLimits, rodarClaude, textoDoEvento, type Evento } from "./claude.ts";
import { config } from "./config.ts";
import { executar, lerConfig, um } from "./db.ts";
import { criarDecisao } from "./decisoes.ts";
import { barramento } from "./eventos.ts";
import { registrarSnapshot } from "./limites.ts";
import { garantirClone, satelitesDe } from "./projetos.ts";
import type { Conversa, Execucao, Ordem, Projeto } from "./tipos.ts";

export const emExecucao = new Map<number, AbortController>();

const SCHEMA_SAIDA = JSON.stringify({
  type: "object",
  properties: {
    status: { type: "string", enum: ["concluida", "parcial", "precisa_decisao", "erro"] },
    resumo: { type: "string", description: "3 a 5 linhas, direto ao ponto, em português" },
    progresso_feito: { type: "integer" },
    progresso_total: { type: "integer" },
    unidade: { type: "string" },
    pergunta: { type: "string" },
    opcoes: { type: "array", items: { type: "string" } },
  },
  required: ["status", "resumo"],
});

function promptSistema(ordem: Ordem, projeto: Projeto): string {
  const partes = [
    "Você está executando uma ordem do Claudio, um orquestrador pessoal. O usuário não está acompanhando em tempo real: ele lê só um resumo curto e responde decisões pelo celular.",
    "Regras: não faça perguntas retóricas; se realmente precisar de uma decisão do usuário, encerre devolvendo status precisa_decisao com pergunta e opcoes. Não gaste tokens relendo arquivos grandes sem necessidade. Não crie commits nem faça push a menos que a ordem peça.",
    "Ao terminar, devolva o JSON pedido com um resumo de 3 a 5 linhas em português, direto ao ponto: o que foi feito, o que ficou pendente, arquivos principais tocados.",
  ];
  if (ordem.tipo === "continua") {
    partes.push(
      `Esta é uma ordem contínua: faça APENAS um pedaço de trabalho nesta execução (unidade: ${ordem.unidade ?? "defina uma unidade razoável e informe em 'unidade'"}). Progresso até agora: ${ordem.progresso_feito}${ordem.progresso_total ? ` de ${ordem.progresso_total}` : ""}. Devolva progresso_feito e progresso_total atualizados; use status parcial se ainda falta trabalho e concluida quando o critério de fim for atingido${ordem.criterio_fim ? ` (critério: ${ordem.criterio_fim})` : ""}.`,
    );
  }
  if (projeto.instrucoes) partes.push(`Instruções fixas do projeto ${projeto.nome}: ${projeto.instrucoes}`);
  return partes.join("\n\n");
}

function conversaDaOrdem(ordem: Ordem): Conversa {
  const existente = um<Conversa>("SELECT * FROM conversas WHERE ordem_id = ?", ordem.id);
  if (existente) return existente;
  const r = executar("INSERT INTO conversas (titulo, projeto_id, ordem_id) VALUES (?, ?, ?)", ordem.titulo, ordem.projeto_id, ordem.id);
  return um<Conversa>("SELECT * FROM conversas WHERE id = ?", Number(r.lastInsertRowid))!;
}

export function registrarMensagem(conversaId: number, papel: "eu" | "claudio" | "claude", tipo: string, texto: string) {
  executar("INSERT INTO mensagens (conversa_id, papel, tipo, texto, lida) VALUES (?, ?, ?, ?, ?)", conversaId, papel, tipo, texto, papel === "eu" ? 1 : 0);
  executar("UPDATE conversas SET lida = ?, atualizado_em = datetime('now') WHERE id = ?", papel === "eu" ? 1 : 0, conversaId);
  barramento.publicar("mensagem", { conversa_id: conversaId, papel, tipo, texto });
}

function arquivoSettingsHooks(): string {
  const pasta = resolve(config.raiz, "dados");
  mkdirSync(pasta, { recursive: true });
  const base = `http://127.0.0.1:${config.porta}/hooks`;
  const settings = {
    hooks: {
      Notification: [{ hooks: [{ type: "http", url: `${base}/notification`, timeout: 15 }] }],
    },
  };
  const caminho = resolve(pasta, "settings-hooks.json");
  writeFileSync(caminho, JSON.stringify(settings, null, 2));
  return caminho;
}

/** Config de MCP com o anfitrião de permissões do Claudio, identificando a ordem/conversa. */
function arquivoMcp(chave: string, env: Record<string, string>): string {
  const pasta = resolve(config.raiz, "dados", "mcp");
  mkdirSync(pasta, { recursive: true });
  const tsxCli = resolve(config.raiz, "node_modules", "tsx", "dist", "cli.mjs");
  const cfg = {
    mcpServers: {
      claudio: {
        command: process.execPath,
        args: [tsxCli, resolve(config.raiz, "server", "src", "mcp-permissao.ts")],
        env: { CLAUDIO_PORTA: String(config.porta), ...env },
      },
    },
  };
  const caminho = resolve(pasta, `${chave}.json`);
  writeFileSync(caminho, JSON.stringify(cfg, null, 2));
  return caminho;
}

/** Flags comuns: permissões pelo MCP do Claudio + prazo longo para a ferramenta MCP esperar o celular. */
function permissoesPeloClaudio(chave: string, env: Record<string, string>) {
  const timeoutMs = (Number(lerConfig("timeout_permissao_seg", "1800")) + 60) * 1000;
  return {
    extra: ["--permission-prompt-tool", "mcp__claudio__aprovar", "--mcp-config", arquivoMcp(chave, env)],
    env: { MCP_TOOL_TIMEOUT: String(timeoutMs), MCP_TIMEOUT: "60000" },
  };
}

/** Executa uma ordem (um pedaço, se contínua). Devolve a execução registrada. */
export async function executarOrdem(ordem: Ordem, opcoes: { respostaDecisao?: string } = {}): Promise<Execucao> {
  const projeto = um<Projeto>("SELECT * FROM projetos WHERE id = ?", ordem.projeto_id);
  if (!projeto) throw new Error(`Projeto ${ordem.projeto_id} não existe`);
  const cwd = await garantirClone(projeto);
  const addDirs: string[] = [];
  for (const sat of satelitesDe(projeto.id)) {
    try {
      addDirs.push(await garantirClone(sat, dirname(cwd)));
    } catch (e) {
      console.warn(`[runner] satélite ${sat.nome} sem clone:`, (e as Error).message);
    }
  }
  const conversa = conversaDaOrdem(ordem);
  const modelo = projeto.modelo_padrao ?? lerConfig("modelo_executor", "sonnet");

  const r = executar("INSERT INTO execucoes (ordem_id, modelo) VALUES (?, ?)", ordem.id, modelo);
  const execId = Number(r.lastInsertRowid);
  executar("UPDATE ordens SET estado = 'rodando', atualizado_em = datetime('now') WHERE id = ?", ordem.id);
  barramento.publicar("ordem", { id: ordem.id, estado: "rodando" });

  const controlador = new AbortController();
  emExecucao.set(ordem.id, controlador);
  registrarMensagem(conversa.id, "claudio", "sistema", opcoes.respostaDecisao ? "Retomando com a sua resposta." : `Iniciando execução com ${modelo}.`);

  // Retoma a sessão anterior quando há resposta de decisão ou quando a última execução foi interrompida.
  const ultimaExec = um<Execucao>("SELECT * FROM execucoes WHERE ordem_id = ? AND id < ? ORDER BY id DESC LIMIT 1", ordem.id, execId);
  const continuar = !opcoes.respostaDecisao && ultimaExec?.resultado === "interrompida" && !!ordem.session_id;
  const prompt = opcoes.respostaDecisao
    ? `Decisão do usuário: ${opcoes.respostaDecisao}. Prossiga.`
    : continuar
      ? `A execução anterior foi interrompida antes de terminar. Continue a ordem de onde parou, sem refazer o que já foi feito. Ordem original: ${ordem.prompt}`
      : ordem.prompt;
  const retomar = (opcoes.respostaDecisao || continuar) && ordem.session_id ? ordem.session_id : undefined;
  if (continuar) registrarMensagem(conversa.id, "claudio", "sistema", "Retomando a execução interrompida.");

  const pastaLogs = resolve(config.raiz, "dados", "logs");
  mkdirSync(pastaLogs, { recursive: true });
  const log = createWriteStream(resolve(pastaLogs, `exec-${execId}.jsonl`), { flags: "a" });
  let sessionIdInicial: string | undefined;
  let ultimoTexto = "";
  const { promessa } = rodarClaude(prompt, {
    cwd,
    modelo,
    permissionMode: "auto",
    maxTurns: Number(lerConfig(ordem.tipo === "continua" ? "max_turns_continua" : "max_turns_pontual", "400")),
    appendSystemPrompt: promptSistema(ordem, projeto),
    settingsArquivo: arquivoSettingsHooks(),
    addDirs,
    jsonSchema: SCHEMA_SAIDA,
    resume: retomar,
    ...permissoesPeloClaudio(`ordem-${ordem.id}`, { CLAUDIO_ORDEM_ID: String(ordem.id), CLAUDIO_CONVERSA_ID: String(conversa.id) }),
    sinal: controlador.signal,
    aoEvento: (e: Evento) => {
      log.write(JSON.stringify(e) + "\n");
      if (e.type === "system" && e.subtype === "init" && e.session_id) {
        sessionIdInicial = e.session_id;
        executar("UPDATE execucoes SET session_id = ? WHERE id = ?", e.session_id, execId);
      }
      const rl = extrairRateLimits(e);
      if (rl) registrarSnapshot(rl, "stream");
      if (e.type === "assistant") {
        const t = textoDoEvento(e);
        if (t) ultimoTexto = t;
        barramento.publicar("progresso", { ordem_id: ordem.id, execucao_id: execId, texto: t.slice(0, 200) });
      }
    },
  });

  const res = await promessa;
  log.end();
  emExecucao.delete(ordem.id);
  const fim = res.resultado;
  const saida = fim?.structured_output as { status?: string; resumo?: string; progresso_feito?: number; progresso_total?: number; unidade?: string; pergunta?: string; opcoes?: string[] } | undefined;

  let resultado: Execucao["resultado"] = "erro";
  let erro: string | null = null;
  let resumo = saida?.resumo ?? (ultimoTexto ? ultimoTexto.slice(0, 1500) : null);

  if (!fim) {
    // O processo acabou sem o evento final (limite de turnos, queda, cancelamento): dá para retomar a sessão.
    resultado = controlador.signal.aborted ? "cancelada" : "interrompida";
    erro = `processo terminou (código ${res.codigoSaida}) sem o evento de resultado após ${res.eventos.length} eventos. ${res.stderr.slice(-500)}`.trim();
  } else if (fim.is_error) {
    erro = typeof fim.result === "string" ? fim.result : res.stderr.slice(-800) || "erro sem detalhe";
    if (/rate|limit|quota/i.test(erro)) resultado = "limite";
    else if (fim.subtype === "error_max_turns") resultado = "interrompida";
  } else if (saida?.status === "precisa_decisao") resultado = "precisa_decisao";
  else if (saida?.status === "erro") {
    resultado = "erro";
    erro = saida.resumo ?? "erro relatado pelo Claude";
  } else resultado = "concluida";

  const sessionId = (fim?.session_id as string | undefined) ?? sessionIdInicial ?? ordem.session_id ?? null;
  executar(
    "UPDATE execucoes SET session_id = ?, fim = datetime('now'), tokens_in = ?, tokens_out = ?, tokens_cache = ?, custo_usd = ?, resultado = ?, resumo = ?, erro = ? WHERE id = ?",
    sessionId,
    fim?.usage?.input_tokens ?? 0,
    fim?.usage?.output_tokens ?? 0,
    (fim?.usage?.cache_read_input_tokens ?? 0) + (fim?.usage?.cache_creation_input_tokens ?? 0),
    fim?.total_cost_usd ?? 0,
    resultado,
    resumo,
    erro,
    execId,
  );

  // Estado da ordem
  let estado: Ordem["estado"];
  if (resultado === "precisa_decisao") estado = "aguardando_decisao";
  else if (resultado === "erro") estado = "erro";
  else if (resultado === "cancelada") estado = "pausada";
  else if (resultado === "limite" || resultado === "interrompida") estado = "fila";
  else if (ordem.tipo === "continua" && saida?.status === "parcial") estado = "fila";
  else estado = "concluida";

  executar(
    "UPDATE ordens SET estado = ?, session_id = ?, progresso_feito = COALESCE(?, progresso_feito), progresso_total = COALESCE(?, progresso_total), unidade = COALESCE(?, unidade), ligada = CASE WHEN ? = 'concluida' THEN 0 ELSE ligada END, atualizado_em = datetime('now') WHERE id = ?",
    estado,
    sessionId,
    saida?.progresso_feito ?? null,
    saida?.progresso_total ?? null,
    saida?.unidade ?? null,
    estado,
    ordem.id,
  );

  if (resultado === "precisa_decisao") {
    registrarMensagem(conversa.id, "claude", "resumo", resumo ?? "Preciso de uma decisão.");
    criarDecisao({ execucao_id: execId, conversa_id: conversa.id, tipo: "pergunta", payload: { ordem_id: ordem.id, pergunta: saida?.pergunta ?? "?", opcoes: saida?.opcoes ?? [] } });
  } else if (resultado === "erro" || resultado === "limite" || resultado === "interrompida" || resultado === "cancelada") {
    if (ultimoTexto && resultado !== "cancelada") registrarMensagem(conversa.id, "claude", "resumo", `(última mensagem antes da interrupção) ${ultimoTexto.slice(0, 1200)}`);
    registrarMensagem(conversa.id, "claudio", "sistema", `Execução terminou com ${resultado}: ${erro ?? ""}`.trim());
  } else {
    registrarMensagem(conversa.id, "claude", "resumo", resumo ?? "Concluído sem resumo.");
  }
  barramento.publicar("ordem", { id: ordem.id, estado });
  return um<Execucao>("SELECT * FROM execucoes WHERE id = ?", execId)!;
}

/** Chat solto: uma conversa livre com o Claude, com retomada de sessão. */
export async function conversar(conversa: Conversa, texto: string): Promise<string> {
  registrarMensagem(conversa.id, "eu", "livre", texto);
  const projeto = conversa.projeto_id ? um<Projeto>("SELECT * FROM projetos WHERE id = ?", conversa.projeto_id) : undefined;
  const cwd = projeto?.caminho ?? resolve(config.raiz, "dados", "chats");
  mkdirSync(cwd, { recursive: true });
  const modelo = lerConfig("modelo_chat", "sonnet");
  const { promessa } = rodarClaude(texto, {
    cwd,
    modelo,
    permissionMode: "auto",
    maxTurns: 30,
    resume: conversa.session_id ?? undefined,
    settingsArquivo: arquivoSettingsHooks(),
    ...permissoesPeloClaudio(`conversa-${conversa.id}`, { CLAUDIO_CONVERSA_ID: String(conversa.id) }),
    appendSystemPrompt: "Você conversa com o usuário pelo Claudio, num celular. Seja direto e curto. Responda em português.",
    aoEvento: (e) => {
      const rl = extrairRateLimits(e);
      if (rl) registrarSnapshot(rl, "stream");
    },
  });
  const res = await promessa;
  const fim = res.resultado;
  const resposta = typeof fim?.result === "string" && fim.result ? fim.result : `Erro: ${res.stderr.slice(-300) || "sem resposta"}`;
  if (fim?.session_id) executar("UPDATE conversas SET session_id = ? WHERE id = ?", fim.session_id, conversa.id);
  registrarMensagem(conversa.id, "claude", "livre", resposta);
  return resposta;
}
