# Claudio — Planejamento

Documento vivo. Versão inicial: 2026-09-22.

## 1. Visão

Claudio é um auxiliar pessoal, usado principalmente pelo celular, que recebe **ordens** (pré-prompts) para os meus projetos e as executa no Claude ao longo da semana. Ele dosa o trabalho para não estourar cedo os limites da assinatura nem deixar limite sobrando no fim da semana, escolhe o modelo certo para cada etapa, resume o que está fazendo e me traz só as decisões que precisam de mim.

## 2. Premissas e decisões de partida

Estas premissas guiam tudo o que vem abaixo. Se alguma estiver errada, o plano muda; ver seção 12.

| Premissa | Decisão |
|---|---|
| Assinatura | **Claude Max** (decidido em 2026-09-22). |
| Como o Claude é chamado | Pelo **Claude Code em modo headless** (`claude -p`) rodando no meu PC com o login da assinatura. Não pela API paga, nem pelo Agent SDK. |
| Onde o Claudio roda | Um servidor local no PC (Windows), que fica ligado direto. O celular acessa por **Tailscale** (decidido). Ver seção 13 sobre a alternativa "só celular". |
| Permissões | **`--permission-mode auto`** mais lista de comandos permitidos por projeto; só o que sobrar vai para o celular (decidido). |
| Projetos | **Todos os repositórios do GitHub** entram automaticamente, exceto os repositórios-satélite (ver seção 5, "Projeto"). |
| Interface | Um **PWA** (site instalável no celular), não um app nativo. |
| Usuário | Só eu. Sem cadastro, sem multiusuário. Proteção pela própria rede privada. |
| Stack | Node 24 + TypeScript no servidor; SQLite como banco (Node 24 já traz `node:sqlite`); React + Vite no PWA. |
| Idioma | Interface e prompts em português. |

Por que headless com assinatura e não API: os limites que quero gerenciar são os da assinatura (janela de 5 horas e janela semanal). A API é cobrada por token e não tem esses limites. O Agent SDK oficialmente exige chave de API e a Anthropic não permite login de assinatura em produtos de terceiros, então ele fica fora.

## 3. O que a pesquisa confirmou sobre o Claude Code

Fontes: documentação oficial em code.claude.com (headless, statusline, hooks, remote-control, scheduled-tasks) e um teste local com `claude -p`.

**Modo headless (`claude -p`)**
- Flags úteis: `--output-format json` ou `stream-json`, `--resume <session_id>`, `--continue`, `--model`, `--permission-mode`, `--allowedTools`, `--max-turns`, `--append-system-prompt`, `--json-schema`, `--add-dir`.
- O JSON final traz `session_id`, `total_cost_usd`, `usage` (tokens de entrada, saída, cache), `modelUsage` por modelo, `num_turns`, `duration_ms`, `permission_denials`, `is_error`, `terminal_reason`. Confirmado no teste local.
- `--resume` retoma uma sessão de qualquer diretório. O custo reportado ao retomar é o acumulado da conversa inteira.
- `--bare` acelera a partida mas **não usa o login da assinatura**, então não serve para nós.
- Sem `--bare`, o `-p` carrega hooks, CLAUDE.md e MCPs do projeto. É o que queremos.
- Comandos de barra funcionam dentro do prompt: `/model sonnet`, `/effort low`, `/fast`.
- Parar com SIGTERM deixa o turno inacabado, mas o `--resume` continua de onde parou.
- **Situação atual da máquina:** o CLI no terminal ainda não está logado (o teste respondeu "Not logged in · Please run /login"). O app desktop usa outro caminho de autenticação. Primeiro passo prático: abrir `claude` num terminal e fazer `/login`.

**Permissões e decisões em modo headless**
- Em `-p`, o modo inicial é Manual e qualquer coisa que pediria confirmação é negada, a não ser que uma regra `--allowedTools`, o `--permission-mode` (`auto`, `acceptEdits`) ou um hook `PermissionRequest` libere.
- Existe `--permission-prompt-tool`: um servidor MCP nosso vira o "anfitrião de permissões" e recebe cada pedido. É assim que o Claudio pode encaminhar pedidos de permissão para o celular e esperar a resposta.
- Verificado na Fase 0: com `--permission-prompt-tool`, o MCP do Claudio recebe **também o `AskUserQuestion`**, com as perguntas e opções, e a resposta volta ao Claude na mesma execução. É o caminho adotado para decisões. A saída estruturada (`--json-schema`) com `status: "precisa_decisao"` mais `--resume` também funciona e fica como segunda via.

