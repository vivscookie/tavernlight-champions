# Contrato da API (v1)

Este documento é a fonte da verdade entre o front-end (`src/js/api.js`) e o backend.
`docs/openapi.yaml` é a mesma coisa em formato de máquina. `scripts/mock-server.mjs` é uma
implementação de referência (em memória) que aplica exatamente estas regras.

## Convenções

| Tema | Regra |
|---|---|
| Base | `/api` (mesma origem; configurável com `VITE_API_BASE_URL`) |
| Formato | JSON (`Content-Type: application/json`), UTF-8 |
| Autenticação | Cookie de sessão da empresa (SSO), `credentials: same-origin`. O usuário vem da sessão, **nunca do corpo** |
| CSRF | Cabeçalho `X-CSRF-Token` em `POST`/`PUT` (o front lê de `<meta name="csrf-token">` se existir) |
| Idempotência | `POST` que cria algo exige `Idempotency-Key` (UUID). Mesma chave + mesmo corpo devolve a resposta original (`Idempotent-Replay: true`); mesma chave + corpo diferente → `422 idempotency_key_reuse` |
| Dinheiro | **Centavos inteiros** (`amountCents`), nunca decimal. Moeda: USD |
| Datas | ISO 8601 em UTC |
| Identificadores | `seasonId` = `autumn-split`, jogos = `cs2 lol valorant smash rl aoe`, departamentos e squads conforme `src/data/*.json` |
| Timeout do cliente | 15 s; `POST` **não** repete sozinho (o usuário repete, com a mesma `Idempotency-Key`) |

### Formato de erro (todos os 4xx/5xx)

```json
{ "error": { "code": "validation_failed", "message": "Texto para humanos (en)", "fields": { "stake.amountCents": "must be between 0 and 50000" } } }
```

`fields` só existe em `422`. As chaves usam caminho com pontos (`maps[1].teamA`).
`code` é estável (o front decide a mensagem pelo código); `message` é só de apoio e para logs.

| HTTP | `code` | Quando |
|---|---|---|
| 401 | `unauthenticated` | Sem sessão ou sessão expirada |
| 403 | `forbidden` | Sem papel para a ação (ex.: só organizadores alteram regras do pote) |
| 404 | `not_found` | Partida/recurso inexistente |
| 409 | `gamertag_taken` | Screen name já usado por outra pessoa |
| 409 | `already_registered` | Esta pessoa já está inscrita na temporada |
| 409 | `already_published` | Resultado dessa partida já foi publicado |
| 409 | `rsvp_closed` | RSVP depois de o evento começar |
| 409 | `rsvp_not_available` | O evento não aceita RSVP (ex.: transmissão ao vivo, inscrição de time) |
| 409 | `squad_full` | Aceitar candidatura com o time já na capacidade máxima |
| 409 | `captain_locked` | Tentar rebaixar ou remover o capitão |
| 422 | `validation_failed` | Corpo inválido (veja `fields`) |
| 422 | `series_not_decided` | Placares não decidem a série |
| 422 | `idempotency_key_reuse` | Mesma chave, corpo diferente |
| 429 | `rate_limited` | Cabeçalho `Retry-After` (segundos) |
| 5xx | `internal_error` | Falha do servidor |

## Endpoints

### `GET /api/gamertags/availability?name={name}`

Usado na etapa 1 antes de avançar. Não reserva o nome (a reserva acontece no `POST /registrations`).

`200` → `{ "name": "Vivi_99", "available": true }`
`422` se `name` não cumprir a regra do gamertag.

### `POST /api/registrations`

Conclui o cadastro (etapa 4). Cria a inscrição **da pessoa logada** na temporada.

```json
{
  "seasonId": "autumn-split",
  "gamertag": "Vivi_99",
  "department": "game_design",
  "squad": { "path": "join", "squadId": "ironforge" },
  "games": ["cs2", "lol"],
  "stake": { "amountCents": 2500, "payrollConsent": true }
}
```

