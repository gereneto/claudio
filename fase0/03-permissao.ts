// Fase 0, teste 3: --permission-prompt-tool com um MCP nosso recebe permissões E o AskUserQuestion?
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { OUT, RAIZ, contarTipos, resumoResultado, rodarClaude } from "./lib.ts";

const log = resolve(OUT, "03-mcp.log");
if (existsSync(log)) unlinkSync(log);
const arquivoCor = resolve(OUT, "03-cor.txt");
if (existsSync(arquivoCor)) unlinkSync(arquivoCor);

const tsxCli = resolve(RAIZ, "node_modules", "tsx", "dist", "cli.mjs");
const mcpConfig = {
  mcpServers: { claudio: { command: process.execPath, args: [tsxCli, resolve(RAIZ, "fase0", "mcp-permissao.ts")] } },
};
const arquivoMcp = resolve(OUT, "03-mcp.json");
writeFileSync(arquivoMcp, JSON.stringify(mcpConfig, null, 2));

const alvo = arquivoCor.replace(/\\/g, "/");
const exec = await rodarClaude(
  `Antes de qualquer coisa, use a ferramenta AskUserQuestion para me perguntar se prefiro a cor azul ou vermelha. Depois crie o arquivo ${alvo} contendo só a cor escolhida. Não faça mais nada.`,
  ["--model", "haiku", "--max-turns", "6", "--permission-prompt-tool", "mcp__claudio__aprovar", "--mcp-config", arquivoMcp],
  { cwd: RAIZ, log: resolve(OUT, "03-eventos.jsonl") },
);

console.log("\n== Tipos de evento:", contarTipos(exec.eventos));
console.log("== Resultado:", JSON.stringify(resumoResultado(exec.resultado), null, 2));
const init = exec.eventos.find((e) => e.type === "system" && e.subtype === "init");
if (init) console.log("== MCP no init:", JSON.stringify(init.mcp_servers), "erros:", JSON.stringify(init.mcp_server_errors ?? null));
console.log("\n== Pedidos que chegaram ao MCP:");
console.log(existsSync(log) ? readFileSync(log, "utf8") : "  NENHUM (log vazio)");
console.log("== Arquivo criado:", existsSync(arquivoCor) ? readFileSync(arquivoCor, "utf8").trim() : "não");
if (exec.stderr.trim()) console.log("== stderr:", exec.stderr.slice(0, 800));