**Limites da assinatura**
- Não há API documentada para ler os limites. Mas o **status line** recebe em JSON `rate_limits.five_hour.used_percentage`, `rate_limits.five_hour.resets_at`, `rate_limits.seven_day.used_percentage`, `rate_limits.seven_day.resets_at`. Aparece só para assinantes Pro/Max e só depois da primeira resposta da API na sessão.
- Verificado na Fase 0 (ver `docs/fase0-resultados.md`): o `stream-json` do headless **não** entrega `rate_limits`, e o status line **não roda** em `-p`. Plano B em teste: sessão interativa mínima num pseudo-terminal com status line gravando o JSON. Plano C: o evento `system/api_retry` com `error: "rate_limit"` avisa quando batemos no limite, e o Claudio estima o resto pelos tokens de cada execução.

**Hooks**
- `SessionEnd`, `Stop`, `PermissionRequest`, `Notification` aceitam hook do tipo `http` (POST para uma URL local). É o canal para o Claudio saber que uma execução terminou ou travou esperando algo, sem depender só do fim do processo.

**Agendamento e acesso remoto**
- Routines na nuvem consomem a mesma cota da assinatura e não rodam no meu PC, então não substituem o Claudio. O agendador será do próprio Claudio.
- Remote Control permite o celular dirigir uma sessão do PC, mas é manual. Não há gatilho programável documentado. O Claudio faz o papel dele, com a fila.

**Modelos disponíveis no Claude Code** (a tabela de forças e preços muda; por isso a pesquisa periódica)
- Fable 5.1: raciocínio mais exigente, tarefas longas e autônomas. O mais caro.
- Opus 5: padrão da assinatura para código agêntico longo.
- Sonnet 5: equilíbrio entre velocidade e inteligência.
- Haiku 4.5: mais rápido e barato, para resumos e classificação.
- `effort` (`low` a `max`) altera bastante o consumo. Fast mode troca profundidade por velocidade.

## 4. Arquitetura

```
 celular (PWA)  ──HTTPS via Tailscale──►  Servidor Claudio (PC, Node/TS)
                                             ├─ API HTTP + WebSocket (eventos ao vivo)
                                             ├─ SQLite (ordens, execuções, conversas, uso)
                                             ├─ Escalonador (fila + dosagem semanal)
                                             ├─ Runner: spawn `claude -p ...` por execução
                                             ├─ Servidor MCP de permissões (--permission-prompt-tool)
                                             ├─ Receptor de hooks HTTP do Claude Code
                                             ├─ Leitor de limites (rate_limits)
                                             └─ Pesquisador de estratégia (a cada 3 dias)
```

Componentes:

1. **Servidor Claudio**: um processo Node que sobe como serviço do Windows (ou na inicialização) e oferece a API para o PWA.
2. **Banco SQLite**: um arquivo só, fácil de copiar. Guarda tudo.
3. **Escalonador**: decide o que rodar e quando. Detalhes na seção 6.
4. **Runner**: executa uma ordem chamando `claude -p` no diretório do projeto, com `--output-format stream-json`, `--model`, `--permission-mode`, `--append-system-prompt` (regras do Claudio) e `--resume` quando continua uma sessão. Lê o stream para atualizar progresso e captura o JSON final.
5. **Servidor MCP de permissões**: pequeno servidor stdio que o Runner passa em `--permission-prompt-tool`. Cada pedido vira uma "decisão pendente" no celular; a resposta volta ao Claude.
6. **Receptor de hooks**: endpoint local que recebe `SessionEnd`, `Stop` e `Notification`.
7. **Leitor de limites**: mantém o último `rate_limits` conhecido e o histórico de snapshots.
8. **Pesquisador de estratégia**: uma ordem interna, contínua, que roda a cada 3 dias com WebSearch e produz o documento `estrategia.md` (modelos, forças, dicas de economia). O planejador lê esse documento antes de distribuir modelos.
9. **PWA**: React, mobile-first, com notificações push (Web Push) para decisões pendentes e conclusões.
10. **Acesso remoto**: Tailscale no PC e no celular. Sem portas abertas na internet. Alternativa: Cloudflare Tunnel com senha.

## 5. Modelo de dados

