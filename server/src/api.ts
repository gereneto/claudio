// API HTTP do Claudio (consumida pelo PWA) e receptores de hooks do Claude Code.
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { executar, gravarConfig, lerConfig, todos, um } from "./db.ts";
import { criarDecisao, esperarResposta, pendentesLista, responder } from "./decisoes.ts";
import { barramento, type EventoClaudio } from "./eventos.ts";
import { estaPausado, filaAtual, rodarAgora, setPausado, ultimaDecisao } from "./escalonador.ts";
import { avaliar, historico, registrarSnapshot, ritmoAlvo, ultimoSnapshot } from "./limites.ts";
import { importarDoGithub } from "./projetos.ts";
import { conversar, emExecucao, executarOrdem, registrarMensagem } from "./runner.ts";
import { atualizarLimites, receberStatusLine, sentinelaAtiva } from "./sentinela.ts";
import type { Conversa, Decisao, Execucao, Mensagem, Ordem, Projeto } from "./tipos.ts";

export const app = new Hono();

const idParam = (c: { req: { param: (n: string) => string | undefined } }) => Number(c.req.param("id"));

// ---------- Estado geral ----------
app.get("/api/estado", (c) => {
  const s = ultimoSnapshot();
  return c.json({
    limites: s ?? null,
    ritmo_alvo: ritmoAlvo(),
    avaliacao_pontual: avaliar("pontual"),
    avaliacao_continua: avaliar("continua"),
    rodando: [...emExecucao.keys()],
    fila: filaAtual(),
    escalonador: { pausado: estaPausado(), ultima: ultimaDecisao, sentinela: sentinelaAtiva() },
    nao_lidas: um<{ n: number }>("SELECT COUNT(*) AS n FROM conversas WHERE lida = 0")?.n ?? 0,
    decisoes_pendentes: pendentesLista().length,
  });
});

app.post("/api/escalonador/pausar", (c) => {
  setPausado(true);
  return c.json({ ok: true });
});
app.post("/api/escalonador/retomar", (c) => {
  setPausado(false);
  return c.json({ ok: true });
});

// ---------- Projetos ----------
app.get("/api/projetos", (c) => {
  const todosProjetos = c.req.query("todos") === "1";
  const projetos = todos<Projeto & { ordens_ligadas: number; ordens_total: number }>(
    `SELECT p.*,
       (SELECT COUNT(*) FROM ordens o WHERE o.projeto_id = p.id AND o.ligada = 1) AS ordens_ligadas,
       (SELECT COUNT(*) FROM ordens o WHERE o.projeto_id = p.id) AS ordens_total
     FROM projetos p ${todosProjetos ? "" : "WHERE p.visivel = 1"} ORDER BY p.nome`,
  );
  return c.json(projetos);
});

app.post("/api/projetos/importar", async (c) => c.json(await importarDoGithub()));

const projetoPatch = z.object({
  nome: z.string().min(1).optional(),
  caminho: z.string().nullable().optional(),
  instrucoes: z.string().nullable().optional(),
  modelo_padrao: z.string().nullable().optional(),
  visivel: z.number().int().min(0).max(1).optional(),
  satelite_de: z.number().int().nullable().optional(),
});
app.patch("/api/projetos/:id", async (c) => {
  const id = idParam(c);
  const dados = projetoPatch.parse(await c.req.json());
  for (const [k, v] of Object.entries(dados)) executar(`UPDATE projetos SET ${k} = ? WHERE id = ?`, v, id);
  return c.json(um<Projeto>("SELECT * FROM projetos WHERE id = ?", id));
});

// ---------- Ordens ----------
app.get("/api/ordens", (c) => {
  const projetoId = c.req.query("projeto_id");
  const ordens = projetoId
    ? todos<Ordem>("SELECT * FROM ordens WHERE projeto_id = ? ORDER BY ligada DESC, tipo, prioridade, criado_em", Number(projetoId))
    : todos<Ordem>("SELECT * FROM ordens ORDER BY ligada DESC, tipo, prioridade, criado_em");
  return c.json(ordens);
});

