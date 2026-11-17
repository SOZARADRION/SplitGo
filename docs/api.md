# Referência da API

A URL base local é `http://localhost:3333`. Para rotas autenticadas, envie o token retornado no cadastro ou login no cabeçalho `Authorization: Bearer <token>`.

## Rotas

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
| POST | `/api/receipts/parse` 🔒 | lê a foto/PDF de um recibo (ver abaixo) |

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

### Ler recibo

`POST /api/receipts/parse` recebe um `multipart/form-data` com o campo `file`,
que pode ser uma imagem JPEG, PNG, WebP ou GIF, ou um PDF, com até 5 MB. O
formato é conferido pelos bytes do arquivo, não pela extensão. A rota não grava
nada: devolve os dados para o app pré-preencher a despesa.

```bash
curl -H "Authorization: Bearer $TOKEN" -F "file=@cupom.jpg" http://localhost:3333/api/receipts/parse
```

```json
{
  "estabelecimento": "Supermercado Bom Preço",
  "data": "2026-11-13",
  "valor_total": 18642,
  "itens": [
    { "descricao": "Carvão 4kg", "quantidade": 2, "valor_unitario": 1890, "valor_total_item": 3780 }
  ],
  "fonte": "claude",
  "avisos": []
}
```

- Os valores vêm em **centavos**. O modelo devolve texto decimal e o servidor faz a
  conversão, sem ponto flutuante.
- `avisos` lista inconsistências para o usuário conferir: a soma dos itens
  diferente do total, data ilegível ou item descartado.
- **Leitor real:** com `ANTHROPIC_API_KEY` definida, usa o Claude (`claude-opus-5-5`,
  ou o modelo em `RECEIPT_MODEL`). A resposta é validada por um schema, e uma
  recusa do modelo cai automaticamente no substituto recomendado (`fallbacks: "default"`).
- **Leitor simulado:** sem a chave (ou com `RECEIPT_PARSER=mock`), a rota devolve
  recibos de exemplo, com `fonte: "simulado"`. A mesma imagem gera sempre a
  mesma resposta.
- **Limite e custo:** são 20 leituras por minuto por IP (`RECEIPT_RATE_LIMIT`),
  porque cada leitura real é paga.
- **Erros:** 415 (formato), 413 (tamanho), 422 (`NOT_A_RECEIPT`, `RECEIPT_REFUSED`,
  `RECEIPT_UNREADABLE`), 503 (serviço de IA indisponível ou ocupado).

### Erros

O corpo do erro é sempre `{ "error": "CODIGO", "message": "..." }`.

| Status | Códigos |
|---|---|
| 400 | `VALIDATION_ERROR` (com `issues`), `INVALID_PAYER`, `INVALID_SPLIT`, `INVALID_MEMBER` |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` |
| 404 | `NOT_FOUND` |
| 409 | `EMAIL_TAKEN`, `DUPLICATE_EMAIL` |
| 429 | `TOO_MANY_REQUESTS` |
