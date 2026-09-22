// Fase 0, teste 6 (plano B dos limites): sessão interativa num pseudo-terminal com statusLine gravando o JSON.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as pty from "@lydell/node-pty";
import { CLAUDE_BIN, OUT, RAIZ } from "./lib.ts";

const arquivoStatus = resolve(OUT, "05-statusline.jsonl");
if (existsSync(arquivoStatus)) unlinkSync(arquivoStatus);
const comando = `"${process.execPath}" "${resolve(RAIZ, "fase0", "statusline-grava.cjs")}"`;
const arquivoSettings = resolve(OUT, "06-settings.json");
writeFileSync(arquivoSettings, JSON.stringify({ statusLine: { type: "command", command: comando } }, null, 2));

const bin = CLAUDE_BIN.endsWith(".exe") || process.platform !== "win32" ? CLAUDE_BIN : `${CLAUDE_BIN}.exe`;
console.log("> pty:", bin, "--model haiku --settings", arquivoSettings);
const term = pty.spawn(bin, ["--model", "haiku", "--settings", arquivoSettings], { name: "xterm-256color", cols: 120, rows: 40, cwd: RAIZ, env: process.env as Record<string, string> });

let tela = "";
term.onData((d) => (tela += d));
const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const limpar = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");

await dormir(6000);
console.log("== Tela após 6 s (últimos 400 caracteres):", JSON.stringify(limpar(tela).slice(-400)));
term.write("Responda apenas: ok\r");
await dormir(12000);
console.log("== Tela após o prompt (últimos 400):", JSON.stringify(limpar(tela).slice(-400)));

function relatar(rotulo: string) {
  if (!existsSync(arquivoStatus)) {
    console.log(`== [${rotulo}] Status line NÃO foi chamado.`);
    return;
  }
  const linhas = readFileSync(arquivoStatus, "utf8").trim().split("\n");
  console.log(`== [${rotulo}] Status line chamado ${linhas.length} vez(es).`);
  linhas.forEach((l, i) => {
    try {
      const j = JSON.parse(l);
      console.log(`   #${i} tem rate_limits? ${"rate_limits" in j} -> ${JSON.stringify(j.rate_limits ?? null)} | custo ${j.cost?.total_cost_usd}`);
    } catch {
      console.log(`   #${i} ilegível`);
    }
  });
}
relatar("após 1º prompt");
await dormir(20000);
relatar("após 20 s parado");
term.write("Responda apenas: ok de novo\r");
await dormir(12000);
relatar("após 2º prompt");
term.write("/usage\r");
await dormir(5000);
console.log("== Tela do /usage (últimos 900):", JSON.stringify(limpar(tela).slice(-900)));
term.write("\x1b");
await dormir(1000);
term.write("/exit\r");
await dormir(2000);
term.kill();
process.exit(0);
