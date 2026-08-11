import { Router } from "express";
import * as regionsController from "../controllers/regions.controller";
import { loadCurrentUser } from "../middleware/loadCurrentUser";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { asyncHandler } from "../utils/asyncHandler";

export const regionsRouter = Router();

regionsRouter.get("/", asyncHandler(regionsController.list));
regionsRouter.get("/:id", asyncHandler(regionsController.getById));

const requireAdmin = [requireAuth, asyncHandler(loadCurrentUser), requireRole("admin")];

regionsRouter.post("/", ...requireAdmin, asyncHandler(regionsController.create));
regionsRouter.patch("/:id", ...requireAdmin, asyncHandler(regionsController.update));
regionsRouter.delete("/:id", ...requireAdmin, asyncHandler(regionsController.remove));

regionsRouter.post(
  "/:id/photos/presign",
  ...requireAdmin,
  asyncHandler(regionsController.presignPhoto),
);
regionsRouter.post("/:id/photos", ...requireAdmin, asyncHandler(regionsController.addPhoto));
regionsRouter.delete("/:id/photos", ...requireAdmin, asyncHandler(regionsController.deletePhoto));
