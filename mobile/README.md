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

## Endereço da API

O app tenta usar o mesmo host do servidor do Expo na porta `3333`. Se precisar informar o endereço manualmente, adicione `EXPO_PUBLIC_API_URL=http://192.168.1.10:3333` ao arquivo `mobile/.env`, substitua o IP pelo do computador que executa a API e reinicie o Expo. Variáveis com o prefixo `EXPO_PUBLIC_` ficam disponíveis no app.

## Verificações

```bash
npm run typecheck
npm run lint
```