const ordemNova = z.object({
  projeto_id: z.number().int(),
  titulo: z.string().min(1),
  prompt: z.string().min(1),
  tipo: z.enum(["pontual", "continua"]).default("pontual"),
  prioridade: z.number().int().min(1).max(9).default(5),
  unidade: z.string().nullable().optional(),
  progresso_total: z.number().int().nullable().optional(),
  criterio_fim: z.string().nullable().optional(),
});
app.post("/api/ordens", async (c) => {
  const d = ordemNova.parse(await c.req.json());
  const r = executar(
    "INSERT INTO ordens (projeto_id, titulo, prompt, tipo, prioridade, unidade, progresso_total, criterio_fim) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    d.projeto_id,
    d.titulo,
    d.prompt,
    d.tipo,
    d.prioridade,
    d.unidade ?? null,
    d.progresso_total ?? null,
    d.criterio_fim ?? null,
  );
  const ordem = um<Ordem>("SELECT * FROM ordens WHERE id = ?", Number(r.lastInsertRowid));
  barramento.publicar("ordem", ordem);
  return c.json(ordem, 201);
});

const ordemPatch = ordemNova.partial().extend({ ligada: z.number().int().min(0).max(1).optional(), estado: z.enum(["fila", "pausada", "concluida"]).optional() });
app.patch("/api/ordens/:id", async (c) => {
  const id = idParam(c);
  const d = ordemPatch.parse(await c.req.json());
  const atual = um<Ordem>("SELECT * FROM ordens WHERE id = ?", id);
  if (!atual) return c.json({ erro: "ordem não existe" }, 404);
  for (const [k, v] of Object.entries(d)) executar(`UPDATE ordens SET ${k} = ?, atualizado_em = datetime('now') WHERE id = ?`, v, id);
  // Ligar uma ordem concluída/errada a coloca de volta na fila.
  if (d.ligada === 1 && ["concluida", "erro", "pausada"].includes(atual.estado)) executar("UPDATE ordens SET estado = 'fila' WHERE id = ?", id);
  if (d.ligada === 0 && emExecucao.has(id)) emExecucao.get(id)!.abort();
  const ordem = um<Ordem>("SELECT * FROM ordens WHERE id = ?", id);
  barramento.publicar("ordem", ordem);
  return c.json(ordem);
});

app.delete("/api/ordens/:id", (c) => {
  const id = idParam(c);
  emExecucao.get(id)?.abort();
  executar("DELETE FROM ordens WHERE id = ?", id);
  barramento.publicar("ordem", { id, apagada: true });
  return c.json({ ok: true });
});

app.post("/api/ordens/:id/rodar", async (c) => {
  try {
    void rodarAgora(idParam(c));
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ erro: (e as Error).message }, 400);
  }
});

app.get("/api/ordens/:id/execucoes", (c) => c.json(todos<Execucao>("SELECT * FROM execucoes WHERE ordem_id = ? ORDER BY id DESC", idParam(c))));

// ---------- Conversas ----------
app.get("/api/conversas", (c) => {
  const soNaoLidas = c.req.query("nao_lidas") === "1";
  const conversas = todos<Conversa & { projeto_nome: string | null; pasta_nome: string | null; ultima: string | null }>(
    `SELECT cv.*, p.nome AS projeto_nome, pa.nome AS pasta_nome,
       (SELECT texto FROM mensagens m WHERE m.conversa_id = cv.id ORDER BY m.id DESC LIMIT 1) AS ultima
     FROM conversas cv LEFT JOIN projetos p ON p.id = cv.projeto_id LEFT JOIN pastas pa ON pa.id = cv.pasta_id
     ${soNaoLidas ? "WHERE cv.lida = 0" : ""} ORDER BY cv.atualizado_em DESC`,
  );
  return c.json(conversas);
});

