// Servidor MCP (stdio) que o Claude Code usa como anfitrião de permissões (--permission-prompt-tool).
// Cada pedido (permissão de ferramenta ou AskUserQuestion) é encaminhado ao servidor do Claudio,
// que espera a resposta do usuário pelo celular. Variáveis: CLAUDIO_PORTA, CLAUDIO_ORDEM_ID, CLAUDIO_CONVERSA_ID.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { request } from "node:http";
import { z } from "zod";

const porta = Number(process.env.CLAUDIO_PORTA ?? 3737);
const ordemId = process.env.CLAUDIO_ORDEM_ID ? Number(process.env.CLAUDIO_ORDEM_ID) : undefined;
const conversaId = process.env.CLAUDIO_CONVERSA_ID ? Number(process.env.CLAUDIO_CONVERSA_ID) : undefined;

function perguntarAoClaudio(dados: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolver) => {
    const corpo = JSON.stringify(dados);
    const req = request(
      { host: "127.0.0.1", port: porta, path: "/api/interno/permissao", method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(corpo) } },
      (res) => {
        let texto = "";
        res.setEncoding("utf8");
        res.on("data", (p) => (texto += p));
        res.on("end", () => {
          try {
            resolver(JSON.parse(texto));
          } catch {
            resolver({ behavior: "deny", message: "Resposta ilegível do Claudio." });
          }
        });
      },
    );
    req.setTimeout(0);
    req.on("error", (e) => resolver({ behavior: "deny", message: `Claudio indisponível: ${e.message}` }));
    req.end(corpo);
  });
}

const servidor = new McpServer({ name: "claudio", version: "0.0.1" });
servidor.registerTool(
  "aprovar",
  {
    description: "Encaminha pedidos de permissão e perguntas ao usuário do Claudio, que responde pelo celular.",
    inputSchema: { tool_name: z.string().optional(), input: z.any().optional(), tool_use_id: z.string().optional() },
  },
  async (entrada) => {
    const resposta = await perguntarAoClaudio({ ...entrada, ordem_id: ordemId, conversa_id: conversaId });
    return { content: [{ type: "text", text: JSON.stringify(resposta) }] };
  },
);
await servidor.connect(new StdioServerTransport());
