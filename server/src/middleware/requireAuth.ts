import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../services/tokens";

declare global {
  // Augmenting Express's own ambient Request type requires merging into its
  // "Express" namespace — this is the standard pattern (used by @types/express
  // itself), not a case the ES2015-module alternative applies to.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.accessToken as string | undefined;
  if (!token) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired session" });
  }
}
