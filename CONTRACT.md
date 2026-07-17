# CONTRACT — jobs-webhooks ⇄ consumidores

Contrato entre o gateway de webhooks e as APIs que consomem as filas.
Este documento é a fonte de verdade: se o serviço for reescrito (ex.: em Go),
a implementação nova deve honrar exatamente o que está aqui.

## Papel do serviço

O `jobs-webhooks` é uma **borda burra**: recebe webhooks de provedores externos,
autentica na entrada, envelopa e publica na fila SQS do domínio. Ele **nunca**
interpreta o conteúdo nem muda estado — quem lê o body e processa é a API dona
da fila (hoje: `jobs-api`, módulo de billing).

```
Provedor (Asaas...) ──POST──► jobs-webhooks ──SendMessage──► SQS FIFO ──► jobs-api (consumidor)
                         401 se auth falhar         │
                         200 rápido                 └─ evento espera se o consumidor estiver offline
```

## Rota

`POST /webhooks/{provider}` — `provider` em minúsculas (ex.: `asaas`).

| Resposta | Quando |
|---|---|
| `200` | autenticado e publicado na fila |
| `401` | autenticação do provedor falhou (token/assinatura) |
| `404` | provider não registrado no registry |
| `500` | falha ao publicar no SQS (o provedor fará retry) |

## Envelope (MessageBody da mensagem SQS)

```json
{
  "provider": "asaas",
  "receivedAt": "2026-06-23T12:34:56.789Z",
  "headers": {
    "asaas-access-token": "<token recebido do provedor>"
  },
  "body": "<STRING CRUA do corpo recebido — nunca re-serializada>"
}
```

Regras invariantes:

1. **`body` é opaco.** O gateway repassa os bytes recebidos como string UTF-8,
   sem parse-e-reserialize. Motivo: provedores futuros assinam o corpo com HMAC
   sobre os bytes crus; qualquer re-serialização quebraria a verificação no
   consumidor. A única leitura permitida do body no gateway é extrair `body.id`
   para o `MessageDeduplicationId` (com fallback para SHA-256 do conteúdo).
2. **`headers` carrega só os `forwardHeaders`** do provedor (hoje, para o Asaas:
   `asaas-access-token`), com nomes em minúsculas.
3. **Validação em duas camadas (decisão explícita):** o gateway valida a auth
   NA BORDA (mantém spam/lixo fora da fila) e o consumidor **REVALIDA** os
   headers do envelope — ele não confia cegamente no transporte. O pipeline do
   consumidor fica idêntico ao caminho HTTP direto.

## Filas

| Domínio | Fila | Tipo | MessageGroupId | Dedup |
|---|---|---|---|---|
| Billing (Asaas) | `joblly-billing-webhooks-dev.fifo` | FIFO | `asaas` | `MessageDeduplicationId` = id do evento (`evt_...`) ou SHA-256 do body |

- **FIFO obrigatória**: o Asaas entrega sequencialmente (`PAYMENT_CREATED` antes
  de `PAYMENT_RECEIVED`); a fila preserva essa ordem por `MessageGroupId`.
- Entrega é *at-least-once*: o consumidor DEVE ser idempotente (o `jobs-api` já
  deduplica por `(provider, provider_event_id)` na tabela `billing_webhook_event`).

## Comportamento exigido do consumidor (jobs-api)

1. Parsear o envelope; extrair `provider`, `headers`, `body`.
2. Entregar ao mesmo funil do webhook HTTP: `parseWebhook(body, headers)` →
   revalida o token → normaliza → `WebhookProcessingService.process(...)`.
3. **Deletar a mensagem** da fila:
   - após processar com sucesso;
   - também em falha de **autenticação** ou **parse** (poison pill — em fila
     FIFO uma mensagem retida bloqueia todo o `MessageGroupId`; loga ERROR e
     descarta).
4. **Não deletar** em erro transiente (ex.: banco fora) — visibility timeout
   fará a redelivery, e a idempotência absorve o reprocessamento.

## Variáveis de ambiente (gateway)

| Variável | Default | Obrigatória |
|---|---|---|
| `PORT` | `8083` | não |
| `ASAAS_WEBHOOK_TOKEN` | — | **sim** (mesmo valor do painel Asaas e do jobs-api) |
| `ASAAS_BILLING_QUEUE_URL` | — | **sim** (URL da FIFO de billing) |
| `SQS_REGION` | `us-east-1` | não |
| `SQS_ENDPOINT_OVERRIDE` | vazio | só LocalStack/endpoint custom |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | — | sim em dev (mesmo IAM user do jobs-api, que já tem SQS:*) |
| `LOG_LEVEL` | `info` | não |

## Rotação do token do Asaas

O token vive em **3 lugares que precisam mudar em sincronia**:

1. Painel do Asaas (Integrações → Webhooks);
2. `ASAAS_WEBHOOK_TOKEN` do `jobs-webhooks`;
3. `asaas.webhook.token` do `jobs-api` (env `ASAAS_WEBHOOK_TOKEN` em prod).

Fora de sincronia: a borda responde 401 (Asaas acumula falhas e pausa a fila
após 15 consecutivas) ou o consumidor descarta com ERROR no log.

## Adicionando um provedor novo

1. Nova entrada no `src/config/registry.js` (fila própria do domínio,
   `messageGroupId`, `forwardHeaders`, estratégia `verify` — `headerToken` ou
   `hmacSignature` — e `dedupeId`).
2. Criar a fila FIFO do domínio.
3. Implementar o consumidor na API dona do domínio, honrando a seção
   "Comportamento exigido do consumidor".

Nenhuma mudança no handler genérico é necessária.
