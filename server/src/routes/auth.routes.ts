import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { requireAuth } from "../middleware/requireAuth";
import { asyncHandler } from "../utils/asyncHandler";

export const authRouter = Router();

authRouter.post("/register", asyncHandler(authController.register));
authRouter.get("/verify-email/:token", asyncHandler(authController.verifyEmail));
authRouter.post("/login", asyncHandler(authController.login));
authRouter.post("/logout", authController.logout);
authRouter.post("/refresh", asyncHandler(authController.refresh));
authRouter.get("/me", requireAuth, asyncHandler(authController.me));
authRouter.post("/forgot-password", asyncHandler(authController.forgotPassword));
authRouter.post("/reset-password/:token", asyncHandler(authController.resetPassword));
