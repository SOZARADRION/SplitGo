# SplitGo

SplitGo ajuda grupos a dividir despesas, acompanhar saldos e registrar acertos. É voltado a viagens, repúblicas, casais e outros grupos que compartilham gastos.

- Divisão igualitária, por valor exato, por percentual ou por pesos.
- Saldos por participante e sugestões de transferências para acertar as contas.
- API para ler recibos em imagem ou PDF, com modo simulado para desenvolvimento.

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
