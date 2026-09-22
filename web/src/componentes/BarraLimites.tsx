import { useState } from "react";
import type { Estado } from "../api.ts";
import { api } from "../api.ts";

function quandoReseta(epoch: number | null | undefined): string {
  if (!epoch) return "";
  const ms = epoch * 1000 - Date.now();
  if (ms <= 0) return "reiniciou";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `reinicia em ${Math.floor(h / 24)}d ${h % 24}h`;
  return `reinicia em ${h}h ${m}min`;
}

function Medidor({ nome, pct, reset, alvo }: { nome: string; pct: number | null | undefined; pct2?: never; reset?: number | null; alvo?: number | null }) {
  const valor = pct ?? null;
  const classe = valor == null ? "" : valor >= 95 ? "cheio" : valor >= 80 ? "alto" : "";
  return (
    <div className="medidor">
      <div>
        {nome}: <strong>{valor == null ? "sem leitura" : `${valor.toFixed(0)}%`}</strong>
        {reset ? ` · ${quandoReseta(reset)}` : ""}
      </div>
      <div className="barra">
        <i className={classe} style={{ width: `${Math.min(100, valor ?? 0)}%` }} />
        {alvo != null && <b style={{ left: `${Math.min(100, alvo)}%` }} title={`ritmo alvo ${alvo.toFixed(0)}%`} />}
      </div>
    </div>
  );
}

export function BarraLimites({ estado, aoMudar }: { estado: Estado | null; aoMudar: () => void }) {
  const [lendo, setLendo] = useState(false);
  if (!estado) return null;
  const l = estado.limites;
  const pausado = estado.escalonador.pausado;
  return (
    <>
      <div className="medidores">
        <Medidor nome="5 horas" pct={l?.h5_pct} reset={l?.h5_reset} />
        <Medidor nome="Semana" pct={l?.d7_pct} reset={l?.d7_reset} alvo={estado.ritmo_alvo} />
      </div>
      <div className="aviso-escalonador">
        <span>
          {pausado ? "Escalonador pausado" : estado.escalonador.ultima.texto}
          {estado.rodando.length ? ` · rodando #${estado.rodando.join(", #")}` : ""}
        </span>
        <button
          disabled={lendo}
          title="Ler os limites agora"
          onClick={async () => {
            setLendo(true);
            try {
              await api.atualizarLimites();
            } finally {
              setLendo(false);
              aoMudar();
            }
          }}
        >
          {lendo ? "Lendo…" : "Ler limites"}
        </button>
        <button
          onClick={async () => {
            await (pausado ? api.retomar() : api.pausar());
            aoMudar();
          }}
        >
          {pausado ? "Retomar" : "Pausar"}
        </button>
      </div>
    </>
  );
}
