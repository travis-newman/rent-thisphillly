import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth.routes";
import { testRouter } from "./routes/test.routes";

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", authRouter);

  if (env.NODE_ENV === "test") {
    app.use("/api/test", testRouter);
  }

  app.use(errorHandler);

  return app;
}
