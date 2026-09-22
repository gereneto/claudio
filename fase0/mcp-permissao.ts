// Servidor MCP mínimo que faz o papel de "anfitrião de permissões" (--permission-prompt-tool).
// Registra cada pedido em fase0/out/03-mcp.log e aprova. Para AskUserQuestion, escolhe a primeira opção.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const OUT = resolve(import.meta.dirname, "out");
mkdirSync(OUT, { recursive: true });
const LOG = resolve(OUT, "03-mcp.log");
const registrar = (linha: string) => appendFileSync(LOG, `${new Date().toISOString()} ${linha}\n`);

const servidor = new McpServer({ name: "claudio", version: "0.0.1" });

servidor.registerTool(
  "aprovar",
  {
    description: "Decide pedidos de permissão e perguntas do Claude em nome do usuário do Claudio.",
    inputSchema: { tool_name: z.string().optional(), input: z.any().optional(), tool_use_id: z.string().optional() },
  },
  async (entrada) => {
    registrar(`PEDIDO ${JSON.stringify(entrada)}`);
    let resposta: Record<string, unknown>;
    if (entrada.tool_name === "AskUserQuestion") {
      const perguntas = (entrada.input as any)?.questions ?? [];
      const respostas: Record<string, string> = {};
      for (const q of perguntas) respostas[q.question] = q.options?.[0]?.label ?? "sim";
      resposta = { behavior: "allow", updatedInput: { questions: perguntas, answers: respostas } };
    } else {
      resposta = { behavior: "allow", updatedInput: entrada.input ?? {} };
    }
    registrar(`RESPOSTA ${JSON.stringify(resposta)}`);
    return { content: [{ type: "text", text: JSON.stringify(resposta) }] };
  },
);

await servidor.connect(new StdioServerTransport());
