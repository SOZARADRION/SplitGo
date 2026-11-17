# Publicar a API do SplitGo (Render)

A API é publicada no [Render](https://render.com) a partir deste repositório,
usando o arquivo [`render.yaml`](../render.yaml). Ele cria dois recursos:

| Recurso | Plano | O que é |
|---|---|---|
| `splitgo-api` | Free | A API (Node 24), publicada a cada push na `main` depois que a CI passa |
| `splitgo-db` | Free | PostgreSQL 17 gerenciado |

## Passo a passo (uma vez)

1. Crie uma conta em <https://render.com> entrando com o GitHub (conta **SOZARADRION**).
2. Em **New → Blueprint**, autorize o Render a ler o repositório **SplitGo**. O
   repositório é privado, então o Render pede para instalar o app dele no GitHub.
   Libere só este repositório.
3. Selecione o repositório SplitGo e a branch `main`. O Render lê o `render.yaml` e
   mostra os dois recursos.
4. Ele pede o valor de `ANTHROPIC_API_KEY`. É opcional: deixe em branco para usar
   a leitura de recibos simulada.
5. Clique em **Deploy Blueprint**. A primeira publicação leva alguns minutos
   (instalação, compilação e migrações do banco).
6. Ao terminar, abra `https://<nome-do-serviço>.onrender.com/health`. A resposta
   deve ser `{"service":"SplitGo API","status":"ok"}`.

O `JWT_SECRET` é gerado pelo Render e o `DATABASE_URL` é preenchido com o banco
criado. Ninguém precisa digitar segredos.

## Apontar o app para a API publicada

Crie o arquivo `mobile/.env` com o endereço do serviço:

```
EXPO_PUBLIC_API_URL=https://splitgo-api.onrender.com
```

Use o endereço que o Render mostrar e reinicie o Expo. Agora o app conversa com a
API pela internet, em qualquer rede, inclusive nos dados móveis.

Para o celular carregar o app pelo Expo Go fora da sua rede Wi-Fi, use também
o modo túnel do Expo: `npx expo start --tunnel`.

## Conferir o IP real dos usuários

O limite de tentativas de login vale por IP. Atrás do balanceador do Render, a API
usa `TRUST_PROXY=1` para enxergar o IP de quem acessa. O Render não documenta
quantos proxies existem no caminho, então confira uma vez:

1. Faça login pelo app (ou pelo navegador, em `/health`).
2. Em **splitgo-api → Logs**, procure `"remoteAddress"` nas linhas `incoming request`.
3. Deve aparecer **o seu IP público**, e não um endereço interno como `10.x.x.x`.
   Se aparecer um interno, aumente `TRUST_PROXY` para `2` em
   **Environment** e confira de novo.

## Limites do plano gratuito

- **A API "dorme"** após 15 minutos sem uso. A primeira requisição depois disso
  leva cerca de 1 minuto. Com o plano pago mais simples, ela fica sempre ligada.
- **O banco gratuito expira em 30 dias.** Depois disso há 14 dias para mudar para um
  plano pago, ou o Render apaga o banco e os dados. Para uso real, antes do prazo:
  - mude o `splitgo-db` para um plano pago no painel do Render; **ou**
  - use um PostgreSQL gratuito permanente de outro provedor (ex.: Neon): crie o
    banco lá e troque o `DATABASE_URL` do serviço pela URL dele, com
    `?sslmode=require`.
- 1 GB de armazenamento, sem backups automáticos.

## Variáveis de ambiente

Veja a tabela completa em [CONTRIBUTING.md](../CONTRIBUTING.md#configuração-da-api).
Em produção:

- `DATABASE_URL` e `JWT_SECRET` (≥ 32 caracteres) são **obrigatórias**. Sem elas a
  API se recusa a iniciar.
- `CORS_ORIGINS` (opcional) limita quais sites podem chamar a API, por exemplo
  `https://app.splitgo.com`. O app de celular não depende disso.
- `TRUST_PROXY` é o número de proxies confiáveis à frente da API.

## Publicar em outro provedor

Nada no código depende do Render. Qualquer serviço com Node 24 e PostgreSQL funciona
com estes comandos e variáveis (pasta `backend/`):

```bash
npm ci --include=dev && npm run build   # compilação
npm start                               # execução (lê PORT do ambiente)
```
