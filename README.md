# SplitGo — MVP, Etapas 1 e 2

API Node.js 24 + Express 5, validação Zod e PostgreSQL via driver `pg`. O domínio financeiro usa TypeScript sem dependências e roda com a remoção nativa de tipos do Node 24. Recibos e frontend ficam para as próximas etapas.

## Continuar em outro computador

Com Git e Node.js 24 ou superior instalados, autentique-se no GitHub com a conta SOZARADRION e execute:

```powershell
git clone https://github.com/SOZARADRION/SplitGo.git
cd SplitGo
npm ci
npm test
$env:SPLITGO_STORAGE = 'memory'
npm start
```

Abra a pasta clonada no Codex para continuar o desenvolvimento. As Etapas 1 e 2 estão implementadas; a próxima etapa planejada é o leitor de recibos, seguida pelo frontend. O código e as instruções estão versionados; dados locais, `.env` e dependências não são enviados ao GitHub.

Antes de trabalhar em outro computador, salve e envie suas alterações:

```powershell
git add .
git commit -m "Descreva as alterações"
git push
```

No outro computador, execute `git pull --ff-only` antes de começar, com a cópia local sem alterações pendentes.

## Executar

```powershell
npm ci
$env:SPLITGO_STORAGE = 'memory'
npm start
```

API: `http://127.0.0.1:3001`. Memória é um modo de demonstração: os dados são perdidos ao reiniciar. Não requer banco.

Para persistência PostgreSQL, com Docker instalado:

```powershell
Copy-Item .env.example .env
docker compose up -d --wait
Remove-Item Env:SPLITGO_STORAGE -ErrorAction SilentlyContinue
npm run db:deploy
npm start
```

Também é possível usar PostgreSQL 17 existente, configurando DATABASE_URL no `.env`. A migration é transacional, verifica checksum e pode ser executada novamente. `npm run dev` ativa recarga automática. PORT e HOST são configuráveis; o padrão é 127.0.0.1:3001.

Não há autenticação nesta etapa: qualquer cliente com acesso ao servidor pode consultar e alterar grupos. Uso atual para desenvolvimento local; autenticação e autorização são necessárias antes de disponibilização pública.

## Rotas

| Método | Rota | Resultado |
| --- | --- | --- |
| GET | /health | Estado do processo SplitGo, sem verificar banco |
| POST | /groups | Cria grupo BRL com 1 a 100 participantes |
| GET | /groups/:groupId | Grupo, participantes e despesas com cotas |
| POST | /groups/:groupId/members | Adiciona participante por nome/e-mail |
| POST | /groups/:groupId/expenses | Registra despesa com rateio EQUAL ou CUSTOM |
| GET | /groups/:groupId/summary | Totais individuais, saldos e transferências simplificadas |

Usar `Content-Type: application/json`. IDs são UUIDs retornados pela API. Valores são strings de centavos inteiros nas requisições e respostas: `"12000"` representa R$ 120,00. Não usar ponto flutuante para dinheiro.

Criar grupo (`POST /groups`):

```json
{
  "name": "Viagem de férias",
  "members": [{ "name": "Ana", "email": "ana@example.com" }, { "name": "Bruno" }, { "name": "Carla" }]
}
```

Adicionar participante (`POST /groups/:groupId/members`):

```json
{ "name": "Daniel", "email": "daniel@example.com" }
```

Divisão igual (`POST /groups/:groupId/expenses`). Substituir os identificadores abaixo pelos UUIDs retornados:

```json
{
  "description": "Jantar",
  "totalCents": "12000",
  "payerId": "UUID_ANA",
  "splitMode": "EQUAL",
  "memberIds": ["UUID_ANA", "UUID_BRUNO", "UUID_CARLA"]
}
```

Divisão personalizada, na mesma rota:

```json
{
  "description": "Táxi",
  "totalCents": "3000",
  "payerId": "UUID_BRUNO",
  "splitMode": "CUSTOM",
  "shares": [
    { "memberId": "UUID_ANA", "amountCents": "1000" },
    { "memberId": "UUID_CARLA", "amountCents": "2000" }
  ]
}
```

O pagador pode não participar do rateio. Cotas são não negativas e devem somar exatamente o total. IDs duplicados e membros de outros grupos são rejeitados. E-mails são normalizados e únicos dentro do grupo. Valor por despesa: 1 a 9223372036854775807 centavos.

