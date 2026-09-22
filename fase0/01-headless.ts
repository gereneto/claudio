// Fase 0, teste 1: o headless funciona com a assinatura? O stream traz rate_limits?
import { resolve } from "node:path";
import { OUT, contarTipos, procurarChave, resumoResultado, rodarClaude } from "./lib.ts";

const exec = await rodarClaude("Responda apenas: ok", ["--model", "haiku", "--max-turns", "1"], {
  log: resolve(OUT, "01-eventos.jsonl"),
});

console.log("\n== Tipos de evento:", contarTipos(exec.eventos));
console.log("== Resultado:", JSON.stringify(resumoResultado(exec.resultado), null, 2));

const achados = exec.eventos.flatMap((e, i) =>
  procurarChave(e, "rate_limits").map((c) => `evento[${i}] (${e.type}/${e.subtype ?? ""}): ${c}`),
);
console.log("\n== rate_limits no stream:", achados.length ? achados : "NÃO apareceu em nenhum evento");
const init = exec.eventos.find((e) => e.type === "system" && e.subtype === "init");
if (init) console.log("== Chaves do system/init:", Object.keys(init).join(", "));
if (exec.stderr.trim()) console.log("== stderr:", exec.stderr.slice(0, 500));
console.log("== Código de saída:", exec.codigoSaida);
