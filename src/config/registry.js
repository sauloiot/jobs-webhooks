// Registry de provedores de webhook — mesma filosofia do PaymentGatewayRegistry
// do jobs-api: adicionar um provedor = adicionar uma entrada aqui; o handler
// genérico em routes/webhooks.js não muda.
//
// Cada entrada:
//   queueUrl        fila SQS FIFO do domínio dono do webhook
//   messageGroupId  grupo FIFO (preserva a ordem de entrega do provedor)
//   forwardHeaders  headers repassados no envelope (o consumidor REVALIDA a auth)
//   verify          estratégia de autenticação na borda (401 se falhar)
//   dedupeId        extrai o id do evento para MessageDeduplicationId
//   configured      pré-condições de config atendidas (usado pelo /readyz)
import { createHash } from 'node:crypto';
import { config } from './env.js';
import { headerToken } from '../core/verify/headerToken.js';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Extrai `id` do JSON sem nunca re-serializar o body (o corpo segue opaco;
 * esta é a única leitura permitida). Fallback: hash do conteúdo — eventos
 * idênticos continuam deduplicando mesmo sem id parseável.
 */
function jsonIdOrContentHash(rawBody) {
  try {
    const id = JSON.parse(rawBody.toString('utf8'))?.id;
    if (id) {
      return String(id);
    }
  } catch {
    // corpo não-JSON ou malformado — cai no hash
  }
  return sha256(rawBody);
}

export const registry = {
  asaas: {
    queueUrl: config.asaas.billingQueueUrl,
    messageGroupId: 'asaas',
    forwardHeaders: ['asaas-access-token'],
    verify: headerToken('asaas-access-token', config.asaas.webhookToken),
    dedupeId: jsonIdOrContentHash,
    configured: Boolean(config.asaas.billingQueueUrl && config.asaas.webhookToken),
  },
};