- **Projeto**: nome, repositório no GitHub, caminho no disco (clone local, criado pelo Claudio se não existir), instruções fixas (vira `--append-system-prompt` ou CLAUDE.md do projeto), modelo padrão, `visivel` (bool), satélites.
  - Importação: o Claudio lista os repositórios da conta `gereneto` pelo `gh` e cria um Projeto por repositório.
  - Satélites: repositório cujo nome termina em `-dados` é ligado ao repositório-base de mesmo prefixo e não aparece como projeto (hoje: `espanhol-cards-dados`, `intencoes-dados`, `oracao-mental-dados`). Ordens do projeto-base podem mexer no satélite; o Claudio passa o clone dele em `--add-dir`. Qualquer projeto pode ser ocultado à mão, e um satélite pode ser desligado da regra.
  - Projetos atuais que entram (20 repositórios em 2026-09-22): claudio, espanhol-cards, imagens_hist_9, sermoes, biblia-site, catecismo, iliada, triduo-pascal, magisterio-tematico, agenda, oracao-mental, intencoes, versificacao, etica_chalita, calendario-cci, site-teste. Satélites: `espanhol-cards-dados` e `espanhol-cards-revisao` (de `espanhol-cards`), `intencoes-dados`, `oracao-mental-dados`. Sufixos de satélite: `-dados`, `-revisao`.
- **Ordem**: projeto, título, prompt, tipo (`pontual` | `contínua`), `ligada` (bool, nasce desligada), prioridade, estado (`fila`, `rodando`, `aguardando_decisao`, `pausada`, `concluida`, `erro`), tamanho estimado, para contínuas: unidade de trabalho (ex.: "1 capítulo", "20 cards"), progresso, critério de fim.
- **Execução**: ordem, `session_id` do Claude, modelo, effort, início, fim, tokens, custo estimado, resultado (`concluida`, `precisa_decisao`, `erro`, `limite`), resumo curto (gerado pelo Haiku a partir do resultado), lista de arquivos tocados.
- **Decisão pendente**: execução, pergunta, opções, resposta, respondida em.
- **Conversa**: título, pasta, projeto (opcional), `session_id`, última mensagem, `lida` (bool), origem (ordem ou chat solto).
- **Pasta**: nome, pai (árvore simples). Criada automaticamente pelo Claudio ao classificar chats soltos.
- **Mensagem**: conversa, papel (eu | claudio | claude), texto, tipo (`resumo`, `decisao`, `livre`), lida.
- **SnapshotUso**: momento, `five_hour_pct`, `five_hour_reset`, `seven_day_pct`, `seven_day_reset`, fonte.
- **Estratégia**: data da pesquisa, texto em markdown, tabela de modelos com papel sugerido.

## 6. Escalonador e dosagem dos limites

Objetivo: gastar a cota semanal por inteiro, sem estourar cedo, priorizando ordens pontuais.

**Entradas**: último snapshot de `rate_limits`, horário de reset da janela semanal e da janela de 5 horas, fila de ordens ligadas, histórico de consumo por tipo de ordem (quantos pontos percentuais cada execução costumou custar).

**Regra básica (ritmo semanal)**
1. Calcula o **ritmo alvo**: percentual semanal que já deveria ter sido consumido a esta altura da semana, seguindo uma curva linear (com opção de curva que reserva mais para o fim, configurável).
2. Mantém uma **reserva para pontuais**: por exemplo 25% da cota semanal fica intocável por ordens contínuas até o último dia; no último dia a reserva é liberada para contínuas.
3. Se `uso_real < ritmo_alvo` e há folga na janela de 5 horas, pega a próxima ordem da fila.
4. Ordem de escolha: pontuais ligadas primeiro (por prioridade, depois por ordem de criação), depois contínuas em rodízio entre projetos para que nenhuma fique parada.
5. Ordem contínua roda **um pedaço** por vez (uma unidade de trabalho). O tamanho do pedaço é ajustado com base no custo médio das execuções anteriores da mesma ordem.
6. Para a janela de 5 horas: nunca iniciar uma execução se a previsão de custo dela ultrapassar o que resta na janela; esperar o reset.
7. Fim da semana: nas últimas horas antes do reset semanal, o escalonador libera contínuas até o limite útil (deixando uma margem de segurança de ~5%).

**Sem leitura de limites** (se a Fase 0 mostrar que o headless não entrega `rate_limits`): usa tokens do `usage` de cada execução como moeda interna e calibra contra o que o `/usage` mostrar manualmente até o plano B ficar pronto.

