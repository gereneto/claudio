// Roda os testes da Fase 0 em sequência, num processo que o app desktop inicia (e que herda o login).
// Sobe um servidor HTTP só para o relatório ficar acessível e o preview não reclamar.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { OUT, RAIZ } from "./lib.ts";

const PORTA = 47900;
const daLinha = process.argv.slice(2).filter((a) => a.endsWith(".ts"));
const testes = daLinha.length ? daLinha : (process.env.FASE0_TESTES?.split(",").map((s) => s.trim()).filter(Boolean) ?? ["01-headless.ts", "05-statusline.ts", "02-hooks.ts", "03-permissao.ts", "04-decisao.ts"]);
let relatorio = `Fase 0 — ${new Date().toISOString()}\n`;
const tsxCli = resolve(RAIZ, "node_modules", "tsx", "dist", "cli.mjs");

createServer((_req, res) => {
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(relatorio);
}).listen(PORTA, "127.0.0.1", () => console.log(`Relatório em http://127.0.0.1:${PORTA}`));

function rodar(script: string): Promise<string> {
  return new Promise((ok) => {
    const filho = spawn(process.execPath, [tsxCli, resolve(RAIZ, "fase0", script)], { cwd: RAIZ, windowsHide: true });
    let saida = "";
    filho.stdout.on("data", (p) => (saida += p));
    filho.stderr.on("data", (p) => (saida += p));
    filho.on("close", (codigo) => ok(saida + `\n[saída ${codigo}]\n`));
  });
}

for (const t of testes) {
  console.log(`\n######## ${t}`);
  const saida = await rodar(t);
  console.log(saida);
  relatorio += `\n######## ${t}\n${saida}`;
  writeFileSync(resolve(OUT, "relatorio.txt"), relatorio);
}
console.log("\n######## FIM DA FASE 0");
relatorio += "\n######## FIM DA FASE 0\n";
writeFileSync(resolve(OUT, "relatorio.txt"), relatorio);
