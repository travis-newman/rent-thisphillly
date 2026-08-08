import { Router } from "express";
import * as usersController from "../controllers/users.controller";
import { loadCurrentUser } from "../middleware/loadCurrentUser";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { asyncHandler } from "../utils/asyncHandler";

export const usersRouter = Router();

usersRouter.use(requireAuth, asyncHandler(loadCurrentUser), requireRole("admin"));

usersRouter.get("/", asyncHandler(usersController.list));
usersRouter.patch("/:id", asyncHandler(usersController.update));