**Concorrência**: uma execução por vez no início. Mais tarde, no máximo duas, se a janela de 5 horas permitir.

## 7. Gestão de modelos

Papéis fixos, com o modelo de cada papel definido pela última Estratégia:

| Papel | Uso | Sugestão inicial |
|---|---|---|
| Planejador | Quebrar uma ordem grande em pedaços, decidir escopo do próximo pedaço | Opus 5 (Fable 5.1 para ordens grandes ou ambíguas) |
| Executor | Fazer o pedaço (código, tradução, cards) | Sonnet 5 na maioria; Opus 5 para código difícil |
| Resumidor | Gerar o resumo curto de cada execução e classificar chats em pastas | Haiku 4.5 |
| Pesquisador | Pesquisa de estratégia a cada 3 dias | Sonnet 5 com WebSearch |

Regras de economia embutidas no prompt do Runner: effort baixo para tarefas mecânicas, alto para planejamento; nada de fast mode por padrão; `--max-turns` por tipo de ordem; instruções para não reler arquivos grandes sem necessidade. A Estratégia pode sobrescrever qualquer uma dessas escolhas.

## 8. Fluxo de uma ordem

**Pontual**
1. Crio a ordem no celular (desligada). Ligo quando quiser.
2. Escalonador pega a ordem. Runner roda o Planejador só se a ordem for grande; senão vai direto ao Executor.
3. Durante a execução, o stream alimenta uma linha de progresso. Ao terminar, o Resumidor gera 3 a 5 linhas e a conversa da ordem recebe o resumo, marcada como não lida.
4. Se o Claude precisar de uma decisão ou de uma permissão, a execução entra em `aguardando_decisao`, recebo push, respondo, e o Runner faz `--resume`.
5. Concluída, a ordem some da fila e fica no histórico do projeto.

**Contínua**
1. Igual, mas o Planejador define a unidade de trabalho e o critério de fim na primeira execução (ex.: "livro tem 32 capítulos; 1 capítulo por execução").
2. Cada execução faz um pedaço e registra progresso. A conversa da ordem mostra "capítulo 7 de 32 traduzido; 2 termos marcados para revisão".
3. Quando o critério de fim é atingido, a ordem se conclui sozinha.

**Chat solto**
1. Escrevo uma mensagem livre. O Resumidor classifica em pasta existente ou cria uma nova.
2. A conversa fica com o indicador de não lida até eu abrir.

## 9. Interface (PWA)

Duas abas na base da tela.

**Conversas**
- Lista por pasta, com contador de não lidas e filtro "só não lidas".
- Conversas de ordens aparecem aqui também, marcadas com o ícone do projeto.
- Tela da conversa: resumos e decisões em destaque; botões de resposta rápida para decisões com opções.

**Projetos**
- Lista de projetos com contagem de ordens ligadas e a próxima da fila.
- Tela do projeto: lista de ordens com o botão ligado/desligado, tipo, progresso (para contínuas) e estado. Botão para nova ordem.
- Tela da ordem: prompt, configurações (tipo, prioridade, unidade), histórico de execuções com custo e resumo.

**Mostrador de limites**: barra no topo de todas as telas com dois medidores (5h e semana), horário de reset e o "ritmo alvo" para eu ver se estamos adiantados ou atrasados. Toque abre o histórico.

**Configurações**: caminho do `claude`, modelos por papel, reserva para pontuais, curva de gasto, notificações.

## 10. Fases de implementação

**Fase 0 — Verificações (1 sessão)**
- Logar o CLI no terminal e confirmar que `claude -p` roda com a assinatura.
- Testar se `stream-json` entrega `rate_limits`. Se não, testar o plano B do status line.
- Testar hook HTTP `SessionEnd` e o `--permission-prompt-tool` com um MCP mínimo.
- Testar o padrão "decisão via JSON estruturado + `--resume`".
- Resultado: um arquivo `docs/fase0-resultados.md` e as decisões técnicas fechadas.

**Fase 1 — MVP utilizável pelo celular**
- Servidor, SQLite, Projetos, Ordens pontuais com botão ligado/desligado, fila simples (uma por vez), Runner, resumo por Haiku, conversa por ordem, mostrador de limites, Tailscale.
- Sem dosagem sofisticada ainda: só respeita a janela de 5h.

