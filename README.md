# Tavernlight Champions League (web)

Telas do sistema de campeonatos internos, organizadas como projeto Vite + Tailwind compilado.

## Como rodar

```bash
npm install
npm run assets:fetch   # uma vez: baixa as imagens para public/img (versione a pasta)
npm run dev            # http://localhost:5173 (API simulada no navegador)
npm run build          # gera dist/ (HTML + CSS/JS com hash); API em modo live
npm test               # formatadores, contrato do cliente (HTTP real), regras do backend de referência e build sem mock
```

## Estrutura

```
src/
  *.html              8 telas; só o conteúdo próprio de cada uma
  partials/           head, header, footer, stepper (escritos uma única vez)
  data/               site.json (marca, temporada, usuário, menu, etapas), departments.json,
                      squads.json, assets.json (manifesto de imagens)
  js/main.js          carrega o CSS
  js/registration-state.js   estado do cadastro entre as 4 etapas
  js/pages/*.js       um módulo por tela (sem handlers inline)
  js/api.js           cliente da API: fetch real (live) ou simulado (mock), DTOs e mensagens de erro
  js/ui/              toast.js, dialog.js (<dialog>), pending.js (botão "enviando"), template.js + format.js (dados da API em <template>)
  js/mock/backend.js  backend de REFERÊNCIA do contrato (usado pelo mock-server e pelo modo mock do navegador)
  data/mock/          fixtures do backend de referência (time, pote)
  styles/main.css     diretivas do Tailwind + ajustes de base
docs/                 api-contract.md (contrato e regras de negócio) e openapi.yaml
scripts/mock-server.mjs      servidor de REFERÊNCIA do contrato (em memória)
tests/api.contract.test.mjs  teste de contrato (HTTP real)
build/html-partials.js       plugin que monta as páginas (includes, menu ativo, stepper, imagens)
tailwind.config.cjs   configuração única do tema
scripts/fetch-assets.mjs
```

## Como as páginas usam os partials

```html
<include src="partials/header.html" active="teams"></include>
<include src="partials/stepper.html" current="2"></include>
<include src="partials/head.html" title="Team Manager" description="..."></include>
```

- `active` marca o item do menu (com `aria-current="page"`); `current` marca a etapa do stepper.
- `{{site.season.name}}` e similares leem `src/data/site.json`. Variável inexistente **quebra o build**.
- Imagens: `src="img:slug"` aponta para `public/img/slug.*`; se o arquivo ainda não existir, o build usa a URL remota do manifesto e avisa.
- Para mudar menu, etapas, nome da temporada ou usuário, edite só `src/data/site.json`.

## Cadastro (etapas 1–4)

O estado fica em `localStorage` (`tavernlight:registration:v1`) via `registration-state.js`:
cada tela salva seus dados, marca a etapa como concluída e navega. Não é possível abrir a etapa N
sem concluir as anteriores; adicione `?preview=1` na URL para ignorar a trava (design/QA).
Para ligar a um backend, troque `read()`/`write()` por chamadas de API.

## API e backend

O contrato está em `docs/api-contract.md` (e `docs/openapi.yaml`). O front fala com `/api` através de `src/js/api.js`:

| Comando | O que faz |
|---|---|
| `npm run dev` | API **simulada** no navegador (`VITE_API_MODE=mock`, padrão em dev) |
| `npm run mock-api` + `npm run dev:live` | Front em modo **live** com proxy de `/api` para o servidor de referência (`localhost:8787`) |
| `npm run build` | Modo **live** (lê `.env.production`); a API é a mesma origem, em `/api` |

- Variáveis: `VITE_API_MODE` (`live`/`mock`) e `VITE_API_BASE_URL` (padrão `/api`). Veja `.env.example`.
- Falhas no modo mock: `?simulateError` (503 em tudo), `=write` (só as escritas falham; a tela carrega), `=conflict` (409),
  `=validation` (422) ou `=network` (sem rede). `?mockRole=viewer` simula usuário sem permissão (403).
- No modo mock o estado vive até recarregar a página; as mudanças (remover jogador, aceitar candidatura, inscrição que soma ao pote)
  passam pelas **mesmas regras** do servidor de referência.
- O cliente envia `Idempotency-Key` nos POSTs (a nova tentativa do mesmo envio reaproveita a chave), `X-CSRF-Token` (se houver
  `<meta name="csrf-token">`), usa timeout de 15 s e traduz o `code` do erro em mensagem para o usuário (`describeError`).
- `scripts/mock-server.mjs` aplica **todas** as regras do contrato; o backend real deve passar no mesmo `tests/api.contract.test.mjs`
  (aponte `VITE_API_BASE_URL` ao seu servidor) antes de ir para produção.

## Dados da API nas telas

Roster, convites, escalações, próxima partida, pote, prêmios, ledger o **calendário de eventos**, o **herói** e a **próxima partida** do `index` **não existem mais no HTML**:
vêm de `GET /api/teams/mine`, `GET /api/seasons/{id}/pool`, `GET /api/seasons/{id}/events` e `GET /api/me/dashboard`.
A próxima partida é **uma só** para toda a app (mesmo `id`, `startsAt` e `checkIn` no painel, no `teammanager` e no calendário).
O markup continua no HTML (quem desenha edita o HTML), dentro de `<template>`; o JS só preenche. Tudo entra com `textContent`
(dado da API nunca vira HTML).

