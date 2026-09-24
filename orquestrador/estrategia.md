# Estratégia de modelos e uso

Atualizado em: 2026-09-24

Esta versão inicial vem do que se sabia na montagem do Claudio. A primeira pesquisa de estratégia deve revisá-la.

## Modelos disponíveis nos subagentes

O parâmetro `model` do `Agent` aceita `haiku`, `sonnet`, `opus` e `fable`.

| Modelo | Use para | Evite para |
|---|---|---|
| haiku | ler e resumir dados, triagem, classificar, conferir listas, tarefas mecânicas bem definidas | decisões de projeto, texto literário, código delicado |
| sonnet | correções de código rotineiras, gerar cards e conteúdo estruturado, pesquisa na web, a maior parte das ordens | tradução literária de alta exigência, bugs que já resistiram a uma tentativa |
| opus | tradução literária, bugs difíceis, refatorações, revisão de qualidade | tarefas mecânicas que o sonnet ou o haiku fazem bem |
| fable | planejar trabalhos grandes ou ambíguos, arquitetura | qualquer execução rotineira; e só quando a cota semanal do Fable estiver abaixo do ritmo |

## Regras de economia

- Delegar sempre: o orquestrador só lê, decide e relata.
- Prompts de subagente completos e objetivos, com a pasta exata e o que ler primeiro, para ele não gastar explorando.
- Um pedaço por rodada nos trabalhos longos, do tamanho que cabe em um subagente sem estourar o contexto.
- Em trabalho repetitivo, reaproveitar o padrão do que já existe no projeto em vez de redescobrir.

## Por tipo de ordem (ponto de partida)

- Tradução da Ilíada: `opus` para traduzir. Se a qualidade do `sonnet` se mostrar igual numa comparação, trocar e anotar aqui.
- Conferir e corrigir comentários de apps: `sonnet`.
- Conversas soltas, perguntas e explicações: `sonnet`, ou `haiku` se for só consulta.

## Custos observados

Anotar aqui o quanto cada tipo de trabalho moveu os limites, a partir do diário.

- 2026-09-22: corrigir os comentários do espanhol-cards com `sonnet` levou a janela de 5 h de 24% para 29% e a semana de 12% para 13%, somando as duas execuções.
- 2026-09-22: um bloco de 238 versos da Ilíada com `sonnet` levou a janela de 5 h de cerca de 29% para 35%.