**Fase 2 — Contínuas e dosagem**
- Ordens contínuas com unidade de trabalho e progresso, escalonador semanal com reserva para pontuais, decisões e permissões pelo celular, push.

**Fase 3 — Estratégia e organização**
- Pesquisador a cada 3 dias, modelos por papel vindos da Estratégia, chats soltos com pastas automáticas e não lidas, histórico de uso.

**Fase 4 — Acabamento**
- Serviço do Windows, backups do SQLite, duas execuções em paralelo, métricas de custo por projeto.

**Fase 5 — Executor na nuvem (opcional)**
- Despachar ordens para sessões na nuvem ou routines quando o PC estiver desligado ou quando a ordem só mexer em repositório. Ver seção 13.

## 11. Estrutura inicial do repositório

```
claudio/
  PLANEJAMENTO.md
  README.md
  server/        # Node + TypeScript: API, escalonador, runner, MCP de permissões
  web/           # PWA em React + Vite
  docs/          # resultados de verificações, estratégia.md gerada
```

## 12. Decisões tomadas

Registradas em 2026-09-22:

1. Assinatura Max.
2. Acesso remoto por Tailscale.
3. PC fica ligado direto. A alternativa "só celular" foi analisada (seção 13) e fica como evolução futura.
4. Permissões em modo `auto`.
5. Todos os repositórios do GitHub entram como projetos; satélites `-dados` ficam agregados ao repositório-base.

## 13. Alternativa "só celular" (nuvem), analisada e adiada

Pergunta: dá para dispensar o PC, deixando os projetos no GitHub e o Claude rodando na nuvem da Anthropic?

**O que existe e funciona na assinatura Max**
- Sessões do Claude Code na web (claude.ai/code e aba Code do app do celular): clonam o repositório do GitHub, rodam comandos, criam branches `claude/` e PRs. Aceitam mensagens de continuação pelo celular.
- Routines (agentes agendados na nuvem): gatilhos por horário (intervalo mínimo de 1 hora), por API e por eventos do GitHub. O gatilho por API é documentado: `POST /v1/claude_code/routines/{id}/fire`, com um token próprio da routine e um campo `text` livre de até 64 mil caracteres, que pode carregar o prompt da ordem. Há um teto diário de execuções por conta.
- Ambiente na nuvem: 4 vCPU, 16 GB, 30 GB, Node/Python/etc. pré-instalados, rede restrita a domínios confiáveis por padrão.
- Consomem a mesma cota da assinatura que o uso local.

**Onde a versão só-nuvem perde**
1. **Sem leitura dos limites.** Nem sessões na nuvem nem routines informam os percentuais das janelas de 5 h e 7 dias. O mostrador viraria uma estimativa por tokens, e a dosagem semanal, que é o motivo do Claudio existir, ficaria às cegas. No PC, o status line entrega esses números.
2. **Sem aviso de término.** Não há webhook nem API documentada para ler o resultado de uma execução na nuvem. O caminho documentado é a routine gravar o resultado no próprio repositório (commit, arquivo, corpo do PR) e o Claudio ficar consultando o GitHub. Existe uma API interna de sessões que o app desktop usa, mas não é documentada e pode mudar.
3. **Cada execução de routine começa do zero.** Não retoma a sessão anterior. Todo o estado (fila, progresso das contínuas, decisões pendentes) teria de viver em arquivos commitados num repositório, e cada execução começa clonando tudo.
4. **Decisões e permissões** só pelo app oficial do Claude, fora do Claudio, ou via arquivos no repositório com uma execução extra para retomar.
5. **O orquestrador precisa rodar em algum lugar mesmo assim.** Ou uma routine-cérebro a cada hora (gasta cota só para pensar e está sujeita ao teto diário), ou um serviço gratuito externo (GitHub Actions com cron, Cloudflare Workers) guardando estado no GitHub.
6. Todo trabalho chega como branch `claude/` e PR, que alguém precisa aprovar e mesclar. Para tradução de livro e geração de cards isso vira atrito diário.

**Decisão**: começar no PC, que resolve os pontos 1 a 4 de forma limpa. O desenho já prevê uma evolução híbrida: o Runner ganha um segundo "executor" que despacha uma ordem para a nuvem (`claude --cloud` ou o gatilho de routine) quando isso for vantajoso, por exemplo quando o PC estiver desligado ou para ordens que só mexem em repositório. Essa evolução entra como Fase 5 quando as Fases 1 a 3 estiverem estáveis.
