// Carregamento de configuração inspirado nos perfis do Spring (mesmo esquema do
// jobs-websocket): variáveis já presentes no shell sempre vencem; depois
// .env.<APP_ENV> (perfil), por fim .env (defaults). dotenv não sobrescreve
// variáveis já definidas, então a ordem de carga implementa a precedência.
import dotenv from 'dotenv';

const appEnv = process.env.APP_ENV;
if (appEnv) {
  dotenv.config({ path: `.env.${appEnv}` });
}
dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 8083),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  sqs: {
    region: process.env.SQS_REGION ?? 'us-east-1',
    // Só para LocalStack ou endpoint custom; vazio = AWS real.
    endpointOverride: process.env.SQS_ENDPOINT_OVERRIDE || undefined,
  },
  asaas: {
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN ?? '',
    billingQueueUrl: process.env.ASAAS_BILLING_QUEUE_URL ?? '',
  },
};