`201` → `{ "id": "reg_01H…", "status": "confirmed", "createdAt": "2026-10-22T18:00:00Z" }`
Erros: `401`, `409 gamertag_taken`, `409 already_registered`, `422`, `429`.

### `POST /api/matches/{matchId}/result`

Publica o resultado de uma série. **O servidor recalcula o placar da série** a partir dos mapas
(o cliente não envia `winsA/winsB`).

```json
{
  "bestOf": 3,
  "maps": [ { "number": 1, "teamA": 13, "teamB": 9 }, { "number": 2, "teamA": 7, "teamB": 13 }, { "number": 3, "teamA": 13, "teamB": 8 } ],
  "mvp": "dev_dan",
  "notes": "Sem ocorrências."
}
```

`201` → `{ "matchId": "14", "status": "published", "winsA": 2, "winsB": 1 }`
Erros: `401`, `403`, `404`, `409 already_published`, `422`, `429`.

### `PUT /api/pool/rules`

Define a divisão do pote (só organizadores). O MVP recebe o restante e é calculado pelo servidor.

```json
{ "seasonId": "autumn-split", "shares": { "first": 50, "second": 30, "third": 15 }, "fairPlayRules": true, "guildBadge": true }
```

`200` → mesmo corpo + `"shares": { …, "mvp": 5 }`.
Erros: `401`, `403`, `422`, `429`.

### `GET /api/seasons/{seasonId}/pool`

Pote da temporada, regras vigentes, prêmios já calculados e os últimos aportes. É a **única fonte** do pote para as telas de
cadastro (`prizepool`) e de gestão (`poolsettings`): as duas mostram o mesmo número.

```json
{
  "seasonId": "autumn-split",
  "totalCents": 285000,
  "changeVsPreviousPct": 18.5,
  "rules": { "shares": { "first": 50, "second": 30, "third": 15, "mvp": 5 }, "fairPlayRules": true, "guildBadge": true,
             "updatedBy": "vivi#0001", "updatedAt": "2026-10-21T16:42:00Z" },
  "payouts": [
    { "place": "1",   "kind": "podium",      "sharePct": 50, "amountCents": 142500 },
    { "place": "2",   "kind": "podium",      "sharePct": 30, "amountCents": 85500 },
    { "place": "3",   "kind": "podium",      "sharePct": 15, "amountCents": 42750 },
    { "place": "4-8", "kind": "consolation", "sharePct": 5,  "amountCents": 14250, "winners": 5, "eachCents": 2850 }
  ],
  "ledger": [ { "id": "tx_4829A", "code": "#4829A", "handle": "alex_design", "tournament": "CS2 Summer Invitational", "amountCents": 5000, "at": "2026-10-22T18:46:00Z" } ]
}
```

- `payouts` fecha **exatamente** em `totalCents` (arredonda 1º–3º e o resto vai para a fatia final; `eachCents` é o piso da divisão).
- Hoje o `shares.mvp` (o que sobra) é exibido como "Consolation Split (4–8)" em `prizepool` e como "MVP" em `poolsettings`:
  é a mesma fatia com dois nomes. **Decisão de produto pendente** (ver README).
- Uma inscrição com `stake.amountCents > 0` soma ao `totalCents` e entra no `ledger`.

Erros: `401`, `404` (temporada inexistente).

### `GET /api/me/dashboard`

Tudo que o topo do painel (`index`) mostra da **pessoa logada**: perfil, temporada, posição, prêmio e a próxima partida.

