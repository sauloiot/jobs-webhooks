import { Router, raw } from 'express';
import { registry } from '../config/registry.js';
import { relay } from '../core/relay.js';

export const webhooksRouter = Router();

// express.raw() em vez de express.json(): o corpo chega como Buffer com os
// bytes exatos da requisição — pré-requisito para validar HMAC de provedores
// futuros e para o relay repassar o body sem re-serializar.
webhooksRouter.post('/:provider', raw({ type: () => true, limit: '1mb' }), async (req, res) => {
  const provider = String(req.params.provider).toLowerCase();
  const entry = registry[provider];

  if (!entry) {
    return res.status(404).end();
  }
  if (!entry.verify(req)) {
    console.warn(`[webhooks] ${provider}: autenticação recusada`);
    return res.status(401).end();
  }

  try {
    await relay(provider, entry, req);
    return res.status(200).end();
  } catch (err) {
    // 500 → o provedor reenvia (Asaas: fila sequencial com retry).
    console.error(`[webhooks] ${provider}: falha ao publicar no SQS —`, err?.message ?? err);
    return res.status(500).end();
  }
});
