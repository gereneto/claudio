import { useCallback, useEffect, useState } from "react";
import { api, assinarEventos, type Estado } from "./api.ts";
import { BarraLimites } from "./componentes/BarraLimites.tsx";
import { ListaConversas, TelaConversa } from "./telas/Conversas.tsx";
import { ListaProjetos, TelaOrdem, TelaProjeto } from "./telas/Projetos.tsx";
import { TelaConfig } from "./telas/Config.tsx";
import { registrarSw } from "./push.ts";

type Rota =
  | { tela: "conversas" }
  | { tela: "conversa"; id: number }
  | { tela: "projetos" }
  | { tela: "projeto"; id: number }
  | { tela: "ordem"; id: number; projetoId: number }
  | { tela: "config" };

function lerRota(): Rota {
  const h = location.hash.replace(/^#\/?/, "").split("/");
  if (h[0] === "config") return { tela: "config" };
  if (h[0] === "conversa" && h[1]) return { tela: "conversa", id: Number(h[1]) };
  if (h[0] === "projeto" && h[1] && h[2] === "ordem" && h[3]) return { tela: "ordem", id: Number(h[3]), projetoId: Number(h[1]) };
  if (h[0] === "projeto" && h[1]) return { tela: "projeto", id: Number(h[1]) };
  if (h[0] === "projetos") return { tela: "projetos" };
  return { tela: "conversas" };
}

const ir = (hash: string) => {
  location.hash = hash;
};

export function App() {
  const [rota, setRota] = useState<Rota>(lerRota);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState("");

  const atualizar = useCallback(() => {
    api.estado().then((e) => { setEstado(e); setErro(""); }).catch((e) => setErro(`Servidor fora do ar: ${(e as Error).message}`));
    setVersao((v) => v + 1);
  }, []);

  useEffect(() => {
    const aoHash = () => setRota(lerRota());
    addEventListener("hashchange", aoHash);
    void registrarSw();
    atualizar();
    const cancelar = assinarEventos(() => atualizar());
    const timer = setInterval(atualizar, 60_000);
    return () => {
      removeEventListener("hashchange", aoHash);
      cancelar();
      clearInterval(timer);
    };
  }, [atualizar]);

  const titulo = (() => {
    switch (rota.tela) {
      case "conversas": return "Conversas";
      case "projetos": return "Projetos";
      case "conversa": return "Conversa";
      case "projeto": return "Projeto";
      case "ordem": return "Ordem";
      case "config": return "Configurações";
    }
  })();
  const voltarPara = rota.tela === "conversa" ? "#/conversas" : rota.tela === "projeto" ? "#/projetos" : rota.tela === "ordem" ? `#/projeto/${rota.projetoId}` : rota.tela === "config" ? "#/conversas" : null;
  const abaAtiva = rota.tela === "conversas" || rota.tela === "conversa" ? "conversas" : "projetos";

  return (
    <>
      <header className="topo">
        <h1>
          {voltarPara && <button className="voltar" onClick={() => ir(voltarPara)} aria-label="Voltar">‹</button>}
          <span style={{ flex: 1 }}>{titulo}</span>
          {rota.tela !== "config" && <button className="voltar" onClick={() => ir("#/config")} aria-label="Configurações" title="Configurações">⚙</button>}
        </h1>
        <BarraLimites estado={estado} aoMudar={atualizar} />
      </header>
      {erro && <div className="erro-global">{erro}</div>}
      {rota.tela === "conversas" && <ListaConversas versao={versao} abrir={(id) => ir(`#/conversa/${id}`)} />}
      {rota.tela === "conversa" && <TelaConversa id={rota.id} versao={versao} aoMudar={atualizar} />}
      {rota.tela === "projetos" && <ListaProjetos versao={versao} abrir={(id) => ir(`#/projeto/${id}`)} />}
      {rota.tela === "projeto" && (
        <TelaProjeto
          id={rota.id}
          versao={versao}
          abrirOrdem={(oid) => ir(`#/projeto/${rota.id}/ordem/${oid}`)}
          abrirConversa={async (oid) => {
            const cs = await api.conversas();
            const c = cs.find((x) => x.ordem_id === oid);
            if (c) ir(`#/conversa/${c.id}`);
            else alert("A conversa desta ordem é criada na primeira execução.");
          }}
        />
      )}
      {rota.tela === "ordem" && <TelaOrdem id={rota.id} versao={versao} voltar={() => ir(`#/projeto/${rota.projetoId}`)} />}
      {rota.tela === "config" && <TelaConfig />}
      <nav className="abas">
        <button className={abaAtiva === "conversas" ? "ativa" : ""} onClick={() => ir("#/conversas")}>
          Conversas
          {estado && estado.nao_lidas + estado.decisoes_pendentes > 0 && <span className="contador">{estado.nao_lidas + estado.decisoes_pendentes}</span>}
        </button>
        <button className={abaAtiva === "projetos" ? "ativa" : ""} onClick={() => ir("#/projetos")}>
          Projetos
        </button>
      </nav>
    </>
  );
}
