jest.mock("../services/mailer", () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../app";
import { BuildingModel } from "../models/Building";
import { NeighborhoodModel } from "../models/Neighborhood";
import { RegionModel } from "../models/Region";
import { UserModel, type Role } from "../models/User";

const app = createApp();
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await RegionModel.deleteMany({});
  await NeighborhoodModel.deleteMany({});
  await UserModel.deleteMany({});
  await BuildingModel.deleteMany({});
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

// Raw GeoJSON ring, for creating fixtures directly via the model (bypassing
// the boundaryPoints -> boundary derivation the controllers do).
const regionBox = [
  [-75.2, 39.9],
  [-75.1, 39.9],
  [-75.1, 40.0],
  [-75.2, 40.0],
  [-75.2, 39.9],
];

// The equivalent boundary points, as the create/update endpoints expect them
// (unclosed — the server closes the ring itself).
const regionBoxPoints = [
  { label: "NW corner", lat: 39.9, lon: -75.2 },
  { label: "NE corner", lat: 39.9, lon: -75.1 },
  { label: "SE corner", lat: 40.0, lon: -75.1 },
  { label: "SW corner", lat: 40.0, lon: -75.2 },
];

async function createRegion() {
  return RegionModel.create({
    name: "Test Region",
    boundary: { type: "Polygon", coordinates: [regionBox] },
  });
}

describe("regions routes", () => {
  it("lists regions publicly", async () => {
    await createRegion();
    const res = await request(app).get("/api/regions");
    expect(res.status).toBe(200);
    expect(res.body.regions).toHaveLength(1);
  });

  it("gets a region with its neighborhoods publicly", async () => {
    const region = await createRegion();
    await NeighborhoodModel.create({
      regionId: region._id,
      name: "Test Neighborhood",
      boundary: { type: "Polygon", coordinates: [regionBox] },
    });

    const res = await request(app).get(`/api/regions/${region.id}`);

    expect(res.status).toBe(200);
    expect(res.body.region.name).toBe("Test Region");
    expect(res.body.neighborhoods).toHaveLength(1);
  });

  it("includes a neighborhood count per region in the list", async () => {
    const region = await createRegion();
    const otherRegion = await createRegion();
    await NeighborhoodModel.create([
      { regionId: region._id, name: "A", boundary: { type: "Polygon", coordinates: [regionBox] } },
      { regionId: region._id, name: "B", boundary: { type: "Polygon", coordinates: [regionBox] } },
    ]);

    const res = await request(app).get("/api/regions");

    const found = res.body.regions.find((r: { _id: string }) => r._id === region.id);
    const foundOther = res.body.regions.find((r: { _id: string }) => r._id === otherRegion.id);
    expect(found.neighborhoodCount).toBe(2);
    expect(foundOther.neighborhoodCount).toBe(0);
  });

  it("includes building and unit stats when getting a region", async () => {
    const region = await createRegion();
    await BuildingModel.create([
      {
        address: "INSIDE 1",
        numberOfUnits: 10,
        location: { type: "Point", coordinates: [-75.15, 39.95] },
      },
      {
        address: "INSIDE 2",
        numberOfUnits: 5,
        location: { type: "Point", coordinates: [-75.16, 39.96] },
      },
      {
        address: "OUTSIDE",
        numberOfUnits: 100,
        location: { type: "Point", coordinates: [-75.5, 40.3] },
      },
    ]);

    const res = await request(app).get(`/api/regions/${region.id}`);

    expect(res.body.buildingCount).toBe(2);
    expect(res.body.totalUnits).toBe(15);
  });

  it("returns 404 for a missing region", async () => {
    const res = await request(app).get(`/api/regions/${new mongoose.Types.ObjectId()}`);
    expect(res.status).toBe(404);
  });

  it("rejects create/update/delete for non-admins and unauthenticated requests", async () => {
    const region = await createRegion();
    const { cookies: userCookies } = await createAuthedUser("user");
    const { cookies: clientCookies } = await createAuthedUser("client");

    for (const cookies of [undefined, userCookies, clientCookies]) {
      const req = cookies
        ? request(app).post("/api/regions").set("Cookie", cookies)
        : request(app).post("/api/regions");
      const createRes = await req.send({ name: "X", boundaryPoints: regionBoxPoints });
      expect(createRes.status).toBe(cookies ? 403 : 401);

      const updateReq = cookies
        ? request(app).patch(`/api/regions/${region.id}`).set("Cookie", cookies)
        : request(app).patch(`/api/regions/${region.id}`);
      const updateRes = await updateReq.send({ name: "Y" });
      expect(updateRes.status).toBe(cookies ? 403 : 401);

      const deleteReq = cookies
        ? request(app).delete(`/api/regions/${region.id}`).set("Cookie", cookies)
        : request(app).delete(`/api/regions/${region.id}`);
      const deleteRes = await deleteReq;
      expect(deleteRes.status).toBe(cookies ? 403 : 401);
    }
  });

  it("lets an admin create, update, and delete a region", async () => {
    const { cookies } = await createAuthedUser("admin");

    const createRes = await request(app)
      .post("/api/regions")
      .set("Cookie", cookies)
      .send({ name: "Center City", boundaryPoints: regionBoxPoints });
    expect(createRes.status).toBe(201);
    expect(createRes.body.region.name).toBe("Center City");
    expect(createRes.body.region.boundaryPoints).toHaveLength(regionBoxPoints.length);
    expect(createRes.body.region.boundaryPoints[0].label).toBe("NW corner");
    // Stored polygon ring is closed (first point repeated at the end).
    expect(createRes.body.region.boundary.coordinates[0]).toHaveLength(regionBoxPoints.length + 1);

    const id = createRes.body.region._id;
    const updateRes = await request(app)
      .patch(`/api/regions/${id}`)
      .set("Cookie", cookies)
      .send({ name: "Renamed Region" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.region.name).toBe("Renamed Region");

    const deleteRes = await request(app).delete(`/api/regions/${id}`).set("Cookie", cookies);
    expect(deleteRes.status).toBe(204);
    expect(await RegionModel.findById(id)).toBeNull();
  });

  it("lets an admin redraw a region's boundary points", async () => {
    const { cookies } = await createAuthedUser("admin");
    const region = await createRegion();

    const newPoints = [
      { label: null, lat: 39.95, lon: -75.16 },
      { label: null, lat: 39.95, lon: -75.14 },
      { label: null, lat: 39.97, lon: -75.14 },
    ];
    const res = await request(app)
      .patch(`/api/regions/${region.id}`)
      .set("Cookie", cookies)
      .send({ boundaryPoints: newPoints });

    expect(res.status).toBe(200);
    expect(res.body.region.boundaryPoints).toHaveLength(3);
    expect(res.body.region.boundary.coordinates[0]).toHaveLength(4); // closed
  });

  it("lets an admin set and update a region's description", async () => {
    const { cookies } = await createAuthedUser("admin");

    const createRes = await request(app).post("/api/regions").set("Cookie", cookies).send({
      name: "Center City",
      description: "The downtown core.",
      boundaryPoints: regionBoxPoints,
    });
    expect(createRes.body.region.description).toBe("The downtown core.");

    const updateRes = await request(app)
      .patch(`/api/regions/${createRes.body.region._id}`)
      .set("Cookie", cookies)
      .send({ description: "Updated description." });
    expect(updateRes.body.region.description).toBe("Updated description.");
  });

  it("auto-closes an open boundary ring on create", async () => {
    const { cookies } = await createAuthedUser("admin");

    const res = await request(app)
      .post("/api/regions")
      .set("Cookie", cookies)
      .send({ name: "Open Ring", boundaryPoints: regionBoxPoints });

    expect(res.status).toBe(201);
    const coords = res.body.region.boundary.coordinates[0];
    expect(coords[0]).toEqual(coords[coords.length - 1]);
  });

  it("rejects a boundary with fewer than 3 points", async () => {
    const { cookies } = await createAuthedUser("admin");
    const res = await request(app)
      .post("/api/regions")
      .set("Cookie", cookies)
      .send({
        name: "Too Small",
        boundaryPoints: [
          { lat: 1, lon: 2 },
          { lat: 3, lon: 4 },
        ],
      });
    expect(res.status).toBe(400);
  });

  it("cascade-deletes neighborhoods when their region is deleted", async () => {
    const { cookies } = await createAuthedUser("admin");
    const region = await createRegion();
    const neighborhood = await NeighborhoodModel.create({
      regionId: region._id,
      name: "Doomed Neighborhood",
      boundary: { type: "Polygon", coordinates: [regionBox] },
    });

    const res = await request(app).delete(`/api/regions/${region.id}`).set("Cookie", cookies);

    expect(res.status).toBe(204);
    expect(await NeighborhoodModel.findById(neighborhood._id)).toBeNull();
  });
});

describe("neighborhoods routes", () => {
  it("lists neighborhoods publicly, optionally filtered by region", async () => {
    const region = await createRegion();
    const otherRegion = await createRegion();
    await NeighborhoodModel.create([
      { regionId: region._id, name: "A", boundary: { type: "Polygon", coordinates: [regionBox] } },
      {
        regionId: otherRegion._id,
        name: "B",
        boundary: { type: "Polygon", coordinates: [regionBox] },
      },
    ]);

    const all = await request(app).get("/api/neighborhoods");
    expect(all.body.neighborhoods).toHaveLength(2);

    const filtered = await request(app).get("/api/neighborhoods").query({ regionId: region.id });
    expect(filtered.body.neighborhoods).toHaveLength(1);
    expect(filtered.body.neighborhoods[0].name).toBe("A");
  });

  it("rejects a non-admin creating a neighborhood", async () => {
    const region = await createRegion();
    const { cookies } = await createAuthedUser("client");

    const res = await request(app)
      .post("/api/neighborhoods")
      .set("Cookie", cookies)
      .send({ regionId: region.id, name: "X", boundaryPoints: regionBoxPoints });

    expect(res.status).toBe(403);
  });

  it("lets an admin create, update, and delete a neighborhood", async () => {
    const { cookies } = await createAuthedUser("admin");
    const region = await createRegion();

    const createRes = await request(app)
      .post("/api/neighborhoods")
      .set("Cookie", cookies)
      .send({ regionId: region.id, name: "Rittenhouse", boundaryPoints: regionBoxPoints });
    expect(createRes.status).toBe(201);
    expect(createRes.body.neighborhood.regionId).toBe(region.id);
    expect(createRes.body.neighborhood.boundaryPoints).toHaveLength(regionBoxPoints.length);

    const id = createRes.body.neighborhood._id;
    const updateRes = await request(app)
      .patch(`/api/neighborhoods/${id}`)
      .set("Cookie", cookies)
      .send({ name: "Rittenhouse Square" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.neighborhood.name).toBe("Rittenhouse Square");

    const deleteRes = await request(app).delete(`/api/neighborhoods/${id}`).set("Cookie", cookies);
    expect(deleteRes.status).toBe(204);
    expect(await NeighborhoodModel.findById(id)).toBeNull();
  });

  it("lets an admin redraw a neighborhood's boundary points", async () => {
    const { cookies } = await createAuthedUser("admin");
    const region = await createRegion();
    const neighborhood = await NeighborhoodModel.create({
      regionId: region._id,
      name: "Test Neighborhood",
      boundary: { type: "Polygon", coordinates: [regionBox] },
    });

    const newPoints = [
      { label: "A & 1st", lat: 39.95, lon: -75.16 },
      { label: "B & 1st", lat: 39.95, lon: -75.14 },
      { label: "B & 2nd", lat: 39.97, lon: -75.14 },
    ];
    const res = await request(app)
      .patch(`/api/neighborhoods/${neighborhood.id}`)
      .set("Cookie", cookies)
      .send({ boundaryPoints: newPoints });

    expect(res.status).toBe(200);
    expect(res.body.neighborhood.boundaryPoints).toHaveLength(3);
    expect(res.body.neighborhood.boundaryPoints[0].label).toBe("A & 1st");
  });

  it("rejects a neighborhood referencing a non-existent region", async () => {
    const { cookies } = await createAuthedUser("admin");
    const res = await request(app).post("/api/neighborhoods").set("Cookie", cookies).send({
      regionId: new mongoose.Types.ObjectId().toString(),
      name: "X",
      boundaryPoints: regionBoxPoints,
    });
    expect(res.status).toBe(400);
  });

  it("lets an admin set a neighborhood's description", async () => {
    const { cookies } = await createAuthedUser("admin");
    const region = await createRegion();

    const res = await request(app).post("/api/neighborhoods").set("Cookie", cookies).send({
      regionId: region.id,
      name: "Rittenhouse",
      description: "Tree-lined and walkable.",
      boundaryPoints: regionBoxPoints,
    });

    expect(res.body.neighborhood.description).toBe("Tree-lined and walkable.");
  });

  it("includes the parent region and building stats when getting a neighborhood", async () => {
    const region = await createRegion();
    const neighborhood = await NeighborhoodModel.create({
      regionId: region._id,
      name: "Test Neighborhood",
      boundary: { type: "Polygon", coordinates: [regionBox] },
    });
    await BuildingModel.create({
      address: "INSIDE",
      numberOfUnits: 8,
      location: { type: "Point", coordinates: [-75.15, 39.95] },
    });

    const res = await request(app).get(`/api/neighborhoods/${neighborhood.id}`);

    expect(res.status).toBe(200);
    expect(res.body.region.name).toBe("Test Region");
    expect(res.body.buildingCount).toBe(1);
    expect(res.body.totalUnits).toBe(8);
  });
});