```json
{
  "user":   { "handle": "vivi#0001", "displayName": "Vivs", "guild": "Game Design Guild" },
  "season": { "id": "autumn-split", "name": "Autumn Split 2026" },
  "standing":   { "rank": 4, "total": 31, "points": 176 },
  "prizeShare": { "amountCents": 5000, "vaultBonusPct": 15 },
  "nextMatch": {
    "id": "match_ironforge_sf1", "game": "cs2", "gameLabel": "CS2", "round": "Semifinals", "bestOf": 3,
    "stage": "Knockout", "format": "5v5", "startsAt": "2026-10-25T22:30:00Z", "server": "Official League Server 04", "lobby": "Studio Lobby A",
    "swapWindowMinutes": 10, "mapPool": ["Mirage", "Inferno", "Anubis"], "voice": { "label": "Voice #Arena-1", "url": "https://…" },
    "checkIn": { "confirmed": 5, "required": 5, "locksAt": "2026-10-25T22:15:00Z" },
    "team":     { "name": "Ironforge Knights", "crestUrl": "https://…|null", "seed": 2, "record": { "wins": 12, "losses": 3 } },
    "opponent": { "name": "Ravencrest Syndicate", "division": "Product & Ops Div.", "seed": 1, "record": { "wins": 12, "losses": 2 }, "crestUrl": null }
  }
}
```

- `nextMatch` é `null` sem partida marcada. **É exatamente a mesma partida** de `GET /teams/mine` (`nextMatch`) e do evento do calendário
  (`matchId`): mesmo `id`, mesmo `startsAt`, mesmo `checkIn`. `team` e `opponent` trazem os dados dos dois lados
  (`team.seed` = posição do seu time; `team.record` = `stats.wins/losses` de `GET /teams/mine`).
- `voice` pode ser `null`; a tela só mostra o link se a URL for `http(s)`.
- O nome da temporada exibido no herói é `season.name`: **uma só fonte** para todas as telas.

Erros: `401`.

### `GET /api/teams/mine`

Time da pessoa logada (a sessão define qual). Inclui capitão, estatísticas, membros e convites.

```json
{
  "id": "ironforge", "name": "Ironforge Knights", "tagline": "Frontend & Engine Squad", "division": "Division 01 • Studio Elite",
  "crestUrl": "https://…", "capacity": 8, "enrolledTitles": ["cs2", "lol", "smash"],
  "captain": { "handle": "vivi#0001", "title": "CAPTAIN / IGL", "division": "Core Engineering Division" },
  "stats": { "points": 168, "pointsDelta": 24, "standing": 2, "standingNote": "Top 5% Studio", "wins": 12, "losses": 3, "winRatePct": 80 },
  "nextMatch": { "id": "match_ironforge_sf1", "game": "cs2", "gameLabel": "CS2", "round": "Semifinals", "bestOf": 3,
                 "opponent": { "name": "Ravencrest Syndicate" }, "startsAt": "2026-10-25T22:30:00Z",
                 "server": "Official League Server 04", "lobby": "Studio Lobby A", "swapWindowMinutes": 10,
                 "checkIn": { "confirmed": 5, "required": 5, "locksAt": "2026-10-25T22:15:00Z" } },
  "disciplines": [
    { "game": "cs2", "name": "Counter-Strike 2", "kind": "squad", "tone": "primary", "format": "5v5 Starter Set", "note": "…",
      "slots": [ { "position": "1", "memberId": "m_1", "handle": "vivi#0001", "detail": "Captain / IGL", "status": "locked" },
                 { "position": "3", "memberId": null, "handle": null, "detail": null, "status": "open" } ] },
    { "game": "smash", "name": "Smash Ultimate", "kind": "solo", "tone": "tertiary", "format": "1v1 Solo Lead Rep", "note": "…",
      "lead": { "memberId": "m_2", "handle": "dev_dan", "detail": "Fox / Joker (14.2M Elite GSP)" },
      "backup": { "memberId": "m_4", "handle": "pixel_art", "detail": "Samus" } } ],
  "members": [ { "id": "m_1", "handle": "vivi#0001", "avatarUrl": "https://…|null", "department": "Frontend Engineering",
                 "roleLabel": "IN-GAME LEADER / IGL", "isCaptain": true, "status": "starter",
                 "ratings": [ { "game": "cs2", "label": "CS2: Faceit Lvl 10", "stat": "2,180 ELO" } ] } ],
  "invites": {
    "inbound":  [ { "id": "inv_in_1", "handle": "…", "avatarUrl": null, "note": "…", "department": "…",
                    "disciplines": [ { "game": "cs2", "label": "CS2 (Rifler)" } ], "peakRating": "1,840 ELO" } ],
    "outbound": [ { "id": "inv_out_1", "handle": "tanya_ui", "department": "UI/UX Engineering",
                    "sentAt": "2026-10-21T22:00:00Z", "expiresAt": "2026-10-22T04:00:00Z" } ]
  }
}
```

