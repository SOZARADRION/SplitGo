# SplitGo

Gestão de gastos compartilhados (repúblicas, casais, viagens, churrascos).

## Estrutura

```
backend/            API (Fastify + TypeScript + Drizzle + PostgreSQL)
  src/domain/       regras puras: dinheiro, divisão, saldos, simplificação de dívidas
  src/services/     regras de negócio + acesso ao banco (auth, grupos, despesas, saldos)
  src/auth/         plugin JWT + middlewares authenticate / requireGroupMember
  src/routes/       rotas HTTP e validação (Zod)
  src/db/           schema e conexão
  drizzle/          migrações SQL geradas
  test/             testes de domínio, autenticação e API
mobile/             App (Expo SDK 58 + Expo Router), Android, iOS e web
  src/app/          telas (cada arquivo é uma rota)
  src/auth/         sessão (contexto) e validação dos formulários
  src/lib/          cliente da API, armazenamento seguro, tema
```

## Rodando

Requer Node 22+.

### Backend

Não precisa instalar PostgreSQL: sem `DATABASE_URL`, a API usa **PGlite**
(PostgreSQL embutido), com os dados em `backend/data/pglite`.

```bash
cd backend
npm install
npm run dev        # http://localhost:3333
npm test           # testes (banco em memória)
npm run typecheck
```

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` / `HOST` | `3333` / `0.0.0.0` | endereço da API |
| `DATABASE_URL` | (vazio → PGlite) | PostgreSQL real, ex.: `postgres://user:pass@localhost:5432/splitgo` |
| `PGLITE_DIR` | `./data/pglite` | pasta do banco embutido |
| `JWT_SECRET` | segredo de dev | **obrigatório em produção** (`NODE_ENV=production`), ≥ 32 caracteres |
| `JWT_EXPIRES_IN` | `7d` | validade do token |
| `BCRYPT_ROUNDS` | `12` | custo do hash de senha |
| `AUTH_RATE_LIMIT` | `10` | tentativas de login/cadastro por IP por minuto |

Para usar um PostgreSQL de verdade com Docker (na raiz do repositório):

```powershell
docker compose up -d --wait
$env:DATABASE_URL = "postgresql://splitgo:splitgo@localhost:5432/splitgo"
cd backend; npm run dev
```

As variáveis também podem ficar em `backend/.env` (modelo em `backend/.env.example`).

Após alterar `src/db/schema.ts`: `npm run db:generate` (as migrações rodam
automaticamente ao iniciar).

### Continuar em outro computador

```powershell
git clone https://github.com/SOZARADRION/SplitGo.git
cd SplitGo/backend; npm ci; npm test
cd ../mobile; npm ci
```

Antes de trocar de computador: `git add . ; git commit -m "..." ; git push`.
No outro: `git pull --ff-only`.

### App

```bash
cd mobile
npm install
npm run web        # navegador
npm start          # QR code para o Expo Go (celular na mesma rede Wi-Fi)
npm run typecheck && npm run lint
```

Por padrão o app chama a API no mesmo host do servidor do Expo, porta 3333.
Para outra URL: `EXPO_PUBLIC_API_URL=https://api.exemplo.com npm start`.

## Convenções

- Todo valor monetário é **inteiro em centavos** (`amountCents`).
- Saldo não é armazenado: é calculado a partir de despesas e acertos.
- Saldo > 0: tem a receber · saldo < 0: deve.

## Autenticação

- Senhas com **bcrypt** (custo 12), limitadas a 72 bytes (limite do bcrypt).
- Login devolve um **JWT** (HS256), enviado como `Authorization: Bearer <token>`.
- Login com e-mail inexistente ou senha errada dá a mesma resposta (não revela contas).
- Login e cadastro têm limite de tentativas por IP (429 ao exceder).
- Quem cria um grupo entra nele automaticamente. Participantes adicionados por
  e-mail são vinculados à conta com esse e-mail, agora ou quando ela for criada.
- Só participantes acessam um grupo. Para os demais, a API responde 404.
- No app, o token fica no **SecureStore** (Keychain/Keystore) no celular e no
  `localStorage` na web.

## API

Todas as rotas ficam sob `/api`, exceto `/health`. 🔒 = exige token; 👥 = exige ser participante do grupo.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | status |
| POST | `/api/auth/register` | cadastro `{ name, email, password }` → `{ token, user }` |
| POST | `/api/auth/login` | login `{ email, password }` → `{ token, user }` |
| GET | `/api/auth/me` 🔒 | usuário logado |
| GET | `/api/groups` 🔒 | meus grupos (com `memberCount`) |
| POST | `/api/groups` 🔒 | cria grupo `{ name, currency?, members: [{ name, email? }] }` |
| GET | `/api/groups/:groupId` 🔒👥 | grupo + participantes |
| POST | `/api/groups/:groupId/members` 🔒👥 | adiciona participante `{ name, email? }` |
| POST | `/api/groups/:groupId/expenses` 🔒👥 | lança despesa (ver abaixo) |
| GET | `/api/groups/:groupId/expenses` 🔒👥 | lista despesas com as partes |
| DELETE | `/api/groups/:groupId/expenses/:expenseId` 🔒👥 | exclui (soft delete) |
| POST | `/api/groups/:groupId/settlements` 🔒👥 | registra pagamento `{ fromMemberId, toMemberId, amountCents }` |
| GET | `/api/groups/:groupId/summary` 🔒👥 | extrato: saldos + transferências simplificadas |

### Lançar despesa

```json
{
  "description": "Mercado",
  "amountCents": 45690,
  "paidByMemberId": "<uuid>",
  "occurredAt": "2026-11-15T12:00:00Z",
  "split": { "type": "EQUAL", "memberIds": ["<uuid>", "<uuid>"] }
}
```

Tipos de `split`:

- `EQUAL`: `{ memberIds }`. O resto dos centavos vai para os primeiros da lista.
- `EXACT`: `{ shares: [{ memberId, amountCents }] }`. A soma deve fechar com o total.
- `PERCENT`: `{ shares: [{ memberId, percent }] }`. Até 2 casas decimais, soma 100.
- `SHARES`: `{ shares: [{ memberId, weight }] }`. Pesos inteiros (ex.: casal = 2).

### Erros

O corpo do erro é sempre `{ "error": "CODIGO", "message": "..." }`.

| Status | Códigos |
|---|---|
| 400 | `VALIDATION_ERROR` (com `issues`), `INVALID_PAYER`, `INVALID_SPLIT`, `INVALID_MEMBER` |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` |
| 404 | `NOT_FOUND` |
| 409 | `EMAIL_TAKEN`, `DUPLICATE_EMAIL` |
| 429 | `TOO_MANY_REQUESTS` |

## Integridade no banco

Além das validações da API, o PostgreSQL garante:

- valores positivos e acertos entre pessoas diferentes (CHECK);
- pagador, participantes da divisão e acertos sempre do mesmo grupo (FKs compostas);
- partes de cada despesa somando exatamente o total, verificado no COMMIT por
  triggers de restrição adiados (`drizzle/0002_expense_share_sum.sql`).

## Simplificação de dívidas

`src/domain/settle.ts`: minimizar transferências equivale a particionar os
membros no maior número de subgrupos que somam zero (cada subgrupo de k pessoas
se resolve com k − 1 transferências). Para até 16 membros com saldo ≠ 0, a API
usa programação dinâmica em bitmask (solução **ótima**). Acima disso, usa o
método guloso (maior devedor → maior credor), que garante no máximo n − 1
transferências.
