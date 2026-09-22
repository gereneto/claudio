# Fase 0 — Resultados das verificações técnicas

Data: 2026-09-22. Claude Code 2.1.270, Windows 11, assinatura Max 5x. Scripts em `fase0/`, saídas brutas em `fase0/out/` (fora do git).

## Como rodar

Os processos abertos pelo meu shell de trabalho não enxergam o login do Claude. Os testes precisam rodar num processo iniciado pelo app desktop (configuração `fase0` em `.claude/launch.json`) ou no terminal do usuário:

```bash
npx tsx fase0/todos.ts
```

## Resultados

| # | Pergunta | Resultado |
|---|---|---|
| 1 | `claude -p` roda com a assinatura? | **Sim.** Stream-json com `system/init`, `assistant`, `result`. O `result` traz `session_id`, `total_cost_usd`, `usage`, `modelUsage` (por modelo, com `costUSD` e tokens), `permission_denials`, `structured_output`. |
| 1 | O stream traz `rate_limits`? | **Não.** Nenhum evento carrega a chave. |
| 5 | O status line roda em `-p`? | **Não.** O comando configurado em `statusLine` não é chamado em modo headless. |
| 2 | Hooks HTTP chegam num servidor local? | **Sim.** `PermissionRequest`, `Stop` e `SessionEnd` chegaram por POST com JSON. `Notification` não disparou neste cenário. Campos úteis: `PermissionRequest` traz `tool_name`, `tool_input`, `permission_suggestions`; `Stop` traz `last_assistant_message`. |
| 2 | Resposta `allow` no hook funcionou? | **Não na primeira tentativa**: usei `decision: "allow"`; o formato correto é `decision: { behavior: "allow" }`. Corrigido no código; a reexecução confirma. |
| 3 | `--permission-prompt-tool` com um MCP nosso? | **Sim, e é o melhor caminho.** O MCP recebeu `{tool_name, input, tool_use_id}` tanto para o `Write` quanto para o `AskUserQuestion` (com `questions[]`), e a resposta `{behavior: "allow", updatedInput}` foi aceita. O arquivo foi criado com a opção escolhida. |
| 6 | Sessão interativa em pseudo-terminal com status line? | **Funciona** (status line chamado, JSON gravado), mas sem `rate_limits`. Ver decisão 4. |
| — | Ciclo completo pelo Claudio (ordem → `AskUserQuestion` → celular → resposta → resumo)? | **Sim.** Testado no PWA com a ordem "Teste de pergunta". |
| 4 | Decisão por `--json-schema` e retomada com `--resume`? | **Sim.** A primeira rodada devolveu `structured_output.status = precisa_decisao` com pergunta e opções; a segunda, com `--resume`, manteve o mesmo `session_id` e concluiu. |

## Decisões técnicas fechadas

1. **Execução**: `claude -p --output-format stream-json --verbose`, com `--permission-mode auto` (o classificador resolve o rotineiro) e `--permission-prompt-tool mcp__claudio__aprovar` para o que sobrar. O MCP do Claudio encaminha o pedido ao servidor, que espera a resposta do celular.
2. **Perguntas ao usuário**: o próprio `AskUserQuestion` do Claude passa pelo mesmo MCP. A saída estruturada (`--json-schema`) continua sendo usada para o resumo e o progresso, e como segunda via de decisão (`precisa_decisao`).
3. **Hooks HTTP**: `Notification` e `Stop` ficam como sinais auxiliares; `PermissionRequest` por hook fica como reserva (formato `decision: {behavior}`).
4. **Limites da assinatura**: o headless não entrega. Plano B testado (`fase0/06-pty.ts`, com `@lydell/node-pty`): sessão interativa num pseudo-terminal com `statusLine` gravando o JSON. Na primeira rodada não veio `rate_limits` porque o CLI estava logado numa conta de API ("API Usage Billing" no banner, `/usage` só com custos). Depois do login correto na conta Max, a chamada do status line após o `/usage` trouxe `rate_limits.five_hour` (19%) e `rate_limits.seven_day` (11%), iguais ao que o `/usage` mostra. Observações: as primeiras chamadas do status line na sessão ainda vêm sem `rate_limits`; o campo aparece um pouco depois (a leitura é assíncrona). O `/usage` também mostra uma barra separada "Current week (Fable)", que o status line não expõe. **Adotado**: o Claudio mantém uma sessão interativa mínima (Haiku) num pseudo-terminal, com o status line fazendo POST no servidor, e a cutuca com um prompt mínimo quando precisa de leitura fresca.
5. **Custo dos testes**: cerca de US$ 0,16 em custo de lista, todos com Haiku.
