import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { config } from '../config/env.js';

const sqs = new SQSClient({
  region: config.sqs.region,
  ...(config.sqs.endpointOverride ? { endpoint: config.sqs.endpointOverride } : {}),
});

/**
 * Envelopa o webhook e publica na fila FIFO do provedor.
 *
 * Contrato do envelope (ver CONTRACT.md): o body é repassado como a STRING CRUA
 * recebida — nunca parseado-e-reserializado — para que assinaturas HMAC de
 * provedores futuros continuem verificáveis no consumidor byte a byte.
 */
export async function relay(provider, entry, req) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  const headers = {};
  for (const name of entry.forwardHeaders) {
    const value = req.get(name);
    if (value !== undefined) {
      headers[name.toLowerCase()] = value;
    }
  }

  const envelope = {
    provider,
    receivedAt: new Date().toISOString(),
    headers,
    body: rawBody.toString('utf8'),
  };

  await sqs.send(new SendMessageCommand({
    QueueUrl: entry.queueUrl,
    MessageBody: JSON.stringify(envelope),
    MessageGroupId: entry.messageGroupId,
    // SQS limita a 128 chars; ids do Asaas (evt_...) cabem com folga.
    MessageDeduplicationId: entry.dedupeId(rawBody).slice(0, 128),
  }));
}
