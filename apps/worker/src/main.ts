async function start(): Promise<void> {
  console.log("[worker] Worker is running.");
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] Received ${signal}. Shutting down...`);

  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

start().catch((error) => {
  console.error("[worker] Fatal startup error:", error);
  process.exit(1);
});