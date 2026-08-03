import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../services/tokens";

declare global {
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
