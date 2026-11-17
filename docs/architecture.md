# Arquitetura

## Estrutura

```
backend/            API (Fastify + TypeScript + Drizzle + PostgreSQL)
  src/domain/       regras puras: dinheiro, divisão, saldos, simplificação de dívidas
  src/services/     regras de negócio + acesso ao banco (auth, grupos, despesas, saldos)
  src/auth/         plugin JWT + middlewares authenticate / requireGroupMember
  src/receipts/     leitor de recibos (Claude ou simulado) e normalização
  src/routes/       rotas HTTP e validação (Zod)
  src/db/           schema e conexão
  drizzle/          migrações SQL geradas
  test/             testes de domínio, autenticação e API
mobile/             App (Expo SDK 58 + Expo Router), Android, iOS e web
  src/app/          telas (cada arquivo é uma rota)
  src/auth/         sessão (contexto) e validação dos formulários
  src/lib/          cliente da API, armazenamento seguro, tema
```

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

## Integridade no banco

Além das validações da API, o PostgreSQL garante:

- valores positivos e acertos entre pessoas diferentes (CHECK);
- pagador, participantes da divisão e acertos sempre do mesmo grupo (FKs compostas);
- partes de cada despesa somando exatamente o total, verificado no COMMIT por
  triggers de restrição adiados ([`0002_expense_share_sum.sql`](../backend/drizzle/0002_expense_share_sum.sql)).

## Simplificação de dívidas

[`settle.ts`](../backend/src/domain/settle.ts): minimizar transferências equivale a particionar os
membros no maior número de subgrupos que somam zero (cada subgrupo de k pessoas
se resolve com k − 1 transferências). Para até 16 membros com saldo ≠ 0, a API
usa programação dinâmica em bitmask (solução **ótima**). Acima disso, usa o
método guloso (maior devedor → maior credor), que garante no máximo n − 1
transferências.