- `avatarUrl`/`crestUrl`: URLs `https` (ou relativas). Sem avatar (`null`), a tela mostra as iniciais.
- Datas em ISO 8601; a tela formata ("18 hours ago", "Expires in 6h") no fuso do usuário.
- `nextMatch` é `null` quando não há partida marcada. Traz também `stage`, `format`, `mapPool`, `voice` e o `opponent` completo (veja `GET /me/dashboard`). `startsAt` e `checkIn.locksAt` são ISO 8601; a tela mostra "Tonight at 19:30 EST"
  no fuso do usuário e faz a contagem regressiva até `locksAt`.
- `checkIn.confirmed / required` são **derivados no servidor**: `required` = slots da escalação do jogo da partida; `confirmed` = slots
  `locked` que ainda têm alguém. A tela nunca calcula isso.
- `disciplines` traz uma escalação por jogo. Os slots referenciam o **membro** (`memberId`); `handle` e `detail` vêm preenchidos pelo
  servidor. Se o membro sai do time, o slot volta como `{ "memberId": null, "handle": null, "detail": null, "status": "open" }`
  (nunca um handle desatualizado) e o `checkIn` é recalculado.
- Dois formatos, por `kind`:
  - `squad`: `slots: [ { position, memberId, handle, detail, status } ]`, com `status` `locked | active | open`.
  - `solo` (ex.: Smash 1v1): `lead` e `backup`, cada um `{ memberId, handle, detail }` ou `null`.

### `PATCH /api/teams/mine/members/{memberId}`

`{ "status": "starter" | "sub" }` → `200` com o membro atualizado.
Erros: `403` (só o capitão), `404`, `409 captain_locked`, `422`.

### `DELETE /api/teams/mine/members/{memberId}`

`204`. Erros: `403`, `404`, `409 captain_locked`. A tela pede confirmação antes de chamar.

### `POST /api/teams/mine/invites/{inviteId}/decision`

Responde a uma **candidatura recebida** (exige `Idempotency-Key`). `{ "decision": "accept" | "decline" }`.
`200` → `{ "status": "accepted", "member": { … } }` (entra como reserva) ou `{ "status": "declined" }`.
Erros: `403`, `404` (não existe ou já respondida), `409 squad_full`, `422`.

### `DELETE /api/teams/mine/invites/{inviteId}`

Cancela um **convite enviado** pelo time. `204`. Erros: `403`, `404`.

### `GET /api/seasons/{seasonId}/events`

Calendário do estúdio: eventos **em andamento e futuros** (os encerrados saem), ordenados por `startsAt`. A tela só mostra; filtros,
rótulos de dia e status saem destes campos.

```json
{
  "seasonId": "autumn-split",
  "events": [
    { "id": "evt_cup_ko", "title": "Studio Cup 2026 - CS2 Knockout Stage",
      "description": "Semi-finals clash: Ravencrest vs Ironforge Knights • Spectator stream in Discord #theater",
      "startsAt": "2026-10-25T19:30:00Z", "endsAt": "2026-10-25T21:30:00Z", "status": "live_soon",
      "participating": true, "category": null, "prize": { "kind": "cash", "amountCents": 45000 },
      "matchId": "match_ironforge_sf1", "action": { "kind": "spectate", "url": "https://…" } },
    { "id": "evt_smash_casual", "title": "Casual Smash Brawl", "description": "…", "startsAt": "…", "endsAt": "…", "status": "scheduled",
      "participating": true, "category": "CASUAL / SOCIAL", "prize": null, "action": { "kind": "rsvp", "going": true } },
    { "id": "evt_rocket_lunch", "title": "Rocket League 3v3 Lunch Cup", "description": "…", "startsAt": "…", "endsAt": "…", "status": "scheduled",
      "participating": false, "category": "SPEEDRUN / 1 HR", "prize": null, "registrationClosesAt": "2026-10-30T12:00:00Z",
      "action": { "kind": "register", "url": null } } ]
}
```

