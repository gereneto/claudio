# Claudio: planejamento

Redesenhado em 2026-09-24. A primeira versão, de 2026-09-22, está na tag `v0-servidor`.

## Visão

O celular é só um transmissor de texto. Mando ordens por uma página e leio as respostas nela. O trabalho pesado acontece no PC, de hora em hora, com o Claudio decidindo:

- o que fazer primeiro;
- quanto usar da assinatura em cada hora, para não estourar os limites cedo e não desperdiçar limite semanal;
- qual modelo usar em cada trabalho, economizando sem perder qualidade.

## Por que o redesenho

A primeira versão tinha servidor Node, banco SQLite, PWA, Tailscale com HTTPS, notificações push e uma sessão escondida só para ler os limites. Funcionava, mas era complicado demais para o que eu preciso. O desenho novo troca tudo isso por duas peças que já existem no ecossistema do Claude.

## Peças

| Peça | O que é | Onde |
|---|---|---|
| Página | Página privada no claude.ai com banco de dados próprio. Lista de conversas agrupadas por projeto, marcador de não lida, filtro "aguardando você", perguntas com botões, pausar e arquivar, medidores de limite. | `pagina/claudio.html` |
| Rodada | Tarefa agendada do app Claude no PC, de hora em hora. Roda como uma sessão do Claude Code na pasta do Claudio, com acesso à pasta de todos os projetos. | `claudio-rodada`, instruções em `orquestrador/` |
| Limites | A própria rodada lê a janela de 5 horas, a semana e a cota semanal do Fable. | ferramenta `get_usage` do app |
| Execução | Subagentes, cada um com o modelo escolhido pela rodada. | ferramenta `Agent` |

## Como uma ordem anda

1. Escrevo na página. Ela fica "aguardando o Claudio".
2. Na próxima hora, a rodada lê a ordem, descobre o projeto e decide se é curta ou longa.
3. Se falta algo que muda o resultado, ela pergunta com botões de opção e a conversa fica "aguardando você".
4. Ordem curta: um subagente faz, com commit e push, e a resposta chega como relatório.
5. Ordem longa: a rodada manda um plano e faz um pedaço por hora enquanto houver folga nos limites.
6. Posso pausar, retomar ou arquivar qualquer conversa.

## Gestão de uso

Regras completas em `orquestrador/INSTRUCOES.md`. Em resumo:

- Pedidos novos e respostas passam na frente.
- Trabalhos longos só avançam se a semana estiver abaixo do ritmo esperado mais uma folga, e a janela de 5 horas abaixo de 70%.
- Nas últimas 24 horas antes do reset semanal, os trabalhos longos aceleram para não sobrar limite.
- O Fable só entra quando a cota dele estiver folgada.
- A cada 3 dias, uma pesquisa na web atualiza `orquestrador/estrategia.md`.
- O diário de cada rodada registra quanto cada trabalho moveu os limites, e isso alimenta a estratégia.

## Limitações conhecidas

- Precisa do PC ligado e do app Claude aberto. Se o app estiver fechado na hora marcada, a rodada acontece quando ele abrir.
- Uma ordem pode levar até uma hora para começar.
- Cada rodada sem nada a fazer ainda gasta um pouco de limite. Medir nos primeiros dias; se pesar, restringir a um horário.

## Próximos passos

- Medir o custo das rodadas vazias e ajustar a frequência.
- Primeira pesquisa de estratégia.
- Retomar a Ilíada quando o projeto estiver ajustado.
- Mais adiante, se eu quiser independência do PC: um Linux pequeno sempre ligado, com o Claude Code logado na assinatura.
