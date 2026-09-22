import { useEffect, useState } from "react";
import { api, type Execucao, type Ordem, type Projeto } from "../api.ts";

const NOMES_ESTADO: Record<Ordem["estado"], string> = {
  fila: "na fila",
  rodando: "rodando",
  aguardando_decisao: "aguardando você",
  pausada: "pausada",
  concluida: "concluída",
  erro: "erro",
};

export function ListaProjetos({ versao, abrir }: { versao: number; abrir: (id: number) => void }) {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [importando, setImportando] = useState(false);
  useEffect(() => {
    api.projetos().then(setProjetos).catch(() => undefined);
  }, [versao]);
  return (
    <div className="conteudo">
      <div className="linha-botoes" style={{ marginBottom: 12, marginTop: 0 }}>
        <button
          className="botao secundario pequeno"
          disabled={importando}
          onClick={async () => {
            setImportando(true);
            try {
              await api.importarProjetos();
              setProjetos(await api.projetos());
            } finally {
              setImportando(false);
            }
          }}
        >
          {importando ? "Importando…" : "Importar do GitHub"}
        </button>
      </div>
      {projetos.length === 0 && <div className="vazio">Nenhum projeto ainda. Importe do GitHub.</div>}
      <div className="lista">
        {projetos.map((p) => (
          <div key={p.id} className="cartao clicavel" onClick={() => abrir(p.id)}>
            <div className="corpo">
              <div className="titulo">{p.nome}</div>
              <div className="sub">
                {p.ordens_ligadas} ligada{p.ordens_ligadas === 1 ? "" : "s"} de {p.ordens_total} · {p.caminho ? "clone local" : "sem clone"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Interruptor({ ligado, aoMudar }: { ligado: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <button
      className={`interruptor ${ligado ? "ligado" : ""}`}
      aria-label={ligado ? "Desligar" : "Ligar"}
      onClick={(e) => {
        e.stopPropagation();
        aoMudar(!ligado);
      }}
    />
  );
}

export function TelaProjeto({ id, versao, abrirOrdem, abrirConversa }: { id: number; versao: number; abrirOrdem: (id: number) => void; abrirConversa: (ordemId: number) => void }) {
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [ordens, setOrdens] = useState<Ordem[]>([]);
  const [novaAberta, setNovaAberta] = useState(false);
  const [form, setForm] = useState({ titulo: "", prompt: "", tipo: "pontual" as Ordem["tipo"], prioridade: 5, unidade: "", progresso_total: "", criterio_fim: "" });
  const [erro, setErro] = useState("");

  const carregar = () => {
    api.projetos(true).then((ps) => setProjeto(ps.find((p) => p.id === id) ?? null));
    api.ordens(id).then(setOrdens);
  };
  useEffect(carregar, [id, versao]);

  const alternar = async (o: Ordem, ligada: boolean) => {
    setOrdens((os) => os.map((x) => (x.id === o.id ? { ...x, ligada: ligada ? 1 : 0 } : x)));
    await api.editarOrdem(o.id, { ligada: ligada ? 1 : 0 });
    carregar();
  };

  if (!projeto) return <div className="vazio">Carregando…</div>;
  return (
    <div className="conteudo">
      <div className="sub multi" style={{ marginBottom: 10 }}>
        {projeto.repo ? <a href={projeto.repo} target="_blank" rel="noreferrer">{projeto.repo.replace("https://github.com/", "")}</a> : "sem repositório"}
        <br />
        {projeto.caminho ?? "sem clone local (será clonado na primeira ordem)"}
      </div>
      <div className="linha-botoes" style={{ marginTop: 0, marginBottom: 12 }}>
        <button className="botao pequeno" onClick={() => setNovaAberta((v) => !v)}>{novaAberta ? "Cancelar" : "Nova ordem"}</button>
      </div>
      {novaAberta && (
        <form
          className="cartao"
          style={{ display: "block", marginBottom: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setErro("");
            try {
              await api.criarOrdem({
                projeto_id: id,
                titulo: form.titulo,
                prompt: form.prompt,
                tipo: form.tipo,
                prioridade: Number(form.prioridade),
                unidade: form.unidade || null,
                progresso_total: form.progresso_total ? Number(form.progresso_total) : null,
                criterio_fim: form.criterio_fim || null,
              });
              setForm({ titulo: "", prompt: "", tipo: "pontual", prioridade: 5, unidade: "", progresso_total: "", criterio_fim: "" });
              setNovaAberta(false);
              carregar();
            } catch (err) {
              setErro((err as Error).message);
            }
          }}
        >
          <label>Título</label>
          <input required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          <label>Ordem (o que o Claude deve fazer)</label>
          <textarea required value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
          <label>Tipo</label>
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Ordem["tipo"] })}>
            <option value="pontual">Pontual (roda uma vez)</option>
            <option value="continua">Contínua (por partes, ao longo dos dias)</option>
          </select>
          <label>Prioridade (1 = mais urgente, 9 = menos)</label>
          <input type="number" min={1} max={9} value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: Number(e.target.value) })} />
          {form.tipo === "continua" && (
            <>
              <label>Unidade de trabalho por execução (ex.: 1 capítulo, 20 cards)</label>
              <input value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />
              <label>Total de unidades (se souber)</label>
              <input type="number" value={form.progresso_total} onChange={(e) => setForm({ ...form, progresso_total: e.target.value })} />
              <label>Critério de fim</label>
              <input value={form.criterio_fim} onChange={(e) => setForm({ ...form, criterio_fim: e.target.value })} />
            </>
          )}
          {erro && <div style={{ color: "var(--erro)", marginTop: 8 }}>{erro}</div>}
          <div className="linha-botoes">
            <button className="botao">Criar (desligada)</button>
          </div>
        </form>
      )}
      {ordens.length === 0 && <div className="vazio">Nenhuma ordem neste projeto.</div>}
      <div className="lista">
        {ordens.map((o) => (
          <div key={o.id} className="cartao clicavel" onClick={() => abrirOrdem(o.id)}>
            <div className="corpo">
              <div className="titulo">
                {o.titulo}
                {o.tipo === "continua" && <span className="etiqueta continua">contínua</span>}
              </div>
              <div className="sub">
                <span className={`etiqueta ${o.estado}`}>{NOMES_ESTADO[o.estado]}</span> · prioridade {o.prioridade}
                {o.tipo === "continua" && o.progresso_total ? ` · ${o.progresso_feito}/${o.progresso_total}` : ""}
              </div>
              {o.tipo === "continua" && o.progresso_total ? (
                <div className="progresso"><i style={{ width: `${Math.min(100, (100 * o.progresso_feito) / o.progresso_total)}%` }} /></div>
              ) : null}
            </div>
            <button className="botao secundario pequeno" onClick={(e) => { e.stopPropagation(); abrirConversa(o.id); }}>Conversa</button>
            <Interruptor ligado={!!o.ligada} aoMudar={(v) => alternar(o, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TelaOrdem({ id, versao, voltar }: { id: number; versao: number; voltar: () => void }) {
  const [ordem, setOrdem] = useState<Ordem | null>(null);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const carregar = () => {
    api.ordens().then((os) => setOrdem(os.find((o) => o.id === id) ?? null));
    api.execucoes(id).then(setExecucoes);
  };
  useEffect(carregar, [id, versao]);
  if (!ordem) return <div className="vazio">Carregando…</div>;
  return (
    <div className="conteudo">
      <div className="sub multi" style={{ marginBottom: 8 }}>
        <span className={`etiqueta ${ordem.estado}`}>{NOMES_ESTADO[ordem.estado]}</span> · {ordem.tipo} · prioridade {ordem.prioridade} · {ordem.ligada ? "ligada" : "desligada"}
      </div>
      <div className="detalhe-prompt">{ordem.prompt}</div>
      <div className="linha-botoes">
        <button className="botao pequeno" onClick={async () => { await api.editarOrdem(id, { ligada: ordem.ligada ? 0 : 1 }); carregar(); }}>{ordem.ligada ? "Desligar" : "Ligar"}</button>
        <button className="botao secundario pequeno" onClick={async () => { await api.rodarOrdem(id); carregar(); }}>Rodar agora</button>
        <button
          className="botao perigo pequeno"
          onClick={async () => {
            if (!confirm("Apagar esta ordem e seu histórico?")) return;
            await api.apagarOrdem(id);
            voltar();
          }}
        >
          Apagar
        </button>
      </div>
      <div className="grupo-titulo">Execuções</div>
      {execucoes.length === 0 && <div className="sub">Nenhuma execução ainda.</div>}
      {execucoes.map((e) => (
        <div key={e.id} className={`execucao ${e.resultado ?? ""}`}>
          <div className="meta">
            #{e.id} · {e.modelo} · {e.inicio}{e.fim ? ` → ${e.fim}` : " (em andamento)"} · {e.resultado ?? "…"} · {e.tokens_in + e.tokens_cache} in / {e.tokens_out} out · ${e.custo_usd.toFixed(2)}
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{e.resumo ?? e.erro ?? ""}</div>
        </div>
      ))}
    </div>
  );
}
