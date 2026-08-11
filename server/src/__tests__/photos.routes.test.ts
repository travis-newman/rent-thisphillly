jest.mock("../services/mailer", () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

import { DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../app";
import * as r2Config from "../config/r2";
import { BuildingModel } from "../models/Building";
import { NeighborhoodModel } from "../models/Neighborhood";
import { RegionModel } from "../models/Region";
import { UserModel, type Role } from "../models/User";
import { MAX_PHOTOS_PER_ENTITY, MAX_UPLOAD_BYTES } from "../utils/photos";

const app = createApp();
let mongod: MongoMemoryServer;
let sendSpy: jest.SpyInstance;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

beforeEach(() => {
  // getSignedUrl (used for presign) signs locally and never calls .send();
  // only HeadObject (confirm) and DeleteObject (delete) hit the network, so
  // those are the only commands this needs to stub.
  sendSpy = jest.spyOn(S3Client.prototype, "send").mockImplementation(async (command: unknown) => {
    if (command instanceof HeadObjectCommand) {
      return { ContentLength: 1024 };
    }
    if (command instanceof DeleteObjectCommand) {
      return {};
    }
    throw new Error(`Unexpected S3 command in test: ${(command as { constructor: { name: string } }).constructor.name}`);
  });
});

afterEach(async () => {
  sendSpy.mockRestore();
  await BuildingModel.deleteMany({});
  await RegionModel.deleteMany({});
  await NeighborhoodModel.deleteMany({});
  await UserModel.deleteMany({});
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

describe("building photos", () => {
  it("rejects presign/confirm/delete without authentication", async () => {
    const building = await BuildingModel.create({ address: "1 TEST ST" });

    const presignRes = await request(app)
      .post(`/api/buildings/${building.id}/photos/presign`)
      .send({ contentType: "image/jpeg" });
    const confirmRes = await request(app)
      .post(`/api/buildings/${building.id}/photos`)
      .send({ key: "x" });
    const deleteRes = await request(app).delete(`/api/buildings/${building.id}/photos?key=x`);

    expect(presignRes.status).toBe(401);
    expect(confirmRes.status).toBe(401);
    expect(deleteRes.status).toBe(401);
  });

  it("rejects a non-admin", async () => {
    const building = await BuildingModel.create({ address: "1 TEST ST" });
    const { cookies } = await createAuthedUser("client");

    const res = await request(app)
      .post(`/api/buildings/${building.id}/photos/presign`)
      .set("Cookie", cookies)
      .send({ contentType: "image/jpeg" });

    expect(res.status).toBe(403);
  });

  it("presigns an upload for an admin", async () => {
    const building = await BuildingModel.create({ address: "1 TEST ST" });
    const { cookies } = await createAuthedUser("admin");

    const res = await request(app)
      .post(`/api/buildings/${building.id}/photos/presign`)
      .set("Cookie", cookies)
      .send({ contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(typeof res.body.uploadUrl).toBe("string");
    expect(res.body.key).toMatch(new RegExp(`^buildings/${building.id}/.+\\.jpg$`));
  });

  it("rejects an unsupported content type", async () => {
    const building = await BuildingModel.create({ address: "1 TEST ST" });
    const { cookies } = await createAuthedUser("admin");

    const res = await request(app)
      .post(`/api/buildings/${building.id}/photos/presign`)
      .set("Cookie", cookies)
      .send({ contentType: "application/pdf" });

    expect(res.status).toBe(400);
  });

  it("404s presigning for a missing building", async () => {
    const { cookies } = await createAuthedUser("admin");
    const res = await request(app)
      .post(`/api/buildings/${new mongoose.Types.ObjectId()}/photos/presign`)
      .set("Cookie", cookies)
      .send({ contentType: "image/jpeg" });
    expect(res.status).toBe(404);
  });

  it("confirms an upload and attaches the photo", async () => {
    const building = await BuildingModel.create({ address: "1 TEST ST" });
    const { cookies } = await createAuthedUser("admin");

    const res = await request(app)
      .post(`/api/buildings/${building.id}/photos`)
      .set("Cookie", cookies)
      .send({ key: `buildings/${building.id}/photo.jpg` });

    expect(res.status).toBe(200);
    expect(res.body.building.photos).toHaveLength(1);
    expect(res.body.building.photos[0].key).toBe(`buildings/${building.id}/photo.jpg`);
    expect(res.body.building.photos[0].url).toContain(`buildings/${building.id}/photo.jpg`);
  });

  it("rejects confirming an upload that was never actually put in storage", async () => {
    const building = await BuildingModel.create({ address: "1 TEST ST" });
    const { cookies } = await createAuthedUser("admin");
    sendSpy.mockImplementationOnce(async () => {
      throw Object.assign(new Error("Not Found"), { name: "NotFound" });
    });

    const res = await request(app)
      .post(`/api/buildings/${building.id}/photos`)
      .set("Cookie", cookies)
      .send({ key: "buildings/does-not-exist.jpg" });

    expect(res.status).toBe(400);
  });

  it("rejects and cleans up an oversized upload", async () => {
    const building = await BuildingModel.create({ address: "1 TEST ST" });
    const { cookies } = await createAuthedUser("admin");
    sendSpy.mockImplementationOnce(async () => ({ ContentLength: MAX_UPLOAD_BYTES + 1 }));

    const res = await request(app)
      .post(`/api/buildings/${building.id}/photos`)
      .set("Cookie", cookies)
      .send({ key: "buildings/too-big.jpg" });

    expect(res.status).toBe(400);
    const deleteCalls = sendSpy.mock.calls.filter(([cmd]) => cmd instanceof DeleteObjectCommand);
    expect(deleteCalls).toHaveLength(1);

    const stored = await BuildingModel.findById(building.id);
    expect(stored!.photos).toHaveLength(0);
  });

  it("rejects confirming past the per-entity photo limit", async () => {
    const filler = Array.from({ length: MAX_PHOTOS_PER_ENTITY }, (_, i) => ({
      key: `buildings/x/${i}.jpg`,
      url: `https://example.com/${i}.jpg`,
      uploadedAt: new Date(),
    }));
    const building = await BuildingModel.create({ address: "1 TEST ST", photos: filler });
    const { cookies } = await createAuthedUser("admin");

    const res = await request(app)
      .post(`/api/buildings/${building.id}/photos`)
      .set("Cookie", cookies)
      .send({ key: "buildings/x/one-too-many.jpg" });

    expect(res.status).toBe(400);
  });

  it("404s confirming for a missing building", async () => {
    const { cookies } = await createAuthedUser("admin");
    const res = await request(app)
      .post(`/api/buildings/${new mongoose.Types.ObjectId()}/photos`)
      .set("Cookie", cookies)
      .send({ key: "buildings/x/photo.jpg" });
    expect(res.status).toBe(404);
  });

  it("deletes a photo", async () => {
    const building = await BuildingModel.create({
      address: "1 TEST ST",
      photos: [{ key: "buildings/x/photo.jpg", url: "https://example.com/photo.jpg", uploadedAt: new Date() }],
    });
    const { cookies } = await createAuthedUser("admin");

    const res = await request(app)
      .delete(`/api/buildings/${building.id}/photos`)
      .query({ key: "buildings/x/photo.jpg" })
      .set("Cookie", cookies);

    expect(res.status).toBe(204);
    const stored = await BuildingModel.findById(building.id);
    expect(stored!.photos).toHaveLength(0);
  });

  it("404s deleting a photo key that isn't on the building", async () => {
    const building = await BuildingModel.create({ address: "1 TEST ST" });
    const { cookies } = await createAuthedUser("admin");

    const res = await request(app)
      .delete(`/api/buildings/${building.id}/photos`)
      .query({ key: "buildings/x/nope.jpg" })
      .set("Cookie", cookies);

    expect(res.status).toBe(404);
  });

  it("503s when R2 isn't configured", async () => {
    const building = await BuildingModel.create({ address: "1 TEST ST" });
    const { cookies } = await createAuthedUser("admin");
    const configuredSpy = jest.spyOn(r2Config, "isR2Configured").mockReturnValue(false);

    const res = await request(app)
      .post(`/api/buildings/${building.id}/photos/presign`)
      .set("Cookie", cookies)
      .send({ contentType: "image/jpeg" });

    expect(res.status).toBe(503);
    configuredSpy.mockRestore();
  });
});

describe("region photos", () => {
  it("presigns, confirms, and deletes a photo for an admin", async () => {
    const box = [
      [-75.2, 39.9],
      [-75.1, 39.9],
      [-75.1, 40.0],
      [-75.2, 40.0],
      [-75.2, 39.9],
    ];
    const region = await RegionModel.create({
      name: "Test Region",
      boundary: { type: "Polygon", coordinates: [box] },
    });
    const { cookies } = await createAuthedUser("admin");

    const presignRes = await request(app)
      .post(`/api/regions/${region.id}/photos/presign`)
      .set("Cookie", cookies)
      .send({ contentType: "image/png" });
    expect(presignRes.status).toBe(200);

    const confirmRes = await request(app)
      .post(`/api/regions/${region.id}/photos`)
      .set("Cookie", cookies)
      .send({ key: presignRes.body.key });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.region.photos).toHaveLength(1);

    const deleteRes = await request(app)
      .delete(`/api/regions/${region.id}/photos`)
      .query({ key: presignRes.body.key })
      .set("Cookie", cookies);
    expect(deleteRes.status).toBe(204);
  });

  it("rejects a non-admin", async () => {
    const box = [
      [-75.2, 39.9],
      [-75.1, 39.9],
      [-75.1, 40.0],
      [-75.2, 40.0],
      [-75.2, 39.9],
    ];
    const region = await RegionModel.create({
      name: "Test Region",
      boundary: { type: "Polygon", coordinates: [box] },
    });
    const { cookies } = await createAuthedUser("user");

    const res = await request(app)
      .post(`/api/regions/${region.id}/photos/presign`)
      .set("Cookie", cookies)
      .send({ contentType: "image/png" });

    expect(res.status).toBe(403);
  });
});

describe("neighborhood photos", () => {
  it("presigns, confirms, and deletes a photo for an admin", async () => {
    const box = [
      [-75.2, 39.9],
      [-75.1, 39.9],
      [-75.1, 40.0],
      [-75.2, 40.0],
      [-75.2, 39.9],
    ];
    const region = await RegionModel.create({
      name: "Test Region",
      boundary: { type: "Polygon", coordinates: [box] },
    });
    const neighborhood = await NeighborhoodModel.create({
      regionId: region._id,
      name: "Test Neighborhood",
      boundary: { type: "Polygon", coordinates: [box] },
    });
    const { cookies } = await createAuthedUser("admin");

    const presignRes = await request(app)
      .post(`/api/neighborhoods/${neighborhood.id}/photos/presign`)
      .set("Cookie", cookies)
      .send({ contentType: "image/webp" });
    expect(presignRes.status).toBe(200);

    const confirmRes = await request(app)
      .post(`/api/neighborhoods/${neighborhood.id}/photos`)
      .set("Cookie", cookies)
      .send({ key: presignRes.body.key });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.neighborhood.photos).toHaveLength(1);

    const deleteRes = await request(app)
      .delete(`/api/neighborhoods/${neighborhood.id}/photos`)
      .query({ key: presignRes.body.key })
      .set("Cookie", cookies);
    expect(deleteRes.status).toBe(204);
  });

  it("rejects a non-admin", async () => {
    const box = [
      [-75.2, 39.9],
      [-75.1, 39.9],
      [-75.1, 40.0],
      [-75.2, 40.0],
      [-75.2, 39.9],
    ];
    const region = await RegionModel.create({
      name: "Test Region",
      boundary: { type: "Polygon", coordinates: [box] },
    });
    const neighborhood = await NeighborhoodModel.create({
      regionId: region._id,
      name: "Test Neighborhood",
      boundary: { type: "Polygon", coordinates: [box] },
    });
    const { cookies } = await createAuthedUser("client");

    const res = await request(app)
      .post(`/api/neighborhoods/${neighborhood.id}/photos/presign`)
      .set("Cookie", cookies)
      .send({ contentType: "image/webp" });

    expect(res.status).toBe(403);
  });
});
