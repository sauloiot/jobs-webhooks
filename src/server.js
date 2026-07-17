import express from 'express';
import { config } from './config/env.js';
import { registry } from './config/registry.js';
import { webhooksRouter } from './routes/webhooks.js';

const app = express();
app.disable('x-powered-by');

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// Pronto quando todos os provedores registrados têm fila + segredo configurados.
app.get('/readyz', (_req, res) => {
  const missing = Object.entries(registry)
    .filter(([, entry]) => !entry.configured)
    .map(([name]) => name);
  if (missing.length > 0) {
    return res.status(503).json({ status: 'not_ready', unconfiguredProviders: missing });
  }
  return res.status(200).json({ status: 'ready' });
});

app.use('/webhooks', webhooksRouter);

// Na Vercel (preset Express, serverless) o app é exportado e o listen fica por
// conta da plataforma. Localmente/Docker subimos o servidor nós mesmos.
if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    const providers = Object.keys(registry).join(', ');
    console.log(`[jobs-webhooks] ouvindo na porta ${config.port} — provedores registrados: ${providers}`);
  });
}

export default app;
