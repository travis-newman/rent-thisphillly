jest.mock("../services/mailer", () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../app";
import { UserModel, type Role } from "../models/User";

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

let userCounter = 0;

async function createAuthedUser(role: Role): Promise<{ cookies: string[]; userId: string }> {
  const email = `${role}-${++userCounter}@example.com`;
  const password = "correct-horse-battery-staple";

  await request(app).post("/api/auth/register").send({ email, password });
  const user = await UserModel.findOneAndUpdate({ email }, { role }, { new: true });
  await request(app).get(`/api/auth/verify-email/${user!.verificationToken as string}`);

  const loginRes = await request(app).post("/api/auth/login").send({ email, password });
  return { cookies: loginRes.get("Set-Cookie") as unknown as string[], userId: user!.id as string };
}

describe("users routes", () => {
  it("rejects listing users without authentication", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
  });

  it("rejects listing users for non-admin roles", async () => {
    for (const role of ["client", "user"] as const) {
      const { cookies } = await createAuthedUser(role);
      const res = await request(app).get("/api/users").set("Cookie", cookies);
      expect(res.status).toBe(403);
    }
  });

  it("lets an admin list all users", async () => {
    const { cookies } = await createAuthedUser("admin");
    await createAuthedUser("client");
    await createAuthedUser("user");

    const res = await request(app).get("/api/users").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(3);
    expect(res.body.users[0].passwordHash).toBeUndefined();
  });

  it("lets an admin change a user's role and status", async () => {
    const { cookies } = await createAuthedUser("admin");
    const { userId } = await createAuthedUser("user");

    const res = await request(app)
      .patch(`/api/users/${userId}`)
      .set("Cookie", cookies)
      .send({ role: "client", status: "suspended" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("client");
    expect(res.body.user.status).toBe("suspended");
  });

  it("rejects a non-admin changing another user's role", async () => {
    const { cookies } = await createAuthedUser("client");
    const { userId } = await createAuthedUser("user");

    const res = await request(app)
      .patch(`/api/users/${userId}`)
      .set("Cookie", cookies)
      .send({ role: "admin" });

    expect(res.status).toBe(403);
  });

  it("returns 404 updating a missing user", async () => {
    const { cookies } = await createAuthedUser("admin");
    const missingId = new mongoose.Types.ObjectId();

    const res = await request(app).patch(`/api/users/${missingId}`).set("Cookie", cookies).send({
      role: "client",
    });

    expect(res.status).toBe(404);
  });

  it("blocks a suspended user from logging in", async () => {
    const email = "suspend-me@example.com";
    const password = "correct-horse-battery-staple";
    await request(app).post("/api/auth/register").send({ email, password });
    const user = await UserModel.findOneAndUpdate(
      { email },
      { isVerified: true, status: "suspended" },
      { new: true },
    );
    expect(user).not.toBeNull();

    const res = await request(app).post("/api/auth/login").send({ email, password });

    expect(res.status).toBe(403);
  });
});
