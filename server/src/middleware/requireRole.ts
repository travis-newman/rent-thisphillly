import type { NextFunction, Request, Response } from "express";
import type { Role } from "../models/User";

// Must run after loadCurrentUser.
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.currentUser || !roles.includes(req.currentUser.role)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    next();
  };
}
