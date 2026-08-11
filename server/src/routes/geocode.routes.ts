import { Router } from "express";
import * as geocodeController from "../controllers/geocode.controller";
import { loadCurrentUser } from "../middleware/loadCurrentUser";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { asyncHandler } from "../utils/asyncHandler";

export const geocodeRouter = Router();

geocodeRouter.get(
  "/search",
  requireAuth,
  asyncHandler(loadCurrentUser),
  requireRole("admin"),
  asyncHandler(geocodeController.search),
);