app.post("/api/conversas", async (c) => {
  const d = z.object({ titulo: z.string().min(1), projeto_id: z.number().int().nullable().optional(), pasta_id: z.number().int().nullable().optional() }).parse(await c.req.json());
  const r = executar("INSERT INTO conversas (titulo, projeto_id, pasta_id, lida) VALUES (?, ?, ?, 1)", d.titulo, d.projeto_id ?? null, d.pasta_id ?? null);
  return c.json(um<Conversa>("SELECT * FROM conversas WHERE id = ?", Number(r.lastInsertRowid)), 201);
});

app.get("/api/conversas/:id", (c) => {
  const id = idParam(c);
  const conversa = um<Conversa>("SELECT * FROM conversas WHERE id = ?", id);
  if (!conversa) return c.json({ erro: "não existe" }, 404);
  const mensagens = todos<Mensagem>("SELECT * FROM mensagens WHERE conversa_id = ? ORDER BY id", id);
  const decisoes = todos<Decisao>("SELECT * FROM decisoes WHERE conversa_id = ? AND resposta IS NULL ORDER BY id", id);
  const ordem = conversa.ordem_id ? um<Ordem>("SELECT * FROM ordens WHERE id = ?", conversa.ordem_id) : null;
  return c.json({ conversa, mensagens, decisoes, ordem });
});

app.post("/api/conversas/:id/lida", (c) => {
  const id = idParam(c);
  executar("UPDATE conversas SET lida = 1 WHERE id = ?", id);
  executar("UPDATE mensagens SET lida = 1 WHERE conversa_id = ?", id);
  barramento.publicar("conversa", { id, lida: 1 });
  return c.json({ ok: true });
});

app.post("/api/conversas/:id/mensagens", async (c) => {
  const id = idParam(c);
  const conversa = um<Conversa>("SELECT * FROM conversas WHERE id = ?", id);
  if (!conversa) return c.json({ erro: "não existe" }, 404);
  const { texto } = z.object({ texto: z.string().min(1) }).parse(await c.req.json());
  if (conversa.ordem_id) {
    // Mensagem numa conversa de ordem: vira instrução adicional na próxima execução.
    registrarMensagem(id, "eu", "livre", texto);
    executar("UPDATE ordens SET prompt = prompt || char(10) || char(10) || 'Instrução adicional do usuário: ' || ? WHERE id = ?", texto, conversa.ordem_id);
    return c.json({ ok: true, anexado_a_ordem: conversa.ordem_id });
  }
  void conversar(conversa, texto).catch((e) => registrarMensagem(id, "claudio", "sistema", `Erro: ${(e as Error).message}`));
  return c.json({ ok: true });
});

// ---------- Decisões ----------
app.get("/api/decisoes", (c) => c.json(pendentesLista()));

app.post("/api/decisoes/:id/responder", async (c) => {
  const id = idParam(c);
  const { resposta } = z.object({ resposta: z.string().min(1) }).parse(await c.req.json());
  const d = responder(id, resposta);
  if (!d) return c.json({ erro: "não existe" }, 404);
  if (d.conversa_id) registrarMensagem(d.conversa_id, "eu", "decisao", respostaLegivel(d, resposta));
  if (d.tipo === "pergunta") {
    const payload = JSON.parse(d.payload) as { ordem_id?: number };
    const ordem = payload.ordem_id ? um<Ordem>("SELECT * FROM ordens WHERE id = ?", payload.ordem_id) : undefined;
    if (ordem && ordem.estado === "aguardando_decisao") void executarOrdem(ordem, { respostaDecisao: resposta }).catch(() => undefined);
  }
  return c.json(d);
});

