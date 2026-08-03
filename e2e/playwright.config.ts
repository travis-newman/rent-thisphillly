import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Deliberately uncommon ports, and reuseExistingServer is off below, so this
// suite never accidentally attaches to an unrelated dev server that happens
// to already be listening on a more common port (e.g. 5173/3000).
const CLIENT_PORT = 5199;
const SERVER_PORT = 4199;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run start:e2e",
      cwd: path.resolve(__dirname, "../server"),
      url: `http://localhost:${SERVER_PORT}/api/health`,
      env: {
        PORT: String(SERVER_PORT),
        CLIENT_URL: `http://localhost:${CLIENT_PORT}`,
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run dev -- --port ${CLIENT_PORT} --strictPort`,
      cwd: path.resolve(__dirname, "../client"),
      url: `http://localhost:${CLIENT_PORT}`,
      env: {
        VITE_API_URL: `http://localhost:${SERVER_PORT}/api`,
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
