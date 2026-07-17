// Ferramenta de ops: espia (e opcionalmente consome) mensagens da fila de billing.
// Uso:  node scripts/peek-queue.mjs [--delete]
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';

const queueUrl = process.env.ASAAS_BILLING_QUEUE_URL
  ?? 'https://sqs.us-east-1.amazonaws.com/713881829449/joblly-billing-webhooks-dev.fifo';
const shouldDelete = process.argv.includes('--delete');

const client = new SQSClient({ region: process.env.SQS_REGION ?? 'us-east-1' });

const attrs = await client.send(new GetQueueAttributesCommand({
  QueueUrl: queueUrl,
  AttributeNames: ['ApproximateNumberOfMessages', 'QueueArn'],
}));
console.log('Fila:', attrs.Attributes.QueueArn);
console.log('Mensagens (aprox):', attrs.Attributes.ApproximateNumberOfMessages);

const { Messages } = await client.send(new ReceiveMessageCommand({
  QueueUrl: queueUrl,
  MaxNumberOfMessages: 10,
  WaitTimeSeconds: 5,
}));

for (const m of Messages ?? []) {
  console.log('---');
  console.log('MessageId:', m.MessageId);
  console.log('Body:', m.Body);
  if (shouldDelete) {
    await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: m.ReceiptHandle }));
    console.log('(deletada)');
  }
}
if (!Messages?.length) {
  console.log('(fila vazia)');
}