// ---------- Limites ----------
app.get("/api/limites", (c) => c.json({ atual: ultimoSnapshot() ?? null, ritmo_alvo: ritmoAlvo(), historico: historico(100) }));
app.post("/api/limites/manual", async (c) => {
  const d = z.object({ h5_pct: z.number().nullable().optional(), h5_reset: z.number().nullable().optional(), d7_pct: z.number().nullable().optional(), d7_reset: z.number().nullable().optional() }).parse(await c.req.json());
  registrarSnapshot(d, "manual");
  return c.json(ultimoSnapshot());
});

// ---------- Config ----------
const chavesConfig = ["modelo_executor", "modelo_chat", "teto_h5_pct", "folga_semanal_pct", "reserva_pontual_pct", "intervalo_continua_min", "max_paralelas", "max_turns_pontual", "max_turns_continua", "timeout_permissao_seg"];
app.get("/api/config", (c) => c.json(Object.fromEntries(chavesConfig.map((k) => [k, lerConfig(k, "")]))));
app.patch("/api/config", async (c) => {
  const d = (await c.req.json()) as Record<string, string>;
  for (const [k, v] of Object.entries(d)) if (chavesConfig.includes(k)) gravarConfig(k, String(v));
  return c.json({ ok: true });
});

// ---------- Eventos ao vivo (SSE) ----------
app.get("/api/eventos", (c) =>
  streamSSE(c, async (stream) => {
    const ouvinte = (e: EventoClaudio) => void stream.writeSSE({ event: e.tipo, data: JSON.stringify(e.dados ?? null) });
    barramento.on("evento", ouvinte);
    await stream.writeSSE({ event: "ola", data: "{}" });
    let vivo = true;
    stream.onAbort(() => {
      vivo = false;
      barramento.off("evento", ouvinte);
    });
    while (vivo) {
      await stream.sleep(25_000);
      await stream.writeSSE({ event: "ping", data: "{}" });
    }
  }),
);

// ---------- Hooks vindos do Claude Code ----------
app.post("/hooks/permission-request", async (c) => {
  const corpo = (await c.req.json()) as { session_id?: string; tool_name?: string; tool_input?: unknown; tool_use_id?: string; cwd?: string };
  const exec = corpo.session_id ? um<Execucao>("SELECT * FROM execucoes WHERE session_id = ? ORDER BY id DESC LIMIT 1", corpo.session_id) : undefined;
  const ordem = exec ? um<Ordem>("SELECT * FROM ordens WHERE id = ?", exec.ordem_id) : undefined;
  const conversa = ordem ? um<Conversa>("SELECT * FROM conversas WHERE ordem_id = ?", ordem.id) : corpo.session_id ? um<Conversa>("SELECT * FROM conversas WHERE session_id = ?", corpo.session_id) : undefined;
  const d = criarDecisao({ execucao_id: exec?.id ?? null, conversa_id: conversa?.id ?? null, tipo: "permissao", payload: { tool_name: corpo.tool_name, tool_input: corpo.tool_input, cwd: corpo.cwd } });
  if (conversa) registrarMensagem(conversa.id, "claudio", "decisao", `Permissão pedida: ${corpo.tool_name} ${resumirEntrada(corpo.tool_input)}`);
  const resposta = await esperarResposta(d.id, Number(lerConfig("timeout_permissao_seg", "1800")) * 1000 - 5000);
  const permitido = resposta === "allow";
  return c.json({
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: permitido
        ? { behavior: "allow", updatedInput: corpo.tool_input }
        : { behavior: "deny", message: resposta ? `Usuário negou: ${resposta}` : "Ninguém respondeu a tempo; siga sem esta ação." },
    },
  });
});

