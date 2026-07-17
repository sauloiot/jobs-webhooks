# jobs-webhooks

Gateway de webhooks do Joblly. Recebe webhooks de provedores externos (Asaas,
futuramente PagarMe/PagBank etc.), autentica na borda e publica em filas SQS
FIFO — as APIs donas de cada domínio consomem (hoje: `jobs-api`, billing).

Motivação: webhooks precisam de uma URL pública **estável e sempre de pé**. Com
a fila no meio, o provedor nunca vê indisponibilidade (a borda responde 200
mesmo com a API fora), e os eventos esperam no SQS até o consumidor processar —
inclusive quando a API é o localhost de um dev.

O contrato do envelope/filas está em [CONTRACT.md](CONTRACT.md) — leia antes de
mexer no formato ou escrever um consumidor.

## Pré-requisitos

- Node 22+
- Fila SQS FIFO do domínio (ex.: `joblly-billing-webhooks-dev.fifo`)
- Credenciais AWS com permissão SQS (mesmo IAM user do `jobs-api`)

## Variáveis de ambiente

| Variável | Default | Obrigatória |
|---|---|---|
| `PORT` | `8083` | não |
| `ASAAS_WEBHOOK_TOKEN` | — | **sim** (mesmo valor cadastrado no painel Asaas) |
| `ASAAS_BILLING_QUEUE_URL` | — | **sim** (URL da FIFO de billing) |
| `SQS_REGION` | `us-east-1` | não |
| `SQS_ENDPOINT_OVERRIDE` | vazio | só pra LocalStack ou endpoint custom |
| `AWS_ACCESS_KEY_ID` | — | sim, em dev (credencial estática) |
| `AWS_SECRET_ACCESS_KEY` | — | sim, em dev (credencial estática) |
| `LOG_LEVEL` | `info` | não |

## Endpoints

- `POST /webhooks/{provider}` — recebe o webhook do provedor (ex.: `/webhooks/asaas`).
  200 publicado · 401 auth falhou · 404 provedor desconhecido · 500 falha no SQS (provedor reenvia).
- `GET /healthz` — liveness.
- `GET /readyz` — 200 se todos os provedores registrados têm fila + segredo configurados; 503 caso contrário.

## Configuração via arquivos `.env`

Mesmo esquema do `jobs-websocket` (inspirado nos perfis do Spring). Carrega do
diretório de trabalho, nesta ordem (variáveis já presentes no shell sempre vencem):

1. `.env.<APP_ENV>` — perfil específico, carregado primeiro (sobrescreve)
2. `.env` — defaults gerais

Arquivos versionados:
- [`.env.example`](.env.example) — template, copie pra `.env` e preencha

O arquivo real `.env` (com segredos) está no `.gitignore` e não vai pro repo.

## Rodando localmente

```bash
npm install
cp .env.example .env
# edite .env: ASAAS_WEBHOOK_TOKEN, ASAAS_BILLING_QUEUE_URL, AWS keys

npm run dev     # com watch
# ou
npm start
```

Teste rápido sem tocar no SQS:

```bash
curl -i http://localhost:8083/healthz                      # 200 ok
curl -i -X POST http://localhost:8083/webhooks/desconhecido  # 404
curl -i -X POST http://localhost:8083/webhooks/asaas \
  -H 'asaas-access-token: token-errado' -d '{}'             # 401
```

Com fila e token reais configurados, um POST autenticado publica o envelope na
FIFO e o `jobs-api` (com `billing.webhook.relay.enabled=true`) consome e processa.

## Docker

```bash
docker build -t jobs-webhooks .
docker run --rm -p 8083:8083 --env-file .env jobs-webhooks
```

## Adicionando um provedor

Uma entrada nova em [`src/config/registry.js`](src/config/registry.js) (fila,
`messageGroupId`, `forwardHeaders`, estratégia de verificação e `dedupeId`) —
o handler genérico não muda. Estratégias prontas em `src/core/verify/`:
`headerToken` (token compartilhado em header, ex. Asaas) e `hmacSignature`
(assinatura HMAC sobre o corpo cru, ex. padrão GitHub/Stripe).
