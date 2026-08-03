import { MongoMemoryServer } from "mongodb-memory-server";

// Boots the API against an in-memory MongoDB instance so the Playwright
// suite (see e2e/playwright.config.ts) doesn't depend on a real database or
// SMTP account. Env vars are set before importing app modules since
// src/config/env.ts validates process.env at import time.
async function main(): Promise<void> {
  const mongod = await MongoMemoryServer.create();

  process.env.MONGO_URI = mongod.getUri();
  process.env.NODE_ENV = "test";
  process.env.PORT ||= "4100";
  process.env.CLIENT_URL ||= "http://localhost:5174";
  process.env.JWT_ACCESS_SECRET ||= "e2e-access-secret";
  process.env.JWT_REFRESH_SECRET ||= "e2e-refresh-secret";
  process.env.SMTP_HOST ||= "smtp.test.local";
  process.env.SMTP_PORT ||= "587";
  process.env.SMTP_USER ||= "e2e-user";
  process.env.SMTP_PASS ||= "e2e-pass";
  process.env.SMTP_FROM ||= "Base App <no-reply@example.com>";

  const { createApp } = await import("../src/app");
  const { connectDB } = await import("../src/config/db");
  const { env } = await import("../src/config/env");

  await connectDB();

  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`E2E server listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start e2e server:", err);
  process.exit(1);
});
