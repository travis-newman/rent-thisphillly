import type { HydratedDocument } from "mongoose";
import type { NextFunction, Request, Response } from "express";
import { UserModel, type User } from "../models/User";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: HydratedDocument<User>;
    }
  }
}

// Loads the full user document for req.userId (set by requireAuth) so route
// handlers can check role/status. Looked up fresh on every request rather
// than trusted from the JWT, so a role change or suspension by an admin
// takes effect on the user's very next request instead of waiting for their
// access token to expire.
export async function loadCurrentUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await UserModel.findById(req.userId);
  if (!user) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }
  if (user.status === "suspended") {
    res.status(403).json({ message: "Account suspended" });
    return;
  }
  req.currentUser = user;
  next();
}
