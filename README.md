# Claudio

Auxiliar pessoal, usado pelo celular, que recebe ordens para os meus projetos e as executa no Claude Code ao longo da semana, dosando o uso dos limites da assinatura.

- Planejamento: [PLANEJAMENTO.md](PLANEJAMENTO.md)
- Verificações técnicas: [docs/fase0-resultados.md](docs/fase0-resultados.md)

## Estrutura

```
server/   API HTTP + escalonador + runner (Node 24, TypeScript, Hono, node:sqlite)
web/      PWA (React + Vite)
fase0/    scripts das verificações técnicas
dados/    banco SQLite e arquivos gerados (fora do git)
```

## Rodar

Requisitos: Node 24, `gh` logado, Claude Code logado na assinatura (abra `claude` num terminal e faça `/login` uma vez).

```bash
npm install
npm run build     # compila o PWA em web/dist
npm run dev       # sobe o servidor em http://localhost:3737 (serve o PWA)
```

No celular, com o Tailscale ligado nos dois aparelhos, abra `http://<nome-do-pc>:3737` e adicione à tela inicial.

Configurações por variável de ambiente: `CLAUDIO_PORTA` (3737), `CLAUDIO_DB`, `CLAUDIO_PROJETOS` (pasta dos clones; padrão: a pasta irmã da do Claudio), `CLAUDE_BIN`.
