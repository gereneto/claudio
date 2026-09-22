// Fase 0, teste 4: decisão via saída estruturada (--json-schema) e retomada com --resume.
import { resolve } from "node:path";
import { OUT, resumoResultado, rodarClaude } from "./lib.ts";

const schema = JSON.stringify({
  type: "object",
  properties: {
    status: { type: "string", enum: ["concluida", "precisa_decisao"] },
    resumo: { type: "string" },
    pergunta: { type: "string" },
    opcoes: { type: "array", items: { type: "string" } },
  },
  required: ["status", "resumo"],
});
const sistema =
  "Você trabalha para o Claudio, um orquestrador. Quando precisar de uma decisão do usuário, encerre devolvendo status precisa_decisao com a pergunta e as opções, e não decida sozinho. Quando terminar, devolva status concluida com um resumo de uma linha.";

const primeira = await rodarClaude(
  "Vou escrever um poema curto. Preciso que você decida comigo o tema: mar ou montanha. Pergunte-me antes de escrever.",
  ["--model", "haiku", "--max-turns", "2", "--json-schema", schema, "--append-system-prompt", sistema],
  { log: resolve(OUT, "04-eventos-1.jsonl") },
);
console.log("== Primeira rodada:", JSON.stringify(resumoResultado(primeira.resultado), null, 2));
const saida = primeira.resultado?.structured_output;
if (saida?.status !== "precisa_decisao") {
  console.log("Não pediu decisão; teste encerrado.");
  process.exit(0);
}

const sessao = primeira.resultado!.session_id as string;
const segunda = await rodarClaude(
  `Decisão do usuário: ${saida.opcoes?.[0] ?? "mar"}. Prossiga e escreva o poema (4 versos).`,
  ["--model", "haiku", "--max-turns", "2", "--json-schema", schema, "--resume", sessao],
  { log: resolve(OUT, "04-eventos-2.jsonl") },
);
console.log("== Segunda rodada (resume):", JSON.stringify(resumoResultado(segunda.resultado), null, 2));
console.log("== Mesma sessão?", segunda.resultado?.session_id === sessao);
