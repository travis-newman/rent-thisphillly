jest.mock("../services/mailer", () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../app";
import { UserModel } from "../models/User";
import * as mailer from "../services/mailer";

const app = createApp();
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await UserModel.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function registerAndVerify(email: string, password: string) {
  await request(app).post("/api/auth/register").send({ email, password });
  const user = await UserModel.findOne({ email });
  const token = user!.verificationToken as string;
  await request(app).get(`/api/auth/verify-email/${token}`);
}

describe("auth routes", () => {
  const email = "user@example.com";
  const password = "correct-horse-battery-staple";

  it("registers a new user and sends a verification email", async () => {
    const res = await request(app).post("/api/auth/register").send({ email, password });

    expect(res.status).toBe(201);
    expect(mailer.sendVerificationEmail).toHaveBeenCalledWith(email, expect.stringContaining("/verify-email/"));

    const user = await UserModel.findOne({ email });
    expect(user).not.toBeNull();
    expect(user!.isVerified).toBe(false);
  });

  it("rejects registering the same email twice", async () => {
    await request(app).post("/api/auth/register").send({ email, password });
    const res = await request(app).post("/api/auth/register").send({ email, password });
    expect(res.status).toBe(409);
  });

  it("rejects login before the email is verified", async () => {
    await request(app).post("/api/auth/register").send({ email, password });
    const res = await request(app).post("/api/auth/login").send({ email, password });
    expect(res.status).toBe(403);
  });

  it("verifies the email, logs in, and returns the current user via /me", async () => {
    await registerAndVerify(email, password);

    const loginRes = await request(app).post("/api/auth/login").send({ email, password });
    expect(loginRes.status).toBe(200);

    const cookies = loginRes.get("Set-Cookie") as unknown as string[];
    expect(cookies.some((c) => c.startsWith("accessToken="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("refreshToken="))).toBe(true);

    const meRes = await request(app).get("/api/auth/me").set("Cookie", cookies);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(email);
  });

  it("rejects login with the wrong password", async () => {
    await registerAndVerify(email, password);
    const res = await request(app).post("/api/auth/login").send({ email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("rejects /me without a session cookie", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("issues a new access token from a valid refresh token", async () => {
    await registerAndVerify(email, password);
    const loginRes = await request(app).post("/api/auth/login").send({ email, password });
    const cookies = loginRes.get("Set-Cookie") as unknown as string[];

    const refreshRes = await request(app).post("/api/auth/refresh").set("Cookie", cookies);
    expect(refreshRes.status).toBe(204);
    expect((refreshRes.get("Set-Cookie") as unknown as string[]).some((c) => c.startsWith("accessToken="))).toBe(
      true,
    );
  });

  it("clears cookies on logout", async () => {
    await registerAndVerify(email, password);
    const loginRes = await request(app).post("/api/auth/login").send({ email, password });
    const cookies = loginRes.get("Set-Cookie") as unknown as string[];

    const logoutRes = await request(app).post("/api/auth/logout").set("Cookie", cookies);
    expect(logoutRes.status).toBe(204);

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Cookie", logoutRes.get("Set-Cookie") as unknown as string[]);
    expect(meRes.status).toBe(401);
  });

  it("supports the forgot-password / reset-password flow", async () => {
    await registerAndVerify(email, password);

    const forgotRes = await request(app).post("/api/auth/forgot-password").send({ email });
    expect(forgotRes.status).toBe(200);
    expect(mailer.sendPasswordResetEmail).toHaveBeenCalled();

    const user = await UserModel.findOne({ email });
    const resetToken = user!.resetPasswordToken as string;

    const newPassword = "a-brand-new-password";
    const resetRes = await request(app)
      .post(`/api/auth/reset-password/${resetToken}`)
      .send({ password: newPassword });
    expect(resetRes.status).toBe(200);

    const loginRes = await request(app).post("/api/auth/login").send({ email, password: newPassword });
    expect(loginRes.status).toBe(200);
  });

  it("does not reveal whether an email is registered on forgot-password", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({ email: "nobody@example.com" });
    expect(res.status).toBe(200);
  });
});
