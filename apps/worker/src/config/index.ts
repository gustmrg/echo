import * as z from "zod";

const rabbitMqConfigSchema = z.object({
  url: z.url(),
  exchange: z.string().min(1),
  queue: z.string().min(1),
  routingKey: z.string().min(1),
  prefetch: z.coerce.number().int().positive().default(1),
});

export type RabbitMqConfig = z.infer<typeof rabbitMqConfigSchema>;

export function loadRabbitMqConfig(): RabbitMqConfig {
  return rabbitMqConfigSchema.parse({
    url: process.env.RABBITMQ_URL,
    exchange: process.env.RABBITMQ_EXCHANGE,
    queue: process.env.RABBITMQ_QUEUE,
    routingKey: process.env.RABBITMQ_ROUTING_KEY,
    prefetch: process.env.RABBITMQ_PREFETCH,
  });
}
