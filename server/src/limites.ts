// Leitura e histórico dos limites da assinatura (janela de 5 h e de 7 dias).
import { executar, lerConfig, todos, um } from "./db.ts";
import { barramento } from "./eventos.ts";
import type { SnapshotUso } from "./tipos.ts";

export interface RateLimits {
  h5_pct?: number | null;
  h5_reset?: number | null;
  d7_pct?: number | null;
  d7_reset?: number | null;
}

export function registrarSnapshot(rl: RateLimits, fonte: string) {
  if (rl.h5_pct == null && rl.d7_pct == null) return;
  executar(
    "INSERT INTO uso (h5_pct, h5_reset, d7_pct, d7_reset, fonte) VALUES (?, ?, ?, ?, ?)",
    rl.h5_pct ?? null,
    rl.h5_reset ?? null,
    rl.d7_pct ?? null,
    rl.d7_reset ?? null,
    fonte,
  );
  barramento.publicar("limites", ultimoSnapshot());
}

export function ultimoSnapshot(): SnapshotUso | undefined {
  return um<SnapshotUso>("SELECT * FROM uso ORDER BY id DESC LIMIT 1");
}

export function historico(limite = 200): SnapshotUso[] {
  return todos<SnapshotUso>("SELECT * FROM uso ORDER BY id DESC LIMIT ?", limite);
}

/** Percentual da janela semanal que "deveria" estar gasto agora, numa curva linear até o reset. */
export function ritmoAlvo(agoraSeg = Date.now() / 1000): number | null {
  const s = ultimoSnapshot();
  if (!s?.d7_reset) return null;
  const inicioJanela = s.d7_reset - 7 * 24 * 3600;
  const fracao = (agoraSeg - inicioJanela) / (7 * 24 * 3600);
  return Math.max(0, Math.min(100, fracao * 100));
}

export interface AvaliacaoLimites {
  podeRodar: boolean;
  motivo: string;
  h5_pct: number | null;
  d7_pct: number | null;
  alvo: number | null;
}

/** Regra da Fase 1: respeita a janela de 5 h e evita ultrapassar o ritmo semanal alvo além de uma folga. */
export function avaliar(tipo: "pontual" | "continua"): AvaliacaoLimites {
  const s = ultimoSnapshot();
  const tetoH5 = Number(lerConfig("teto_h5_pct", "90"));
  const folgaSemanal = Number(lerConfig("folga_semanal_pct", "10"));
  const reservaPontual = Number(lerConfig("reserva_pontual_pct", "25"));
  const alvo = ritmoAlvo();
  const agora = Date.now() / 1000;

  if (!s) return { podeRodar: true, motivo: "sem leitura de limites ainda", h5_pct: null, d7_pct: null, alvo };

  const h5Valido = s.h5_reset == null || s.h5_reset > agora;
  const h5 = h5Valido ? s.h5_pct : 0;
  const d7Valido = s.d7_reset == null || s.d7_reset > agora;
  const d7 = d7Valido ? s.d7_pct : 0;

  if (h5 != null && h5 >= tetoH5) return { podeRodar: false, motivo: `janela de 5 h em ${h5.toFixed(0)}%`, h5_pct: h5, d7_pct: d7, alvo };
  if (d7 != null && d7 >= 100 - 2) return { podeRodar: false, motivo: "janela semanal esgotada", h5_pct: h5, d7_pct: d7, alvo };
  if (tipo === "continua" && d7 != null) {
    if (d7 >= 100 - reservaPontual) {
      const horasAteReset = s.d7_reset ? (s.d7_reset - agora) / 3600 : 999;
      if (horasAteReset > 24) return { podeRodar: false, motivo: `reserva para pontuais (${reservaPontual}%) preservada`, h5_pct: h5, d7_pct: d7, alvo };
    }
    if (alvo != null && d7 > alvo + folgaSemanal) return { podeRodar: false, motivo: `adiantado em relação ao ritmo (${d7.toFixed(0)}% vs alvo ${alvo.toFixed(0)}%)`, h5_pct: h5, d7_pct: d7, alvo };
  }
  return { podeRodar: true, motivo: "ok", h5_pct: h5, d7_pct: d7, alvo };
}
