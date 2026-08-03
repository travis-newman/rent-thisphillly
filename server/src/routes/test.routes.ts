import { Router } from "express";
import { UserModel } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";

// Mounted only when NODE_ENV === "test" (see app.ts). Lets the Playwright
// suite read verification/reset tokens without needing a real mailbox.
export const testRouter = Router();

testRouter.get(
  "/tokens",
  asyncHandler(async (req, res) => {
    const email = req.query.email as string | undefined;
    if (!email) {
      res.status(400).json({ message: "email query param is required" });
      return;
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({
      verificationToken: user.verificationToken,
      resetPasswordToken: user.resetPasswordToken,
    });
  }),
);
