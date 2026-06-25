import amqp from "amqplib";
import type { RabbitMqConfig } from "../config/index.js";
import type { RabbitMqConnection } from "./types.js";

export async function startRabbitMqConsumer(
  config: RabbitMqConfig,
): Promise<RabbitMqConnection> {
  console.log("[worker] Connecting to RabbitMQ...");

  const connection = await amqp.connect(config.url);
  const channel = await connection.createChannel();

  await channel.assertExchange(config.exchange, "direct", {
    durable: true,
  });

  await channel.assertQueue(config.queue, {
    durable: true,
  });

  return { connection, channel };
}
