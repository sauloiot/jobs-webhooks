import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Estratégia de verificação por assinatura HMAC sobre o corpo CRU da requisição
 * (bytes exatamente como recebidos — por isso as rotas usam express.raw() e o
 * relay nunca re-serializa o body). Para provedores futuros como PagarMe/Stripe.
 *
 * @param headerName header que carrega a assinatura (ex.: 'x-hub-signature-256')
 * @param secret segredo compartilhado do provedor
 * @param options.algorithm algoritmo do HMAC (default sha256)
 * @param options.encoding encoding da assinatura esperada (default hex)
 * @param options.prefix prefixo do header (ex.: 'sha256=' no padrão GitHub)
 */
export function hmacSignature(headerName, secret, { algorithm = 'sha256', encoding = 'hex', prefix = '' } = {}) {
  return (req) => {
    const received = req.get(headerName);
    if (!received || !secret || !Buffer.isBuffer(req.body)) {
      return false;
    }
    const expected = prefix + createHmac(algorithm, secret).update(req.body).digest(encoding);
    const a = Buffer.from(received, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  };
}
