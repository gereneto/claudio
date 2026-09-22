// Fase 0, teste 2: hooks HTTP (SessionEnd, Stop, Notification, PermissionRequest) chegam num servidor local?
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { OUT, RAIZ, contarTipos, resumoResultado, rodarClaude } from "./lib.ts";

const PORTA = 47831;
const recebidos: { evento: string; chaves: string[]; corpo: any }[] = [];

const servidor = createServer((req, res) => {
  let corpo = "";
  req.on("data", (p) => (corpo += p));
  req.on("end", () => {
    let dados: any = {};
    try {
      dados = JSON.parse(corpo);
    } catch {
      /* corpo vazio */
    }
    recebidos.push({ evento: dados.hook_event_name ?? req.url ?? "?", chaves: Object.keys(dados), corpo: dados });
    console.log(
      `  [hook] ${req.method} ${req.url} -> ${dados.hook_event_name} ${dados.tool_name ?? ""} ${dados.notification_type ?? ""} ${dados.reason ?? ""}`,
    );
    res.setHeader("content-type", "application/json");
    if (dados.hook_event_name === "PermissionRequest") {
      res.end(JSON.stringify({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow", updatedInput: dados.tool_input } } }));
    } else {
      res.end("{}");
    }
  });
});
await new Promise<void>((ok) => servidor.listen(PORTA, "127.0.0.1", ok));

const url = (p: string) => `http://127.0.0.1:${PORTA}/hooks/${p}`;
const settings = {
  hooks: {
    SessionEnd: [{ hooks: [{ type: "http", url: url("session-end"), timeout: 30 }] }],
    Stop: [{ hooks: [{ type: "http", url: url("stop"), timeout: 30 }] }],
    Notification: [{ hooks: [{ type: "http", url: url("notification"), timeout: 30 }] }],
    PermissionRequest: [{ hooks: [{ type: "http", url: url("permission-request"), timeout: 120 }] }],
  },
};
const arquivoSettings = resolve(OUT, "02-settings.json");
writeFileSync(arquivoSettings, JSON.stringify(settings, null, 2));

const alvo = resolve(OUT, "02-ola.txt").replace(/\\/g, "/");
const exec = await rodarClaude(
  `Crie o arquivo ${alvo} com o conteúdo "ola". Não faça mais nada.`,
  ["--model", "haiku", "--max-turns", "4", "--settings", arquivoSettings],
  { cwd: RAIZ, log: resolve(OUT, "02-eventos.jsonl") },
);
servidor.close();

console.log("\n== Tipos de evento:", contarTipos(exec.eventos));
console.log("== Resultado:", JSON.stringify(resumoResultado(exec.resultado), null, 2));
console.log("\n== Hooks recebidos:");
for (const r of recebidos) console.log(`  ${r.evento}: chaves = ${r.chaves.join(", ")}`);
if (!recebidos.length) console.log("  NENHUM hook chegou");
writeFileSync(resolve(OUT, "02-hooks-recebidos.json"), JSON.stringify(recebidos, null, 2));
if (exec.stderr.trim()) console.log("== stderr:", exec.stderr.slice(0, 500));
