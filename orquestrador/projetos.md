# Projetos

Pasta base: `C:\Users\geren\OneDrive\Documentos\Onedrive do Gere\Software MEU`, abaixo chamada de `MEU`. Todos os repositórios são da conta `gereneto` no GitHub.

Um projeto sem clone local é clonado em `MEU\<nome>` com `gh repo clone gereneto/<nome> "<pasta>"` na primeira ordem que precisar dele. Depois atualize esta tabela.

## Regras gerais

- Nunca usar mesóclise. Antes de commitar texto em português, varrer com:
  `grep -n -E -o "[A-Za-zÀ-ÿ]+-(lo|la|los|las|o|a|os|as|me|te|se|lhe|lhes|nos|vos|no|na)-(ei|as|á|ás|emos|eis|ão|ia|ias|íamos|íeis|iam)\b" <arquivos>`
- Commits em português, um por assunto, com push ao terminar.
- Repositórios com sufixo `-dados` ou `-revisao` são satélites do repositório de mesmo prefixo: pedidos para o projeto principal podem mexer neles.

## Mapa

| Projeto (repositório) | Pasta local | Satélites |
|---|---|---|
| claudio | `MEU\Claudio` | |
| espanhol-cards | `MEU\espanhol\app` | espanhol-cards-dados em `MEU\espanhol\dados`; espanhol-cards-revisao, sem clone, só tem README |
| iliada | `MEU\iliada\site` | planilhas de revisão em `MEU\iliada`, fora do git |
| sermoes | `MEU\sermoes` | |
| biblia-site | `MEU\biblia` | |
| oracao-mental | `MEU\oracao-mental` | oracao-mental-dados, sem clone |
| intencoes | `MEU\intencoes` | intencoes-dados, sem clone |
| versificacao | `MEU\versificacao` | |
| calendario-cci | `MEU\calendario-cci` | |
| triduo-pascal | `MEU\Semana Santa\site` | |
| etica_chalita | `MEU\etica\site` | |
| agenda | sem clone | |
| biblioteca | sem clone | |
| catecismo | sem clone | |
| imagens_hist_9 | sem clone | |
| magisterio-tematico | sem clone | |
| site-teste | sem clone | |

Pastas em `MEU` sem repositório conhecido: `Base FIXA`, `Bezier`, `Leitor`, `Misterios`, `Musica`, `Tempo Comum`, `baixar_fontes`, `book-share`, `celular`, `nomes`, `synth26`, `teste`. Se um pedido citar uma delas, trabalhe nela e acrescente à tabela.

## iliada

Site de leitura da Ilíada em tradução portuguesa em versos, uma estrofe por página, com notas clicáveis. Publicado no GitHub Pages: cada push republica.

- Ler o `README.md` antes de mexer. O texto vive em `dados/canto-XX.js`, um objeto por estrofe com `titulo`, `versos`, `linhas` e `notas`; `{1}`, `{2}` nas linhas apontam para a lista `notas`.
- Canto novo: criar `dados/canto-XX.js` com `window.ILIADA.cantos.push({...})` e incluir o `<script>` no `index.html`, na ordem.
- Falas diretas entre aspas curvas. O gosto na tradução e nas notas está em `memoria/projetos/iliada.md`.
- Conferir a sintaxe com `node --check` antes do push, para o site não quebrar.
- Commits no padrão `Canto V, estrofes 12-20 (vv. 239-420)`.
- Trabalho longo em andamento: um bloco de cerca de 200 versos por pedaço, terminando no fim de uma cena. Progresso em versos, de 15.693. Parou no Canto V, verso 238. Está pausado a pedido do Geremias.

## espanhol-cards

App de estudo com cards. Os comentários e contestações dos usuários ficam em `MEU\espanhol\dados` (`comentarios.json`, `contestacoes.json`, `progresso.json`, `resumo.md`). Tem build em `fonte/build.js`; rodar e testar a lógica antes de commitar.