// Chamado pelo MCP de permissões (server/src/mcp-permissao.ts) a cada pedido do Claude.
// Fica pendurado até o usuário responder pelo celular ou o prazo estourar.
app.post("/api/interno/permissao", async (c) => {
  const corpo = (await c.req.json()) as { session_id?: string; tool_name?: string; input?: any; tool_use_id?: string; ordem_id?: number; conversa_id?: number };
  const ordem = corpo.ordem_id ? um<Ordem>("SELECT * FROM ordens WHERE id = ?", corpo.ordem_id) : undefined;
  const conversa = corpo.conversa_id
    ? um<Conversa>("SELECT * FROM conversas WHERE id = ?", corpo.conversa_id)
    : ordem
      ? um<Conversa>("SELECT * FROM conversas WHERE ordem_id = ?", ordem.id)
      : undefined;
  const exec = ordem ? um<Execucao>("SELECT * FROM execucoes WHERE ordem_id = ? ORDER BY id DESC LIMIT 1", ordem.id) : undefined;
  const ehPergunta = corpo.tool_name === "AskUserQuestion";
  const d = criarDecisao({
    execucao_id: exec?.id ?? null,
    conversa_id: conversa?.id ?? null,
    tipo: ehPergunta ? "pergunta" : "permissao",
    payload: ehPergunta ? { questions: corpo.input?.questions ?? [] } : { tool_name: corpo.tool_name, tool_input: corpo.input },
  });
  if (conversa) {
    const texto = ehPergunta
      ? `Pergunta: ${(corpo.input?.questions ?? []).map((q: any) => q.question).join(" | ")}`
      : `Permissão pedida: ${corpo.tool_name} ${resumirEntrada(corpo.input)}`;
    registrarMensagem(conversa.id, "claudio", "decisao", texto);
  }
  const resposta = await esperarResposta(d.id, Number(lerConfig("timeout_permissao_seg", "1800")) * 1000);
  if (resposta == null) return c.json({ behavior: "deny", message: "Ninguém respondeu a tempo. Siga sem esta ação e não repita o pedido." });
  if (ehPergunta) {
    let answers: Record<string, string> = {};
    try {
      answers = JSON.parse(resposta);
    } catch {
      const primeira = corpo.input?.questions?.[0]?.question ?? "?";
      answers = { [primeira]: resposta };
    }
    return c.json({ behavior: "allow", updatedInput: { questions: corpo.input?.questions ?? [], answers } });
  }
  if (resposta === "allow") return c.json({ behavior: "allow", updatedInput: corpo.input ?? {} });
  return c.json({ behavior: "deny", message: `Usuário negou: ${resposta}` });
});

app.post("/hooks/statusline", async (c) => {
  receberStatusLine(await c.req.json().catch(() => null));
  return c.json({});
});

app.post("/api/limites/atualizar", async (c) => {
  const ok = await atualizarLimites("pedido pelo usuário");
  return c.json({ ok, atual: ultimoSnapshot() ?? null });
});

app.post("/hooks/notification", async (c) => {
  const corpo = (await c.req.json()) as { session_id?: string; notification_type?: string; message?: string };
  barramento.publicar("notificacao", corpo);
  return c.json({});
});

/** Transforma a resposta bruta de uma decisão em texto para a conversa. */
function respostaLegivel(d: Decisao, resposta: string): string {
  if (d.tipo === "permissao") return resposta === "allow" ? "Permitido." : `Negado: ${resposta}`;
  try {
    const answers = JSON.parse(resposta) as Record<string, string | string[]>;
    if (answers && typeof answers === "object") {
      const partes = Object.entries(answers).map(([q, r]) => `${q} → ${Array.isArray(r) ? r.join(", ") : r}`);
      if (partes.length === 1) return partes[0].split(" → ").pop() ?? resposta;
      return partes.join("\n");
    }
  } catch {
    /* texto simples */
  }
  return resposta;
}

function resumirEntrada(entrada: unknown): string {
  if (!entrada || typeof entrada !== "object") return "";
  const e = entrada as Record<string, unknown>;
  const s = String(e.command ?? e.file_path ?? e.url ?? JSON.stringify(e));
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
}

app.onError((erro, c) => {
  if (erro instanceof z.ZodError) return c.json({ erro: "dados inválidos", detalhes: erro.issues }, 400);
  console.error(erro);
  return c.json({ erro: erro.message }, 500);
});
