// Fase 0, teste 5: o status line roda em modo headless e entrega rate_limits?
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { OUT, RAIZ, contarTipos, procurarChave, resumoResultado, rodarClaude } from "./lib.ts";

const arquivoStatus = resolve(OUT, "05-statusline.jsonl");
if (existsSync(arquivoStatus)) unlinkSync(arquivoStatus);

const comando = `"${process.execPath}" "${resolve(RAIZ, "fase0", "statusline-grava.cjs")}"`;
const settings = { statusLine: { type: "command", command: comando } };
const arquivoSettings = resolve(OUT, "05-settings.json");
writeFileSync(arquivoSettings, JSON.stringify(settings, null, 2));

const exec = await rodarClaude("Responda apenas: ok", ["--model", "haiku", "--max-turns", "1", "--settings", arquivoSettings], {
  log: resolve(OUT, "05-eventos.jsonl"),
});
console.log("== Tipos de evento:", contarTipos(exec.eventos));
console.log("== Resultado:", JSON.stringify(resumoResultado(exec.resultado), null, 2));
const achados = exec.eventos.flatMap((e) => procurarChave(e, "rate_limits"));
console.log("== rate_limits no stream:", achados.length ? achados : "não");

if (existsSync(arquivoStatus)) {
  const linhas = readFileSync(arquivoStatus, "utf8").trim().split("\n");
  console.log(`== Status line chamado ${linhas.length} vez(es).`);
  for (const l of linhas) {
    try {
      const j = JSON.parse(l);
      console.log("   chaves:", Object.keys(j).join(", "));
      console.log("   rate_limits:", JSON.stringify(j.rate_limits ?? null));
    } catch {
      console.log("   linha ilegível:", l.slice(0, 200));
    }
  }
} else {
  console.log("== Status line NÃO foi chamado em modo headless.");
}
