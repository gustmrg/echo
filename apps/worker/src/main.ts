import "dotenv/config";
import { loadRabbitMqConfig } from "./config/index.js";
import { startRabbitMqConsumer } from "./messaging/consumer.js";

async function main(): Promise<void> {
  console.log("[worker] Starting...");

  const rabbitMqConfig = loadRabbitMqConfig();
  await startRabbitMqConsumer(rabbitMqConfig);

  // register consumers
  // wait for shutdown signal
}

main().catch((error) => {
  console.error("[worker] Fatal startup error:", error);
  process.exit(1);
});
