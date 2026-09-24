# Claudio

Gestor pessoal das ordens que mando ao Claude pelo celular.

- **Página**: https://claude.ai/artifact/DEBcyh4ZBJvVYCXc5cFWx8 (privada). Escrevo as ordens ali e leio as respostas.
- **Rodada**: uma tarefa agendada do app Claude no PC, de hora em hora. Lê as ordens novas, gere os limites da assinatura, escolhe os modelos, executa nos projetos por meio de subagentes e responde na página.

Só funciona com o PC ligado e o app Claude aberto.

## Estrutura

```
pagina/claudio.html        a página publicada no claude.ai
orquestrador/INSTRUCOES.md o que a rodada faz, passo a passo
orquestrador/projetos.md   onde fica cada projeto e as regras de cada um
orquestrador/estrategia.md modelos por tipo de trabalho e custos observados
dados/diario.md            uma linha por rodada (fora do git)
```

A tarefa agendada se chama `claudio-rodada` e aparece em "Agendadas" na barra lateral do app Claude. Ela só aponta para `orquestrador/INSTRUCOES.md`, então mudar o comportamento é mudar esses arquivos.

A versão anterior, com servidor Node, PWA e Tailscale, está na tag `v0-servidor`. As verificações técnicas daquela fase estão em [docs/fase0-resultados.md](docs/fase0-resultados.md).
