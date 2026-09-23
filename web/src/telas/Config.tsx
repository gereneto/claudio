import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { desligarPush, estadoPush, ligarPush, type EstadoPush } from "../push.ts";

const DESCRICOES: Record<string, string> = {
  modelo_executor: "Modelo que executa as ordens (sonnet, opus, haiku, fable)",
  modelo_chat: "Modelo das conversas soltas",
  modelo_sentinela: "Modelo da sessão que lê os limites (deixe haiku)",
  teto_h5_pct: "Não iniciar execuções acima deste % da janela de 5 h",
  folga_semanal_pct: "Pontos acima do ritmo semanal que as contínuas podem avançar",
  reserva_pontual_pct: "% da semana reservado para ordens pontuais",
  intervalo_continua_min: "Minutos entre blocos de uma mesma ordem contínua",
  max_paralelas: "Execuções ao mesmo tempo",
  max_turns_pontual: "Limite de turnos por execução pontual",
  max_turns_continua: "Limite de turnos por bloco de ordem contínua",
  timeout_permissao_seg: "Segundos esperando você responder uma permissão",
  limites_max_idade_min: "Idade máxima (min) da leitura de limites antes de reler",
  ferramentas_permitidas: "Ferramentas pré-aprovadas (separadas por vírgula)",
};

const TEXTO_PUSH: Record<EstadoPush, string> = {
  indisponivel: "Este navegador não suporta notificações push.",
  sem_https: "Notificações exigem HTTPS (ou localhost). Pela Tailscale, use o endereço https.",
  negado: "Permissão negada no navegador. Libere nas configurações do site.",
  desligado: "Desligadas neste aparelho.",
  ligado: "Ligadas neste aparelho.",
};

export function TelaConfig() {
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [salvo, setSalvo] = useState("");
  const [push, setPush] = useState<EstadoPush>("desligado");
  const [aparelhos, setAparelhos] = useState<{ id: number; aparelho: string | null; criado_em: string; ultimo_envio: string | null }[]>([]);
  const [msg, setMsg] = useState("");

  const carregar = () => {
    api.config().then(setCfg);
    api.pushAssinaturas().then(setAparelhos).catch(() => setAparelhos([]));
    estadoPush().then(setPush);
  };
  useEffect(carregar, []);

  return (
    <div className="conteudo">
      <div className="grupo-titulo">Notificações neste aparelho</div>
      <div className="cartao" style={{ display: "block" }}>
        <div className="sub multi">{TEXTO_PUSH[push]}</div>
        <div className="linha-botoes">
          {push === "ligado" ? (
            <button className="botao secundario pequeno" onClick={async () => { setPush(await desligarPush()); carregar(); }}>Desligar</button>
          ) : (
            <button className="botao pequeno" disabled={push === "indisponivel" || push === "sem_https"} onClick={async () => { try { setPush(await ligarPush()); } catch (e) { setMsg((e as Error).message); } carregar(); }}>Ligar notificações</button>
          )}
          <button className="botao secundario pequeno" onClick={async () => { const r = await api.pushTeste(); setMsg(`Teste enviado a ${r.enviadas} aparelho(s)${r.removidas ? `, ${r.removidas} removido(s)` : ""}.`); }}>Enviar teste</button>
        </div>
        {msg && <div className="sub multi" style={{ marginTop: 6 }}>{msg}</div>}
        {aparelhos.length > 0 && (
          <div className="sub multi" style={{ marginTop: 8 }}>
            Aparelhos assinados: {aparelhos.map((a) => `#${a.id} ${(a.aparelho ?? "?").slice(0, 40)}…`).join(" · ")}
          </div>
        )}
      </div>

      <div className="grupo-titulo">Configurações</div>
      <div className="cartao" style={{ display: "block" }}>
        {Object.keys(DESCRICOES).map((k) => (
          <div key={k}>
            <label>{DESCRICOES[k]} <code style={{ opacity: 0.6 }}>({k})</code></label>
            <input value={cfg[k] ?? ""} placeholder="padrão" onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} />
          </div>
        ))}
        <div className="linha-botoes">
          <button className="botao" onClick={async () => { await api.salvarConfig(cfg); setSalvo("Salvo."); setTimeout(() => setSalvo(""), 2000); }}>Salvar</button>
          {salvo && <span className="sub">{salvo}</span>}
        </div>
      </div>
    </div>
  );
}
