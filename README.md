<div align="center">

![SplitGo — Despesas compartilhadas, saldos e acertos](docs/assets/splitgo-banner.svg)

**Registre os gastos do grupo e veja quem precisa pagar ou receber.**

[Começar](#início-rápido) · [Funcionalidades](#funcionalidades) · [Arquitetura](docs/architecture.md) · [Referência da API](docs/api.md)

![Expo SDK 58](https://img.shields.io/badge/Expo-SDK_58-0F172A?style=flat-square&logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-087EA4?style=flat-square&logo=react&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-047857?style=flat-square&logo=fastify&logoColor=white)

</div>

## O projeto

O SplitGo ajuda grupos a dividir despesas de viagens, repúblicas e outras situações do dia a dia. O app usa Expo para Android, iOS e web. A API calcula os saldos e sugere transferências com base nas despesas e nos pagamentos registrados.

## Funcionalidades

| Área | O que está disponível |
| --- | --- |
| Grupos | Cadastro de grupos e participantes |
| Despesas | Divisão igualitária, por valor exato, por percentual ou por pesos |
| Saldos e acertos | Saldo por participante, sugestões de transferências e registro de pagamentos |
| Recibos | Foto ou imagem do recibo preenche a despesa no app (leitura por IA, com modo simulado para desenvolvimento) |

## Início rápido

Use Node.js 24 e npm. Clone o repositório e execute os comandos abaixo a partir dele.

**Terminal 1 — API**

```bash
cd backend
npm ci
npm run dev
```

A API responde em `http://localhost:3333/health`. Por padrão, usa PGlite e guarda os dados em `backend/data/pglite`.

**Terminal 2 — App web**

```bash
cd mobile
npm ci
npm run web
```

Para executar no celular ou em um emulador, consulte o [guia do app](mobile/README.md).

## Estrutura

| Diretório | Conteúdo |
| --- | --- |
| [backend/](backend/) | API em TypeScript com Fastify, Drizzle e PostgreSQL ou PGlite |
| [mobile/](mobile/) | App para Android, iOS e web com Expo e Expo Router |
| [docs/](docs/) | Referência da API e arquitetura |

## Documentação

- [Desenvolvimento e contribuição](CONTRIBUTING.md) — configuração, Docker, migrações e verificações.
- [Referência da API](docs/api.md) — rotas, autenticação, formatos de divisão, recibos e erros.
- [Arquitetura](docs/architecture.md) — organização do código, regras de dinheiro e integridade dos dados.
- [Publicação](docs/deploy.md) — como colocar a API no ar no Render, com PostgreSQL gerenciado.

## Autor

Mantido por [Adrion Sozar](https://github.com/SOZARADRION).
