import bcrypt from "bcrypt";
import type { CookieOptions, Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { UserModel } from "../models/User";
import { sendPasswordResetEmail, sendVerificationEmail } from "../services/mailer";
import {
  generateRandomToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../services/tokens";

const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
};

function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie("accessToken", accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
  res.cookie("refreshToken", refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = registerSchema.parse(req.body);

  const existing = await UserModel.findOne({ email });
  if (existing) {
    res.status(409).json({ message: "An account with that email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const verificationToken = generateRandomToken();
  // With mailer disabled there's no way to receive the verification email, so
  // local/dev accounts (MAILER_DISABLED=true) are verified immediately instead
  // of getting stuck behind a link nothing ever sends.
  const isVerified = env.MAILER_DISABLED;

  await UserModel.create({ email, passwordHash, verificationToken, isVerified });

  if (isVerified) {
    res.status(201).json({ message: "Registration successful. You can now log in." });
    return;
  }

  const link = `${env.CLIENT_URL}/verify-email/${verificationToken}`;
  await sendVerificationEmail(email, link);

  res
    .status(201)
    .json({ message: "Registration successful. Check your email to verify your account." });
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { token } = req.params;

  const user = await UserModel.findOne({ verificationToken: token });
  if (!user) {
    res.status(400).json({ message: "Invalid or expired verification token" });
    return;
  }

  // Leave verificationToken in place (rather than clearing it) so this
  // request is idempotent — safe to call more than once with the same
  // token, e.g. React StrictMode's double effect invocation in dev, a
  // retried request, or a user revisiting the link.
  user.isVerified = true;
  await user.save();

  res.json({ message: "Email verified. You can now log in." });
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = loginSchema.parse(req.body);

  const user = await UserModel.findOne({ email });
  if (!user) {
    res.status(401).json({ message: "Invalid email or password" });
    return;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    res.status(401).json({ message: "Invalid email or password" });
    return;
  }

  if (!user.isVerified) {
    res.status(403).json({ message: "Please verify your email before logging in" });
    return;
  }

  if (user.status === "suspended") {
    res.status(403).json({ message: "This account has been suspended" });
    return;
  }

  const payload = { sub: user.id as string, email: user.email };
  setAuthCookies(res, signAccessToken(payload), signRefreshToken(payload));

  res.json({
    user: { id: user.id, email: user.email, role: user.role, status: user.status },
  });
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);
  res.status(204).send();
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.refreshToken as string | undefined;
  if (!token) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }

  try {
    const payload = verifyRefreshToken(token);
    const nextPayload = { sub: payload.sub, email: payload.email };
    setAuthCookies(res, signAccessToken(nextPayload), signRefreshToken(nextPayload));
    res.status(204).send();
  } catch {
    res.status(401).json({ message: "Invalid or expired refresh token" });
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await UserModel.findById(req.userId);
  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }
  res.json({
    user: { id: user.id, email: user.email, role: user.role, status: user.status },
  });
}

const forgotPasswordSchema = z.object({ email: z.string().email() });

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = forgotPasswordSchema.parse(req.body);

  const user = await UserModel.findOne({ email });
  // Always respond 200 to avoid leaking which emails are registered.
  if (!user) {
    res.json({ message: "If that email is registered, a reset link has been sent." });
    return;
  }

  const resetPasswordToken = generateRandomToken();
  user.resetPasswordToken = resetPasswordToken;
  user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await user.save();

  const link = `${env.CLIENT_URL}/reset-password/${resetPasswordToken}`;
  await sendPasswordResetEmail(email, link);

  res.json({ message: "If that email is registered, a reset link has been sent." });
}

const resetPasswordSchema = z.object({ password: z.string().min(8) });

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token } = req.params;
  const { password } = resetPasswordSchema.parse(req.body);

  const user = await UserModel.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: new Date() },
  });
  if (!user) {
    res.status(400).json({ message: "Invalid or expired reset token" });
    return;
  }

  user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  await user.save();

  res.json({ message: "Password reset. You can now log in." });
}