| Atributo | O que faz |
|---|---|
| `data-text="campo.sub\|pipe"` | texto do elemento (pipes em `js/ui/format.js`: `money`, `signed`, `agoShort`, `initials`…) |
| `data-attr="atributo:campo;outro:campo"` | atributos (`id`, `data-*`, `aria-label`, `style`…) |
| `data-src="campo"` | `src` de `<img>` (só `https`/relativo); sem valor, some o elemento |
| `data-if` / `data-unless` | mantém/remove o elemento conforme o campo |
| `<template data-each="lista">` | repete o conteúdo por item |

- Padrão de cada tela: `load()` (aria-busy) → `render()`; falha → painel `role="alert"` com **"Try again"**; lista vazia → mensagem.
- Cores/estados que dependem do dado ficam em **CSS** (`group-data-[status=starter]/roster:…`, `data-[tone=primary]:…`), não em JS.
- `bindElement()` (elementos fixos da página) **ignora campos que o contexto não traz**: dá para religar só uma parte sem apagar o resto.
- **URLs vindas da API são validadas**: o binder só grava `href`/`src`/`action` se forem `http(s)` ou relativos; `javascript:`, `data:` e `//host`
  são descartados (a tela mostra a ação como indisponível). Teste: `tests/format.test.mjs` e a suíte das telas.
- **Datas e filtros são derivados, nunca digitados**: o calendário recebe `startsAt` (ISO), `status`, `participating` e `prize`; "TODAY / FRI 28",
  "19:30 EDT", os selos e os filtros (My Matches, Live, Prize Pool) saem daí. Não escreva dia da semana no título de evento.
- O build **falha** se um template usar um pipe que não existe ou `data-each` fora de `<template>`.
- **O mock não vai para produção**: `api.js` lê `import.meta.env.*` direto (sem alias) para o Vite descartar o ramo do mock;
  `npm run test:build` falha se o `dist/` publicar o backend de referência ou os fixtures.
- **Escalações e check-in são derivados no servidor**: os slots guardam só o `memberId`; quem sai do time deixa o slot `open` e o
  "N / M CONFIRMED" é recalculado (a tela relê o time depois de remover alguém; se a releitura falhar, avisa que as escalações podem estar desatualizadas).
- Ações (alternar titular/reserva, remover, aceitar/recusar, revogar) chamam a API; o status é otimista e desfaz se falhar; remover pede confirmação.
- Fotos/brasões vêm da API (`avatarUrl`, `crestUrl`); sem foto, a tela mostra as iniciais.

## Regras de HTML (verificadas em todo build)

`build/html-partials.js` **falha o build** (e só avisa no `npm run dev`) se alguma página tiver:
`<button>` sem `type`, link `href="#"`, `id` duplicado, `form="x"` sem `<form id="x">` ou `<label for="x">` sem controle.

- Destino que ainda não existe: use texto desabilitado (`aria-disabled="true"` + "(coming soon)"), nunca `href="#"`.
  Para o rodapé, deixe `"href": null` em `src/data/site.json`.
- Formulários: cada tela tem um `<form id="..." hidden novalidate></form>` e os controles/botões se ligam a ele pelo
  atributo `form="..."` (válido em HTML5, não depende de onde o controle está no layout). O envio é o evento `submit`
  (Enter funciona) e `new FormData(form)` traz todos os campos.
- Todo controle precisa de nome acessível: `<label for>`, `aria-label` ou texto dentro do `<label>`.
- Todo `<button>` e `<a href>` precisa de nome acessível (texto, `sr-only`, `alt` de imagem ou `aria-label`); botão só com ícone
  sem `aria-label` **quebra o build**. Toda página precisa de `<main id="main-content">` (alvo do skip link).

## Acessibilidade

- **Ícones**: o plugin coloca `aria-hidden="true"` em todo `.material-symbols-outlined` (o texto da ligatura não é lido).
- **Foco**: `main.css` define um contorno global em `:focus-visible`; não use `focus:outline-none` sem um anel substituto
  (`focus-visible:ring-2` etc.). Cards com input escondido (`sr-only`) precisam de `peer-focus-visible:` / `has-[:focus-visible]:`.
- **Movimento**: `prefers-reduced-motion: reduce` desliga animações e transições globalmente.
- **Teclado**: skip link no topo; menu mobile (`js/ui/mobile-nav.js`) com `aria-expanded`, Esc e retorno de foco;
  grupo de tiers do `prizepool` segue o padrão ARIA de rádio (uma parada de tabulação + setas).
- **Anúncios** (leitor de tela): toasts (`role=status`/`alert`), contador de jogos, resultado do filtro do calendário,
  ações do roster. A contagem regressiva usa `role="timer"` (não anuncia a cada segundo).
