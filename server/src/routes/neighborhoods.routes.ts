import { Router } from "express";
import * as neighborhoodsController from "../controllers/neighborhoods.controller";
import { loadCurrentUser } from "../middleware/loadCurrentUser";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { asyncHandler } from "../utils/asyncHandler";

export const neighborhoodsRouter = Router();

neighborhoodsRouter.get("/", asyncHandler(neighborhoodsController.list));
neighborhoodsRouter.get("/:id", asyncHandler(neighborhoodsController.getById));

const requireAdmin = [requireAuth, asyncHandler(loadCurrentUser), requireRole("admin")];

neighborhoodsRouter.post("/", ...requireAdmin, asyncHandler(neighborhoodsController.create));
neighborhoodsRouter.patch("/:id", ...requireAdmin, asyncHandler(neighborhoodsController.update));
neighborhoodsRouter.delete("/:id", ...requireAdmin, asyncHandler(neighborhoodsController.remove));

neighborhoodsRouter.post(
  "/:id/photos/presign",
  ...requireAdmin,
  asyncHandler(neighborhoodsController.presignPhoto),
);
neighborhoodsRouter.post(
  "/:id/photos",
  ...requireAdmin,
  asyncHandler(neighborhoodsController.addPhoto),
);
neighborhoodsRouter.delete(
  "/:id/photos",
  ...requireAdmin,
  asyncHandler(neighborhoodsController.deletePhoto),
);
