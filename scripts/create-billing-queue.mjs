// One-off: cria a fila FIFO de webhooks de billing (equivalente a `aws sqs create-queue`).
// CreateQueue é idempotente para atributos iguais — rodar de novo não duplica.
import { SQSClient, CreateQueueCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';

const client = new SQSClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const { QueueUrl } = await client.send(new CreateQueueCommand({
  QueueName: 'joblly-billing-webhooks-dev.fifo',
  Attributes: {
    FifoQueue: 'true',
    ContentBasedDeduplication: 'false',      // dedup explícito via MessageDeduplicationId (id do evento)
    MessageRetentionPeriod: '1209600',       // 14 dias — eventos esperam a app local subir
    VisibilityTimeout: '60',
    ReceiveMessageWaitTimeSeconds: '20',     // long polling por padrão
  },
}));

console.log('QueueUrl:', QueueUrl);

const attrs = await client.send(new GetQueueAttributesCommand({
  QueueUrl,
  AttributeNames: ['QueueArn', 'FifoQueue'],
}));
console.log('QueueArn:', attrs.Attributes.QueueArn);