- `status`: `scheduled` | `live_soon` (começa em até 3 h) | `live` (entre `startsAt` e `endsAt`). Calculado pelo **relógio do servidor**.
- `participating`: o time joga **ou** a pessoa confirmou presença (RSVP). É o que alimenta o filtro "My Matches Only".
- `prize`: `null` | `{ "kind": "cash", "amountCents": … }` | `{ "kind": "bragging" }`. Alimenta o filtro "Prize Pool Events".
- `action.kind`: `spectate` (`url`), `rsvp` (`going`), `bracket` (`url`) ou `register` (`url`). `url: null` = ainda indisponível (a tela
  mostra o botão desabilitado). Só `rsvp` tem endpoint próprio hoje.
- `matchId` (opcional) liga o evento a uma partida do time; deve coincidir com `nextMatch.id` e `startsAt` de `GET /teams/mine`.
- Datas sempre em ISO 8601; a tela calcula "TODAY / FRI 28" e "19:30 EDT" no fuso do usuário. **Não mande rótulos de dia prontos.**

Erros: `401`, `404` (temporada inexistente).

### `PUT /api/events/{eventId}/rsvp`

`{ "going": true | false }` → `200` com o **evento atualizado** (a participação muda junto). Idempotente por natureza.
Erros: `401`, `404`, `409 rsvp_not_available` (a ação do evento não é `rsvp`), `409 rsvp_closed` (já começou), `422`.

## Regras que o servidor DEVE impor (o front só faz a primeira linha de defesa)

**Gamertag**: 3–16 caracteres, `[A-Za-z0-9_-]`, único sem diferenciar maiúsculas. Nomes reservados (`admin`, `moderator`, `tavernlight`) são recusados.
**Inscrição**: `department` existente; `squad.path` ∈ `join | agent | found`, e `squadId` obrigatório (e com vaga) só em `join`; `games` ⊆ jogos válidos, sem repetição; `stake.amountCents` inteiro entre `0` e `50000`.
**Consentimento do desconto em folha**: `stake.payrollConsent` deve ser `true` quando `amountCents > 0` (senão `422` em `stake.payrollConsent`). O servidor deve **registrar** o aceite (quem, quando, versão do texto) como evidência para RH/Jurídico; o front só envia o booleano do checkbox, que começa desmarcado.
**Resultado**: `bestOf` ∈ `1 | 3 | 5`; `maps` com numeração 1..n sequencial e `n ≤ bestOf`; `teamA`/`teamB` inteiros 0–99; nenhum mapa empatado; a série precisa estar decidida (quem chega a `⌊bestOf/2⌋+1` vitórias); **mapas depois da série decidida são proibidos**; `mvp` ≤ 40 caracteres (opcional); `notes` ≤ 500 caracteres. Publicar é irreversível: segunda tentativa → `409 already_published`.
**Time**: remover um membro vaga os slots dele em todas as escalações (e recalcula o check-in); só o capitão altera membros e responde candidaturas; o capitão é sempre titular e não pode ser removido; aceitar exige vaga (`membros < capacity`); candidatura aceita entra como reserva.
**Calendário**: encerrados não aparecem; RSVP só em eventos com `action.kind = rsvp` e antes de começar; `participating` e `status` são sempre derivados (nunca guardados na tela).
**Pote**: `first` 30–70, `second` 15–40, `third` 5–25 (inteiros); soma ≤ 95 (MVP = 100 − soma ≥ 5).