O extrato retorna `totalExpenseCents`, `members` com `paidCents`, `owedCents`, `balanceCents`, e os campos `transfers` e `optimal`. Saldo positivo recebe; negativo paga. No jantar isolado, Ana recebe 8000; Bruno e Carla pagam 4000 cada. Transferências usam `fromMemberId`, `toMemberId`, `amountCents`.

Erros: `{ "error": { "code": "...", "message": "SplitGo: ..." } }`. Status 400 para JSON malformado, 404 para recurso/rota inexistente, 409 para e-mail duplicado, 413 para corpo acima de 64 KB, 422 para dados inválidos e 500 para falhas internas sem expor detalhes.

## Arquitetura e dados

- `src/api/app.mjs`: rotas, validação, serialização e erros.
- `src/domain/accounting.ts`: divisão igual, saldos e simplificação, sem dependências de HTTP ou banco.
- `src/persistence/postgres.mjs`: consultas parametrizadas, transações e bloqueio por grupo.
- `src/persistence/memory.mjs`: demonstração e testes isolados.
- `src/server.mjs`: configuração e ciclo de vida.
- `scripts/migrate.mjs`: migration transacional com checksum e bloqueio de execução concorrente.

User 1:N GroupMember; Group 1:N GroupMember/Expense/Settlement; Expense 1:N ExpenseShare. Um participante pode existir sem conta. Chaves compostas impedem pagador e cotistas de outros grupos. Settlement está reservado para futura confirmação de quitações: a API atual apenas sugere pagamentos, sem executá-los ou registrá-los.

O saldo é calculado a partir dos lançamentos. Criar grupo/membros e criar despesa/cotas são operações atômicas. Escritas bloqueiam a linha do grupo e leituras usam snapshot consistente. CHECKs validam valores; triggers diferidos verificam a soma das cotas no commit.

`db/001_initial.sql` e `prisma/constraints.sql` são a fonte executável do banco. `prisma/schema.prisma` permanece como referência conceitual do modelo inicial; defaults, datas e restrições adicionais estão no SQL. Não usar `prisma migrate`; o backend não depende da CLI ou do cliente Prisma.

Não inserir quitações manualmente: o extrato HTTP atual considera apenas despesas, pois não há confirmação de pagamentos nesta etapa. O domínio já aceita pagamentos em `calculateBalances(memberIds, expenses, settlements)` para futura extensão: saldo = despesas pagas − cotas + quitações enviadas − quitações recebidas.

## Simplificação

`simplifyDebts(balances)` retorna `{ transfers, optimal }` sem alterar a entrada. Exige IDs únicos e soma zero e pressupõe que qualquer membro possa pagar qualquer outro do grupo.

Até **12 membros com saldo não nulo**, programação dinâmica encontra a partição com o máximo de subconjuntos de soma zero. Um componente conectado de k pessoas exige no mínimo k−1 transferências; maximizar componentes minimiza transferências. O pareamento dentro dos componentes reconstrói a solução ótima. Custo O(3^n) em tempo e O(2^n) em memória.

Acima desse limite, o guloso produz no máximo n−1 transferências e retorna **optimal: false**, sem garantir mínimo absoluto. Exigir mínimo absoluto para grupos maiores requer solver exato com execução assíncrona e limites definidos.

A divisão igual distribui o resto de centavos na ordem estável dos IDs. Todos os cálculos usam bigint.

## Verificação e limites

```powershell
npm test
```

Testes de domínio e HTTP real com repositório em memória cobrem grupos, participantes, despesas iguais/personalizadas, extrato, conservação de dinheiro, entradas inválidas e ausência de escritas parciais. A otimização é comparada com um algoritmo independente em 100 grupos pequenos.

O ambiente desta entrega não possui PostgreSQL/Docker disponível. Migration e adaptador PostgreSQL precisam de execução de integração em um ambiente com banco. O modo memória e os testes HTTP podem ser executados imediatamente. Recibos, frontend e autenticação ainda não estão implementados.

Para habilitar o teste de integração real, configure `TEST_DATABASE_URL` e execute `npm test`. O teste cria e remove seu próprio schema, verifica persistência, chaves estrangeiras e rollback de uma divisão inválida. Sem essa variável, ele aparece como ignorado. O usuário de teste precisa de permissão para criar schemas.
