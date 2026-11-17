# SplitGo para Android, iOS e web

O app usa Expo e Expo Router. As telas ficam em [src/app/](src/app/).

## Executar localmente

Inicie a API em outro terminal seguindo o [guia da raiz](../README.md#início-rápido). Neste diretório (`mobile/`), instale as dependências com `npm ci` e escolha como abrir o app.

| Comando | Onde abre |
| --- | --- |
| `npm run web` | Navegador |
| `npm start` | Servidor do Expo com QR code |
| `npm run android` | Emulador Android ou dispositivo conectado |
| `npm run ios` | Simulador iOS (macOS) |

Para usar o Expo Go em um celular, conecte o aparelho e o computador à mesma rede e leia o QR code.

## Telas

| Tela | Arquivo | O que faz |
| --- | --- | --- |
| Entrar / Criar conta | [sign-in.tsx](src/app/sign-in.tsx), [sign-up.tsx](src/app/sign-up.tsx) | Login e cadastro; sem sessão, o app abre aqui |
| Meus grupos | [(app)/index.tsx](src/app/(app)/index.tsx) | Lista os grupos e cria um novo |
| Novo grupo | [(app)/groups/new.tsx](src/app/(app)/groups/new.tsx) | Nome do grupo e participantes (nome e e-mail opcional) |
| Resumo do grupo | [(app)/groups/[groupId]/index.tsx](src/app/(app)/groups/[groupId]/index.tsx) | Total gasto, seu saldo, saldo de cada pessoa, transferências sugeridas ("Marcar como pago") e despesas |
| Nova despesa | [(app)/groups/[groupId]/new-expense.tsx](src/app/(app)/groups/[groupId]/new-expense.tsx) | Descrição, valor, quem pagou, divisão igual ou por valores e leitura de recibo pela câmera ou galeria |
| Adicionar participante | [(app)/groups/[groupId]/add-member.tsx](src/app/(app)/groups/[groupId]/add-member.tsx) | Inclui alguém em um grupo existente |

No celular, a foto do recibo é convertida para JPEG e reduzida antes do envio (o iPhone salva em HEIC, que a API não aceita).

## Endereço da API

O app tenta usar o mesmo host do servidor do Expo na porta `3333`. Se precisar informar o endereço manualmente, adicione `EXPO_PUBLIC_API_URL=http://192.168.1.10:3333` ao arquivo `mobile/.env`, substitua o IP pelo do computador que executa a API e reinicie o Expo. Variáveis com o prefixo `EXPO_PUBLIC_` ficam disponíveis no app.

## Verificações

```bash
npm run typecheck
npm run lint
```
