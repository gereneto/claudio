import { useEffect, useRef, useState } from "react";
import { api, type Conversa, type Decisao, type Mensagem, type Ordem } from "../api.ts";

function horaCurta(iso: string) {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ListaConversas({ versao, abrir }: { versao: number; abrir: (id: number) => void }) {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState("");

  useEffect(() => {
    api.conversas(soNaoLidas).then(setConversas).catch(() => undefined);
  }, [versao, soNaoLidas]);

  const grupos = new Map<string, Conversa[]>();
  for (const c of conversas) {
    const chave = c.ordem_id ? `Projeto · ${c.projeto_nome ?? "?"}` : (c.pasta_nome ?? "Sem pasta");
    grupos.set(chave, [...(grupos.get(chave) ?? []), c]);
  }

  return (
    <div className="conteudo">
      <div className="filtro">
        <button className={soNaoLidas ? "" : "ativo"} onClick={() => setSoNaoLidas(false)}>Todas</button>
        <button className={soNaoLidas ? "ativo" : ""} onClick={() => setSoNaoLidas(true)}>Não lidas</button>
      </div>
      <form
        className="linha-botoes"
        style={{ marginBottom: 12 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!novoTitulo.trim()) return;
          const c = await api.criarConversa(novoTitulo.trim());
          setNovoTitulo("");
          abrir(c.id);
        }}
      >
        <input placeholder="Nova conversa solta…" value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} style={{ flex: 1 }} />
        <button className="botao pequeno">Criar</button>
      </form>
      {conversas.length === 0 && <div className="vazio">Nenhuma conversa{soNaoLidas ? " não lida" : ""}.</div>}
      {[...grupos.entries()].map(([nome, lista]) => (
        <div key={nome}>
          <div className="grupo-titulo">{nome}</div>
          <div className="lista">
            {lista.map((c) => (
              <div key={c.id} className="cartao clicavel" onClick={() => abrir(c.id)}>
                {c.lida ? <span style={{ width: 9 }} /> : <span className="ponto" />}
                <div className="corpo">
                  <div className="titulo">{c.titulo}</div>
                  <div className="sub">{c.ultima ?? "sem mensagens"}</div>
                </div>
                <span className="etiqueta">{horaCurta(c.atualizado_em)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface PerguntaClaude {
  question: string;
  header?: string;
  options: { label: string; description?: string }[];
  multiSelect?: boolean;
}

function CartaoDecisao({ d, aoResponder }: { d: Decisao; aoResponder: () => void }) {
  const p = JSON.parse(d.payload) as { pergunta?: string; opcoes?: string[]; tool_name?: string; tool_input?: unknown; questions?: PerguntaClaude[] };
  const [livre, setLivre] = useState("");
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const responder = async (r: string) => {
    await api.responderDecisao(d.id, r);
    aoResponder();
  };
  if (p.questions?.length) {
    const completas = p.questions.every((q) => respostas[q.question]);
    return (
      <div className="decisao">
        {p.questions.map((q) => (
          <div key={q.question} style={{ marginBottom: 10 }}>
            <h3>{q.question}</h3>
            <div className="linha-botoes" style={{ marginTop: 4 }}>
              {q.options.map((o) => (
                <button
                  key={o.label}
                  className={`botao secundario pequeno`}
                  style={respostas[q.question] === o.label ? { borderColor: "var(--destaque)", background: "var(--destaque-fraco)" } : undefined}
                  title={o.description}
                  onClick={() => setRespostas({ ...respostas, [q.question]: o.label })}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <input
              placeholder="Ou escreva sua resposta…"
              style={{ marginTop: 6 }}
              value={q.options.some((o) => o.label === respostas[q.question]) ? "" : (respostas[q.question] ?? "")}
              onChange={(e) => setRespostas({ ...respostas, [q.question]: e.target.value })}
            />
          </div>
        ))}
        <div className="linha-botoes">
          <button className="botao" disabled={!completas} onClick={() => responder(JSON.stringify(respostas))}>Responder</button>
        </div>
      </div>
    );
  }
  if (d.tipo === "permissao") {
    return (
      <div className="decisao">
        <h3>Permissão: {p.tool_name}</h3>
        <pre>{typeof p.tool_input === "string" ? p.tool_input : JSON.stringify(p.tool_input, null, 1)}</pre>
        <div className="linha-botoes">
          <button className="botao" onClick={() => responder("allow")}>Permitir</button>
          <button className="botao perigo" onClick={() => responder("negado pelo usuário")}>Negar</button>
        </div>
      </div>
    );
  }
  return (
    <div className="decisao">
      <h3>{p.pergunta ?? "Decisão"}</h3>
      <div className="linha-botoes">
        {(p.opcoes ?? []).map((o) => (
          <button key={o} className="botao secundario" onClick={() => responder(o)}>{o}</button>
        ))}
      </div>
      <div className="linha-botoes">
        <input placeholder="Outra resposta…" value={livre} onChange={(e) => setLivre(e.target.value)} style={{ flex: 1 }} />
        <button className="botao pequeno" disabled={!livre.trim()} onClick={() => responder(livre.trim())}>Enviar</button>
      </div>
    </div>
  );
}

export function TelaConversa({ id, versao, aoMudar }: { id: number; versao: number; aoMudar: () => void }) {
  const [dados, setDados] = useState<{ conversa: Conversa; mensagens: Mensagem[]; decisoes: Decisao[]; ordem: Ordem | null } | null>(null);
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  const carregar = () => api.conversa(id).then(setDados).catch(() => undefined);
  useEffect(() => {
    carregar();
  }, [id, versao]);
  useEffect(() => {
    if (dados && !dados.conversa.lida) api.marcarLida(id).then(aoMudar);
    fim.current?.scrollIntoView({ block: "end" });
  }, [dados?.mensagens.length]);

  if (!dados) return <div className="vazio">Carregando…</div>;
  const enviar = async () => {
    if (!texto.trim()) return;
    await api.enviarMensagem(id, texto.trim());
    setTexto("");
    carregar();
  };
  return (
    <div className="conteudo com-compor">
      {dados.ordem && (
        <div className="sub multi" style={{ marginBottom: 8 }}>
          Ordem #{dados.ordem.id} · {dados.ordem.tipo} · {dados.ordem.estado}
          {dados.ordem.progresso_total ? ` · ${dados.ordem.progresso_feito}/${dados.ordem.progresso_total} ${dados.ordem.unidade ?? ""}` : ""}
        </div>
      )}
      <div className="mensagens">
        {dados.mensagens.map((m) => (
          <div key={m.id} className={`msg ${m.papel}`}>
            {m.texto}
            <span className="quando">{horaCurta(m.criado_em)}</span>
          </div>
        ))}
        {dados.decisoes.map((d) => (
          <CartaoDecisao key={d.id} d={d} aoResponder={carregar} />
        ))}
        <div ref={fim} />
      </div>
      <div className="compor">
        <textarea
          placeholder={dados.ordem ? "Instrução adicional para a ordem…" : "Mensagem…"}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
        />
        <button className="botao" onClick={enviar}>Enviar</button>
      </div>
    </div>
  );
}
