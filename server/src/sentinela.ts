// Sentinela de limites: uma sessão interativa mínima do Claude Code num pseudo-terminal.
// O status line dela faz POST em /hooks/statusline com rate_limits (5 h e 7 dias).
// Quando o Claudio precisa de leitura fresca, a sentinela recebe um prompt mínimo (Haiku).
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.ts";
import { lerConfig } from "./db.ts";
import { barramento } from "./eventos.ts";
import { registrarSnapshot, ultimoSnapshot } from "./limites.ts";

type Pty = { write(d: string): void; kill(): void; onData(cb: (d: string) => void): unknown; onExit(cb: (e: { exitCode: number }) => void): unknown };

let term: Pty | null = null;
let ultimaLeituraEm = 0;
let atualizando: Promise<boolean> | null = null;
let recebeuRateLimits = false;

function arquivoSettings(): string {
  const pasta = resolve(config.raiz, "dados");
  mkdirSync(pasta, { recursive: true });
  const comando = `"${process.execPath}" "${resolve(config.raiz, "server", "statusline-post.cjs")}"`;
  const caminho = resolve(pasta, "settings-sentinela.json");
  writeFileSync(caminho, JSON.stringify({ statusLine: { type: "command", command: comando } }, null, 2));
  return caminho;
}

/** Chamado pelo endpoint /hooks/statusline. */
export function receberStatusLine(dados: any) {
  const rl = dados?.rate_limits;
  if (!rl) return;
  recebeuRateLimits = true;
  ultimaLeituraEm = Date.now();
  registrarSnapshot(
    { h5_pct: rl.five_hour?.used_percentage, h5_reset: rl.five_hour?.resets_at, d7_pct: rl.seven_day?.used_percentage, d7_reset: rl.seven_day?.resets_at },
    "sentinela",
  );
}

async function garantirSessao(): Promise<boolean> {
  if (term) return true;
  let pty: any;
  try {
    pty = await import("@lydell/node-pty");
  } catch (e) {
    console.warn("[sentinela] node-pty indisponível:", (e as Error).message);
    return false;
  }
  const bin = process.platform === "win32" && !config.claudeBin.endsWith(".exe") ? `${config.claudeBin}.exe` : config.claudeBin;
  const cwd = resolve(config.raiz, "dados", "sentinela");
  mkdirSync(cwd, { recursive: true });
  try {
    const t: Pty = pty.spawn(bin, ["--model", lerConfig("modelo_sentinela", "haiku"), "--settings", arquivoSettings()], {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd,
      env: { ...process.env, CLAUDIO_PORTA: String(config.porta) } as Record<string, string>,
    });
    t.onData(() => undefined);
    t.onExit(({ exitCode }) => {
      console.warn(`[sentinela] sessão encerrou (código ${exitCode})`);
      term = null;
    });
    term = t;
    await new Promise((ok) => setTimeout(ok, 6000));
    return true;
  } catch (e) {
    console.warn("[sentinela] falha ao abrir sessão:", (e as Error).message);
    return false;
  }
}

/** Pede uma leitura fresca dos limites. Devolve true se chegou rate_limits. */
export function atualizarLimites(motivo = "pedido"): Promise<boolean> {
  if (atualizando) return atualizando;
  atualizando = (async () => {
    try {
      if (!(await garantirSessao()) || !term) return false;
      const antes = ultimaLeituraEm;
      recebeuRateLimits = false;
      barramento.publicar("escalonador", { quando: new Date().toISOString(), texto: `lendo limites (${motivo})` });
      term.write("Responda apenas: ok\r");
      const esperar = async (ms: number) => {
        const fim = Date.now() + ms;
        while (Date.now() < fim) {
          if (ultimaLeituraEm > antes) return true;
          await new Promise((ok) => setTimeout(ok, 500));
        }
        return false;
      };
      if (await esperar(15000)) return true;
      // O status line às vezes só traz rate_limits depois de abrir o painel de uso.
      term.write("/usage\r");
      await new Promise((ok) => setTimeout(ok, 4000));
      term.write("\x1b");
      return esperar(10000);
    } finally {
      atualizando = null;
    }
  })();
  return atualizando;
}

export function idadeDaLeituraMin(): number | null {
  const s = ultimoSnapshot();
  if (!s) return null;
  return (Date.now() - new Date(s.momento.replace(" ", "T") + "Z").getTime()) / 60000;
}

/** Atualiza se a leitura estiver velha demais. */
export async function atualizarSeVelho(maxMin = Number(lerConfig("limites_max_idade_min", "30")), motivo = "leitura velha") {
  const idade = idadeDaLeituraMin();
  if (idade == null || idade > maxMin) return atualizarLimites(motivo);
  return true;
}

export function encerrarSentinela() {
  try {
    term?.write("/exit\r");
    setTimeout(() => term?.kill(), 1500);
  } catch {
    /* já fechada */
  }
  term = null;
}

export const sentinelaAtiva = () => term !== null;
export const sentinelaRecebeu = () => recebeuRateLimits;