- **Contraste** (calculado a partir dos tokens): `on-surface-variant` ≥ 7,2:1 em todos os fundos; `outline` ≥ 4,5:1 até
  `surface-container-high`, mas **3,9:1 sobre `surface-container-highest`** (use `on-surface-variant` ali);
  `outline-variant` (1,3–2,0:1) só serve para bordas/divisores, nunca para texto. Placeholders: `on-surface-variant/80`.

## Estados visuais e feedback

- Seleção de cards (tiers, jogos, squads) e status do roster **não troca classes via JS**: o JS só muda um atributo
  (`aria-checked`, `data-enlisted`, `data-status`) e o CSS reage (`aria-checked:`, `group-data-[...]/card:`).
  Para mudar o visual de um estado, edite as classes no HTML.
- Nenhum `alert()`: sucesso/erro usam `showToast()`, confirmações com resumo usam `showDialog()`.
- Envios (concluir cadastro, publicar resultado) usam `withPending()`: botão desabilitado + `aria-busy`, restaurado em caso de erro.
- Para testar falhas, abra qualquer tela com `?simulateError` (as chamadas de `js/api.js` passam a falhar).

## Dependências

Tudo é `devDependencies` (nada de terceiros vai para o navegador). `npm audit` ainda aponta 9 itens (6 altos, 3 moderados), todos de
ferramentas de build/dev server (Vite 5 → esbuild, Tailwind 3 → braces/micromatch/chokidar…); a correção exige subir de versão maior
(Vite 6+ e Tailwind 4) e mexer em `tailwind.config.cjs`. Enquanto isso, não exponha o `npm run dev` em redes não confiáveis.

## Pendências conhecidas

**Dados ainda fixos no HTML** (próximo conjunto a migrar, mesmo padrão de template + endpoint). `teammanager` já está 100% vindo da API
(roster, convites, próxima partida, check-in e escalações):
- `poolsettings`: cartões de torneios (cada um com seu pote), KPIs (participação, partidas ao vivo) e destaques.
- `index`: o **calendário, o herói e a próxima partida já vêm da API**; ainda fixos: jogos registrados, times e pedidos, fila de
  próximas partidas, pódio e classificação. **Atenção:** a seção "Registered Games" ainda diz "Team: Ravencrest" e "vs Ironforge",
  o contrário do herói e do `teammanager` (o seu time é o Ironforge Knights) até ser migrada.
- `enlisting`: lista de jogos. `matchresults`: times, mapas e capitães.
- `prizepool`: os 4 tiers (0/10/25/50) e o teto de $500 são configuração fixa na tela (e no contrato).

**Decisões de produto abertas**
- **Nomes da mesma coisa:** a temporada aparecia como "Season VI" (herói), "Season 4" (`poolsettings`) e "Autumn Split 2026" (cadastro); o
  torneio, como "Staff Champions Cup 2026", "Studio Cup 2026" e "Studio Champions League 2026". O herói agora usa `season.name` da API; falta
  padronizar o resto e decidir o nome oficial.
- **Cabeçalho:** o handle e o papel do usuário (`vivi#0001`, "Staff Competitor") ainda vêm de `site.json` em tempo de build, e não de `/me`.
- A fatia de 5% é chamada de **"MVP"** em `poolsettings` e de **"Consolation Split (4–8)"** em `prizepool`. O contrato a chama de `mvp`
  e a API entrega, em `payouts`, o rateio 4–8; é a mesma fatia com dois significados. Definir um só.
- "Lobby Check-In" (herói) aparece desabilitado: falta o endpoint de check-in do jogador.
- Calendário: "View Bracket" e "Register Team" aparecem como indisponíveis (`url: null`); falta endpoint de inscrição de time em evento e a página de chaves.
- Botões sem ação: "Promote to Co-Captain", "Inspect", "Captain Controls", "Lock Roster Readiness", "Sync Tournament Lock",
  "Designate Backup" (`teammanager`) e "Save Draft"/"Back to Bracket" (`matchresults`). Cada um precisa de endpoint próprio no contrato.
- Regra de escalação a confirmar: hoje um reserva pode estar numa escalação (ex.: `sub_sam` no LoL) e só **sair do time** esvazia o slot.
- O contador do `index` ainda usa lógica própria; pode passar a usar `js/ui/countdown.js` (já usado em `teammanager`).
- Links do rodapé "Standings" e "Community Chat" (as páginas não existem); abas de filtro de `poolsettings`/`teammanager` sem ação.

**Backend e operação**
- **O backend ainda não existe.** Falta implementar o contrato (`docs/api-contract.md`): validação de placar/valores/pote, unicidade do
  gamertag, regras do time (só o capitão altera; capitão fixo; vaga ao aceitar) e o **registro do aceite do desconto em folha**
  (quem, quando, versão do texto). O servidor de referência e `npm test` mostram o comportamento esperado.
- Autenticação/SSO e papéis (organizador, capitão, árbitro) são suposições do contrato; confirmar com a equipe de infra.
- Não foi feita revisão manual com leitor de tela (NVDA/VoiceOver) nem auditoria em navegador (axe/Lighthouse): rodar antes de publicar.
