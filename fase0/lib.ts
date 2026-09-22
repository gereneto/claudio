// Utilitários da Fase 0: rodar o Claude Code em modo headless e inspecionar o stream.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const RAIZ = resolve(import.meta.dirname, "..");
export const OUT = resolve(RAIZ, "fase0", "out");
mkdirSync(OUT, { recursive: true });

export const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";

export type Evento = Record<string, any>;

export interface Execucao {
  eventos: Evento[];
  resultado: Evento | undefined;
  codigoSaida: number | null;
  stderr: string;
}

/** Roda `claude -p` com stream-json e devolve todos os eventos. */
export function rodarClaude(prompt: string, args: string[], opcoes: { cwd?: string; log?: string } = {}): Promise<Execucao> {
  const cwd = opcoes.cwd ?? RAIZ;
  const argv = ["-p", prompt, "--output-format", "stream-json", "--verbose", ...args];
  console.log(`> ${CLAUDE_BIN} ${argv.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}`);
  return new Promise((resolver) => {
    const filho = spawn(CLAUDE_BIN, argv, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const eventos: Evento[] = [];
    let resto = "";
    let stderr = "";
    filho.stdout.setEncoding("utf8");
    filho.stdout.on("data", (pedaco: string) => {
      resto += pedaco;
      const linhas = resto.split("\n");
      resto = linhas.pop() ?? "";
      for (const linha of linhas) {
        if (!linha.trim()) continue;
        try {
          eventos.push(JSON.parse(linha));
        } catch {
          console.log("[linha não-JSON]", linha.slice(0, 200));
        }
      }
    });
    filho.stderr.setEncoding("utf8");
    filho.stderr.on("data", (p: string) => {
      stderr += p;
    });
    filho.on("error", (erro) => {
      stderr += `\n[spawn] ${erro.message}`;
    });
    filho.on("close", (codigo) => {
      if (resto.trim()) {
        try {
          eventos.push(JSON.parse(resto));
        } catch {
          /* ignora */
        }
      }
      if (opcoes.log) {
        mkdirSync(dirname(opcoes.log), { recursive: true });
        writeFileSync(opcoes.log, eventos.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
      }
      resolver({ eventos, resultado: eventos.find((e) => e.type === "result"), codigoSaida: codigo, stderr });
    });
  });
}

/** Procura recursivamente qualquer chave com o nome dado e devolve os caminhos onde aparece. */
export function procurarChave(obj: unknown, chave: string, caminho = "", achados: string[] = []): string[] {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const c = caminho ? `${caminho}.${k}` : k;
      if (k === chave) achados.push(c);
      procurarChave(v, chave, c, achados);
    }
  }
  return achados;
}

export function resumoResultado(r: Evento | undefined) {
  if (!r) return { aviso: "sem evento result" };
  return {
    is_error: r.is_error,
    subtype: r.subtype,
    terminal_reason: r.terminal_reason,
    session_id: r.session_id,
    num_turns: r.num_turns,
    duration_ms: r.duration_ms,
    total_cost_usd: r.total_cost_usd,
    usage: r.usage && {
      in: r.usage.input_tokens,
      out: r.usage.output_tokens,
      cache_read: r.usage.cache_read_input_tokens,
      cache_create: r.usage.cache_creation_input_tokens,
    },
    modelUsage: r.modelUsage,
    permission_denials: r.permission_denials,
    resultado: typeof r.result === "string" ? r.result.slice(0, 300) : r.result,
    structured_output: r.structured_output,
  };
}

export function contarTipos(eventos: Evento[]) {
  const contagem: Record<string, number> = {};
  for (const e of eventos) {
    const chave = e.subtype ? `${e.type}/${e.subtype}` : e.type;
    contagem[chave] = (contagem[chave] ?? 0) + 1;
  }
  return contagem;
}
