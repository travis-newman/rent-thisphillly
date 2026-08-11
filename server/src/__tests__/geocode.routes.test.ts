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
const originalFetch = global.fetch;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await UserModel.deleteMany({});
  global.fetch = originalFetch;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

let userCounter = 0;

async function createAuthedUser(role: Role): Promise<{ cookies: string[] }> {
  const email = `${role}-${++userCounter}@example.com`;
  const password = "correct-horse-battery-staple";

  await request(app).post("/api/auth/register").send({ email, password });
  const user = await UserModel.findOneAndUpdate({ email }, { role }, { new: true });
  await request(app).get(`/api/auth/verify-email/${user!.verificationToken as string}`);

  const loginRes = await request(app).post("/api/auth/login").send({ email, password });
  return { cookies: loginRes.get("Set-Cookie") as unknown as string[] };
}

function mockNominatimResponse(body: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe("geocode routes", () => {
  it("rejects an unauthenticated search", async () => {
    const res = await request(app).get("/api/geocode/search").query({ q: "City Hall" });
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin search", async () => {
    const { cookies } = await createAuthedUser("client");
    const res = await request(app)
      .get("/api/geocode/search")
      .set("Cookie", cookies)
      .query({ q: "Broad and Market" });
    expect(res.status).toBe(403);
  });

  it("lets an admin search and returns mapped results", async () => {
    const { cookies } = await createAuthedUser("admin");
    mockNominatimResponse([
      {
        display_name: "Philadelphia City Hall, Center City, Philadelphia, Pennsylvania, United States",
        lat: "39.9526",
        lon: "-75.1652",
      },
    ]);

    const res = await request(app)
      .get("/api/geocode/search")
      .set("Cookie", cookies)
      .query({ q: "Philadelphia City Hall" });

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([
      {
        label: "Philadelphia City Hall, Center City, Philadelphia, Pennsylvania, United States",
        lat: 39.9526,
        lon: -75.1652,
      },
    ]);

    const fetchUrl = new URL((global.fetch as jest.Mock).mock.calls[0][0] as string);
    expect(fetchUrl.origin + fetchUrl.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(fetchUrl.searchParams.get("q")).toBe("Philadelphia City Hall, Philadelphia, PA");
  });

  it("returns 502 when the upstream geocoder fails", async () => {
    const { cookies } = await createAuthedUser("admin");
    mockNominatimResponse({}, false);

    const res = await request(app)
      .get("/api/geocode/search")
      .set("Cookie", cookies)
      .query({ q: "nowhere" });

    expect(res.status).toBe(502);
  });

  it("rejects an empty query", async () => {
    const { cookies } = await createAuthedUser("admin");
    const res = await request(app)
      .get("/api/geocode/search")
      .set("Cookie", cookies)
      .query({ q: "" });
    expect(res.status).toBe(400);
  });
});
