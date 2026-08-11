import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth.routes";
import { buildingsRouter } from "./routes/buildings.routes";
import { geocodeRouter } from "./routes/geocode.routes";
import { neighborhoodsRouter } from "./routes/neighborhoods.routes";
import { regionsRouter } from "./routes/regions.routes";
import { testRouter } from "./routes/test.routes";
import { usersRouter } from "./routes/users.routes";

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", authRouter);
  app.use("/api/buildings", buildingsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/regions", regionsRouter);
  app.use("/api/neighborhoods", neighborhoodsRouter);
  app.use("/api/geocode", geocodeRouter);

  if (env.NODE_ENV === "test") {
    app.use("/api/test", testRouter);
  }

  app.use(errorHandler);

  return app;
}
