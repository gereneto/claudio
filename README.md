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

## Acesso pelo celular (Tailscale)

Com o Tailscale ligado nos dois aparelhos e o recurso Serve habilitado na tailnet, o PC expõe o Claudio em HTTPS (necessário para as notificações push):

```bash
tailscale serve --bg 3737
```

Isso fica salvo e sobrevive a reinícios. A URL no celular é `https://<nome-do-pc>.<tailnet>.ts.net` (aqui: `https://geremias.tailcd9281.ts.net`). Adicione à tela inicial e ligue as notificações na tela ⚙. Para desligar: `tailscale serve --https=443 off`.

## Deixar rodando sozinho (Windows)

O Claudio sobe como uma tarefa agendada do seu usuário, ao iniciar sessão, com reinício automático se o servidor cair. Precisa ser no seu usuário, e não como serviço de sistema, porque o login do Claude Code é por perfil.

```bash
npm run servico:instalar   # registra a tarefa "Claudio" e inicia
npm run servico:status     # tarefa, processo, API e limites
npm run servico:parar      # para o servidor (a tarefa volta no próximo logon)
npm run servico:iniciar    # inicia de novo
npm run servico:remover    # apaga a tarefa
```

Logs em `dados/logs/servidor-*.log` (14 dias). Depois de mudar o código, rode `npm run build` e `npm run servico:parar` seguido de `npm run servico:iniciar`.

Configurações por variável de ambiente: `CLAUDIO_PORTA` (3737), `CLAUDIO_DB`, `CLAUDIO_PROJETOS` (pasta dos clones; padrão: a pasta irmã da do Claudio), `CLAUDE_BIN`.
