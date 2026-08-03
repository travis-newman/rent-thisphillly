import { createApp } from "./app";
import { connectDB } from "./config/db";
import { env } from "./config/env";

async function main(): Promise<void> {
  await connectDB();

  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`Server listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
