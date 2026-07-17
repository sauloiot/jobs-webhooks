import { timingSafeEqual } from 'node:crypto';

/**
 * Estratégia de verificação por token compartilhado em header (ex.: Asaas envia
 * o token cadastrado no painel em `asaas-access-token`). Comparação em tempo
 * constante para não vazar o token por timing attack.
 *
 * Retorna uma função (req) => boolean usada pelo registry.
 */
export function headerToken(headerName, expectedToken) {
  return (req) => {
    const received = req.get(headerName);
    if (!received || !expectedToken) {
      return false;
    }
    const a = Buffer.from(received, 'utf8');
    const b = Buffer.from(expectedToken, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  };
}
