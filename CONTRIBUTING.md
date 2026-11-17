# Como contribuir

Siga o [início rápido](README.md#início-rápido) para rodar o projeto com Node.js 24. Use `npm ci` em cada componente para instalar as versões dos respectivos arquivos de lock.

## Configuração da API

Copie [backend/.env.example](backend/.env.example) para `backend/.env` se precisar alterar os valores locais.

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` / `HOST` | `3333` / `0.0.0.0` | endereço da API |
| `DATABASE_URL` | (vazio → PGlite) | PostgreSQL externo, ex.: `postgres://user:pass@localhost:5432/splitgo` |
| `PGLITE_DIR` | `./data/pglite` | pasta do banco embutido |
| `JWT_SECRET` | segredo de dev | **obrigatório em produção** (`NODE_ENV=production`), ≥ 32 caracteres |
| `JWT_EXPIRES_IN` | `7d` | validade do token |
| `BCRYPT_ROUNDS` | `12` | custo do hash de senha |
| `AUTH_RATE_LIMIT` | `10` | tentativas de login/cadastro por IP por minuto |
| `ANTHROPIC_API_KEY` | (vazio → leitura simulada) | ativa a leitura real de recibos com Claude |
| `RECEIPT_PARSER` / `RECEIPT_MODEL` | automático / `claude-opus-5-5` | força `claude` ou `mock`; modelo usado |
| `RECEIPT_MAX_MB` / `RECEIPT_RATE_LIMIT` | `5` / `20` | tamanho máximo do arquivo; leituras por IP por minuto |

### PostgreSQL local com Docker

A partir da raiz, execute `docker compose up -d --wait`. Configure `DATABASE_URL=postgresql://splitgo:splitgo@localhost:5432/splitgo` em `backend/.env` e inicie a API em `backend/` com `npm run dev`.

### Migrações

Ao alterar [o esquema](backend/src/db/schema.ts), execute `npm run db:generate` em `backend/` e inclua os arquivos gerados no pull request. A API aplica as migrações ao iniciar.

## Verificações

Execute cada bloco a partir da raiz em um terminal separado, depois de instalar as dependências.

**API**

```bash
cd backend
npm run typecheck
npm test
```

**App**

```bash
cd mobile
npm run typecheck
npm run lint
```

As verificações do backend usam banco em memória. Ao abrir o pull request, descreva o que mudou e como você validou a alteração. Para mudanças visuais, inclua uma captura da tela afetada.
