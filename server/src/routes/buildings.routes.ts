import { Router } from "express";
import * as buildingsController from "../controllers/buildings.controller";
import { loadCurrentUser } from "../middleware/loadCurrentUser";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { asyncHandler } from "../utils/asyncHandler";

export const buildingsRouter = Router();

buildingsRouter.get("/", asyncHandler(buildingsController.list));
// Must come before "/:id" or it would be matched as an id lookup instead.
buildingsRouter.get("/map", asyncHandler(buildingsController.map));
buildingsRouter.get("/:id", asyncHandler(buildingsController.getById));

buildingsRouter.post(
  "/",
  requireAuth,
  asyncHandler(loadCurrentUser),
  requireRole("admin"),
  asyncHandler(buildingsController.create),
);

// Admins can edit every building; clients can edit only the one they manage
// (leasing/contact fields only) — both checks live inside the controller
// since the allowed fields and target building differ per role.
buildingsRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(loadCurrentUser),
  asyncHandler(buildingsController.update),
);

buildingsRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(loadCurrentUser),
  requireRole("admin"),
  asyncHandler(buildingsController.remove),
);

// Photos are admin-only even on a building a client manages — unlike text
// fields, there's no client-editable case here.
const requireAdmin = [requireAuth, asyncHandler(loadCurrentUser), requireRole("admin")];

buildingsRouter.post(
  "/:id/photos/presign",
  ...requireAdmin,
  asyncHandler(buildingsController.presignPhoto),
);
buildingsRouter.post("/:id/photos", ...requireAdmin, asyncHandler(buildingsController.addPhoto));
buildingsRouter.delete(
  "/:id/photos",
  ...requireAdmin,
  asyncHandler(buildingsController.deletePhoto),
);
