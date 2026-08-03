import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ message: "Invalid request", issues: err.issues });
    return;
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  console.error(err);
  res.status(500).json({ message });
}
