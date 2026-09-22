// Primitiva para rodar o Claude Code em modo headless e acompanhar o stream-json.
import { spawn, type ChildProcess } from "node:child_process";
import { config } from "./config.ts";

export type Evento = Record<string, any>;

export interface OpcoesClaude {
  cwd: string;
  modelo?: string;
  effort?: string;
  maxTurns?: number;
  permissionMode?: "auto" | "acceptEdits" | "dontAsk" | "plan" | "default";
  resume?: string;
  appendSystemPrompt?: string;
  settingsArquivo?: string;
  addDirs?: string[];
  jsonSchema?: string;
  extra?: string[];
  env?: Record<string, string>;
  aoEvento?: (e: Evento) => void;
  sinal?: AbortSignal;
}

export interface ResultadoClaude {
  eventos: Evento[];
  resultado: Evento | undefined;
  codigoSaida: number | null;
  stderr: string;
}

export function montarArgs(prompt: string, o: OpcoesClaude): string[] {
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose"];
  if (o.modelo) args.push("--model", o.modelo);
  if (o.effort) args.push("--effort", o.effort);
  if (o.maxTurns) args.push("--max-turns", String(o.maxTurns));
  if (o.permissionMode) args.push("--permission-mode", o.permissionMode);
  if (o.resume) args.push("--resume", o.resume);
  if (o.appendSystemPrompt) args.push("--append-system-prompt", o.appendSystemPrompt);
  if (o.settingsArquivo) args.push("--settings", o.settingsArquivo);
  if (o.addDirs?.length) args.push("--add-dir", ...o.addDirs);
  if (o.jsonSchema) args.push("--json-schema", o.jsonSchema);
  if (o.extra) args.push(...o.extra);
  return args;
}

export function rodarClaude(prompt: string, o: OpcoesClaude): { promessa: Promise<ResultadoClaude>; processo: ChildProcess } {
  const args = montarArgs(prompt, o);
  const processo = spawn(config.claudeBin, args, {
    cwd: o.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, ...(o.env ?? {}) },
  });
  const eventos: Evento[] = [];
  let resto = "";
  let stderr = "";

  const promessa = new Promise<ResultadoClaude>((resolver) => {
    processo.stdout!.setEncoding("utf8");
    processo.stdout!.on("data", (pedaco: string) => {
      resto += pedaco;
      const linhas = resto.split("\n");
      resto = linhas.pop() ?? "";
      for (const linha of linhas) {
        if (!linha.trim()) continue;
        try {
          const e = JSON.parse(linha);
          eventos.push(e);
          o.aoEvento?.(e);
        } catch {
          /* linha fora do protocolo */
        }
      }
    });
    processo.stderr!.setEncoding("utf8");
    processo.stderr!.on("data", (p: string) => {
      stderr += p;
    });
    processo.on("error", (erro) => {
      stderr += `\n[spawn] ${erro.message}`;
    });
    processo.on("close", (codigo) => {
      if (resto.trim()) {
        try {
          const e = JSON.parse(resto);
          eventos.push(e);
          o.aoEvento?.(e);
        } catch {
          /* ignora */
        }
      }
      resolver({ eventos, resultado: eventos.find((e) => e.type === "result"), codigoSaida: codigo, stderr });
    });
    o.sinal?.addEventListener("abort", () => processo.kill("SIGINT"), { once: true });
  });

  return { promessa, processo };
}

/** Extrai texto dos blocos de conteúdo de um evento assistant. */
export function textoDoEvento(e: Evento): string {
  const blocos = e?.message?.content;
  if (!Array.isArray(blocos)) return "";
  return blocos
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
}

/** Procura rate_limits em qualquer lugar de um evento (formato do status line). */
export function extrairRateLimits(e: Evento): { h5_pct?: number; h5_reset?: number; d7_pct?: number; d7_reset?: number } | null {
  const rl = acharChave(e, "rate_limits");
  if (!rl || typeof rl !== "object") return null;
  const r = rl as any;
  return {
    h5_pct: r.five_hour?.used_percentage,
    h5_reset: r.five_hour?.resets_at,
    d7_pct: r.seven_day?.used_percentage,
    d7_reset: r.seven_day?.resets_at,
  };
}

function acharChave(obj: unknown, chave: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === chave) return v;
    const achado = acharChave(v, chave);
    if (achado !== undefined) return achado;
  }
  return undefined;
}
