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
  await BuildingModel.deleteMany({});
  await UserModel.deleteMany({});
  await RegionModel.deleteMany({});
  await NeighborhoodModel.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function seedBuildings() {
  await BuildingModel.create([
    { address: "100 MARKET ST", zipCode: "19106", buildingName: "Market Lofts" },
    { address: "200 CHESTNUT ST", zipCode: "19106", buildingName: "Chestnut Place" },
    { address: "1 CITY AVE", zipCode: "19131", buildingName: "City View Apartments" },
  ]);
}

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

describe("buildings routes", () => {
  it("lists buildings with pagination", async () => {
    await seedBuildings();

    const res = await request(app).get("/api/buildings").query({ limit: 2 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.buildings).toHaveLength(2);
  });

  it("filters by zip code", async () => {
    await seedBuildings();

    const res = await request(app).get("/api/buildings").query({ zipCode: "19131" });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.buildings[0].address).toBe("1 CITY AVE");
  });

  it("searches by address or building name", async () => {
    await seedBuildings();

    const res = await request(app).get("/api/buildings").query({ q: "chestnut" });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.buildings[0].buildingName).toBe("Chestnut Place");
  });

  it("gets a single building by id", async () => {
    await seedBuildings();
    const building = await BuildingModel.findOne({ address: "1 CITY AVE" });

    const res = await request(app).get(`/api/buildings/${building!.id}`);

    expect(res.status).toBe(200);
    expect(res.body.building.buildingName).toBe("City View Apartments");
  });

  it("resolves the containing region and neighborhood on a building's detail response", async () => {
    const regionBox = [
      [-75.2, 39.9],
      [-75.1, 39.9],
      [-75.1, 40.0],
      [-75.2, 40.0],
      [-75.2, 39.9],
    ];
    const neighborhoodBox = [
      [-75.18, 39.92],
      [-75.12, 39.92],
      [-75.12, 39.98],
      [-75.18, 39.98],
      [-75.18, 39.92],
    ];
    const region = await RegionModel.create({
      name: "Test Region",
      boundary: { type: "Polygon", coordinates: [regionBox] },
    });
    await NeighborhoodModel.create({
      regionId: region._id,
      name: "Test Neighborhood",
      boundary: { type: "Polygon", coordinates: [neighborhoodBox] },
    });

    const inBoth = await BuildingModel.create({
      address: "INSIDE NEIGHBORHOOD",
      location: { type: "Point", coordinates: [-75.15, 39.95] },
    });
    const inRegionOnly = await BuildingModel.create({
      address: "INSIDE REGION ONLY",
      location: { type: "Point", coordinates: [-75.19, 39.91] },
    });
    const inNeither = await BuildingModel.create({
      address: "OUTSIDE BOTH",
      location: { type: "Point", coordinates: [-75.5, 40.3] },
    });

    const bothRes = await request(app).get(`/api/buildings/${inBoth.id}`);
    expect(bothRes.body.region.name).toBe("Test Region");
    expect(bothRes.body.neighborhood.name).toBe("Test Neighborhood");

    const regionOnlyRes = await request(app).get(`/api/buildings/${inRegionOnly.id}`);
    expect(regionOnlyRes.body.region.name).toBe("Test Region");
    expect(regionOnlyRes.body.neighborhood).toBeNull();

    const neitherRes = await request(app).get(`/api/buildings/${inNeither.id}`);
    expect(neitherRes.body.region).toBeNull();
    expect(neitherRes.body.neighborhood).toBeNull();
  });

  it("returns 404 for a missing building", async () => {
    const missingId = new mongoose.Types.ObjectId();

    const res = await request(app).get(`/api/buildings/${missingId}`);

    expect(res.status).toBe(404);
  });

  it("returns lightweight map points only for buildings with a location", async () => {
    await seedBuildings(); // none of these have a location
    await BuildingModel.create({
      address: "300 GEO ST",
      zipCode: "19106",
      buildingName: "Geo Towers",
      numberOfUnits: 10,
      location: { type: "Point", coordinates: [-75.16, 39.95] },
    });

    const res = await request(app).get("/api/buildings/map");

    expect(res.status).toBe(200);
    expect(res.body.buildings).toHaveLength(1);
    expect(res.body.buildings[0]).toMatchObject({
      buildingName: "Geo Towers",
      address: "300 GEO ST",
      numberOfUnits: 10,
      lon: -75.16,
      lat: 39.95,
    });
  });

  it("filters map points by search query", async () => {
    await BuildingModel.create([
      {
        address: "300 GEO ST",
        buildingName: "Geo Towers",
        location: { type: "Point", coordinates: [-75.16, 39.95] },
      },
      {
        address: "400 OTHER ST",
        buildingName: "Other Place",
        location: { type: "Point", coordinates: [-75.17, 39.96] },
      },
    ]);

    const res = await request(app).get("/api/buildings/map").query({ q: "geo" });

    expect(res.status).toBe(200);
    expect(res.body.buildings).toHaveLength(1);
    expect(res.body.buildings[0].buildingName).toBe("Geo Towers");
  });

  it("filters map points to those inside a region or neighborhood", async () => {
    const regionBox = [
      [-75.2, 39.9],
      [-75.1, 39.9],
      [-75.1, 40.0],
      [-75.2, 40.0],
      [-75.2, 39.9],
    ];
    const neighborhoodBox = [
      [-75.18, 39.92],
      [-75.12, 39.92],
      [-75.12, 39.98],
      [-75.18, 39.98],
      [-75.18, 39.92],
    ];
    const region = await RegionModel.create({
      name: "Test Region",
      boundary: { type: "Polygon", coordinates: [regionBox] },
    });
    const neighborhood = await NeighborhoodModel.create({
      regionId: region._id,
      name: "Test Neighborhood",
      boundary: { type: "Polygon", coordinates: [neighborhoodBox] },
    });
    await BuildingModel.create([
      { address: "IN BOTH", location: { type: "Point", coordinates: [-75.15, 39.95] } },
      { address: "REGION ONLY", location: { type: "Point", coordinates: [-75.19, 39.91] } },
      { address: "NEITHER", location: { type: "Point", coordinates: [-75.5, 40.3] } },
    ]);

    const regionRes = await request(app).get("/api/buildings/map").query({ regionId: region.id });
    expect(regionRes.body.buildings).toHaveLength(2);

    const neighborhoodRes = await request(app)
      .get("/api/buildings/map")
      .query({ neighborhoodId: neighborhood.id });
    expect(neighborhoodRes.body.buildings).toHaveLength(1);
    expect(neighborhoodRes.body.buildings[0].address).toBe("IN BOTH");
  });

  it("returns no map points for a non-existent regionId", async () => {
    const res = await request(app)
      .get("/api/buildings/map")
      .query({ regionId: new mongoose.Types.ObjectId().toString() });
    expect(res.status).toBe(200);
    expect(res.body.buildings).toEqual([]);
  });

  it("filters map points to those inside a drawn polygon", async () => {
    await BuildingModel.create([
      { address: "INSIDE ST", location: { type: "Point", coordinates: [-75.16, 39.95] } },
      { address: "OUTSIDE ST", location: { type: "Point", coordinates: [-75.3, 40.1] } },
    ]);

    // A box around [-75.17, 39.94] to [-75.15, 39.96], which contains
    // "INSIDE ST" (-75.16, 39.95) but not "OUTSIDE ST".
    const polygon = [
      [-75.17, 39.94],
      [-75.15, 39.94],
      [-75.15, 39.96],
      [-75.17, 39.96],
      [-75.17, 39.94],
    ];

    const res = await request(app)
      .get("/api/buildings/map")
      .query({ polygon: JSON.stringify(polygon) });

    expect(res.status).toBe(200);
    expect(res.body.buildings).toHaveLength(1);
    expect(res.body.buildings[0].address).toBe("INSIDE ST");
  });

  it("auto-closes an open polygon ring", async () => {
    await BuildingModel.create({
      address: "INSIDE ST",
      location: { type: "Point", coordinates: [-75.16, 39.95] },
    });

    // Same box as above but without repeating the first point at the end.
    const openRing = [
      [-75.17, 39.94],
      [-75.15, 39.94],
      [-75.15, 39.96],
      [-75.17, 39.96],
    ];

    const res = await request(app)
      .get("/api/buildings/map")
      .query({ polygon: JSON.stringify(openRing) });

    expect(res.status).toBe(200);
    expect(res.body.buildings).toHaveLength(1);
  });

  it("rejects a malformed polygon", async () => {
    const res = await request(app).get("/api/buildings/map").query({ polygon: "not json" });
    expect(res.status).toBe(400);

    const tooFewPoints = await request(app)
      .get("/api/buildings/map")
      .query({
        polygon: JSON.stringify([
          [1, 2],
          [3, 4],
        ]),
      });
    expect(tooFewPoints.status).toBe(400);
  });

  it("filters the paginated list to buildings inside a region", async () => {
    const regionBox = [
      [-75.2, 39.9],
      [-75.1, 39.9],
      [-75.1, 40.0],
      [-75.2, 40.0],
      [-75.2, 39.9],
    ];
    const region = await RegionModel.create({
      name: "Test Region",
      boundary: { type: "Polygon", coordinates: [regionBox] },
    });
    await seedBuildings(); // none of these have a location, so none match
    await BuildingModel.create({
      address: "INSIDE REGION",
      location: { type: "Point", coordinates: [-75.15, 39.95] },
    });

    const res = await request(app).get("/api/buildings").query({ regionId: region.id });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.buildings[0].address).toBe("INSIDE REGION");
  });

  it("returns an empty paginated list for a non-existent neighborhoodId", async () => {
    await seedBuildings();

    const res = await request(app)
      .get("/api/buildings")
      .query({ neighborhoodId: new mongoose.Types.ObjectId().toString() });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it("filters to the current client's managed buildings with ?mine=true", async () => {
    const { cookies, userId } = await createAuthedUser("client");
    await seedBuildings();
    await BuildingModel.updateOne({ address: "1 CITY AVE" }, { managedBy: userId });

    const res = await request(app)
      .get("/api/buildings")
      .query({ mine: "true" })
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.buildings[0].address).toBe("1 CITY AVE");
  });

  it("returns no buildings for ?mine=true when not authenticated", async () => {
    await seedBuildings();

    const res = await request(app).get("/api/buildings").query({ mine: "true" });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it("rejects create/update/delete without authentication", async () => {
    await seedBuildings();
    const building = await BuildingModel.findOne({ address: "1 CITY AVE" });

    const createRes = await request(app).post("/api/buildings").send({ address: "1 NEW ST" });
    const updateRes = await request(app)
      .patch(`/api/buildings/${building!.id}`)
      .send({ buildingName: "Hacked" });
    const deleteRes = await request(app).delete(`/api/buildings/${building!.id}`);

    expect(createRes.status).toBe(401);
    expect(updateRes.status).toBe(401);
    expect(deleteRes.status).toBe(401);
  });

  it("rejects create and delete for the client and user roles", async () => {
    await seedBuildings();
    const building = await BuildingModel.findOne({ address: "1 CITY AVE" });

    for (const role of ["client", "user"] as const) {
      const { cookies } = await createAuthedUser(role);

      const createRes = await request(app)
        .post("/api/buildings")
        .set("Cookie", cookies)
        .send({ address: "1 NEW ST" });
      const deleteRes = await request(app)
        .delete(`/api/buildings/${building!.id}`)
        .set("Cookie", cookies);

      expect(createRes.status).toBe(403);
      expect(deleteRes.status).toBe(403);
    }
  });

  it("lets an admin create a building with the full editable field set", async () => {
    const { cookies } = await createAuthedUser("admin");
    const { userId: clientId } = await createAuthedUser("client");

    const res = await request(app).post("/api/buildings").set("Cookie", cookies).send({
      address: "1 NEW ST",
      buildingName: "New Place",
      website: "https://example.com",
      numberOfUnits: 12,
      managedBy: clientId,
    });

    expect(res.status).toBe(201);
    expect(res.body.building.address).toBe("1 NEW ST");
    expect(res.body.building.numberOfUnits).toBe(12);
    expect(res.body.building.managedBy).toBe(clientId);
  });

  it("rejects an admin creating a building without an address", async () => {
    const { cookies } = await createAuthedUser("admin");

    const res = await request(app)
      .post("/api/buildings")
      .set("Cookie", cookies)
      .send({ buildingName: "No Address" });

    expect(res.status).toBe(400);
  });

  it("rejects assigning managedBy to a non-client user", async () => {
    const { cookies } = await createAuthedUser("admin");
    const { userId: plainUserId } = await createAuthedUser("user");

    const res = await request(app)
      .post("/api/buildings")
      .set("Cookie", cookies)
      .send({ address: "1 NEW ST", managedBy: plainUserId });

    expect(res.status).toBe(400);
  });

  it("lets an admin update any field on any building", async () => {
    const { cookies } = await createAuthedUser("admin");
    await seedBuildings();
    const building = await BuildingModel.findOne({ address: "1 CITY AVE" });

    const res = await request(app)
      .patch(`/api/buildings/${building!.id}`)
      .set("Cookie", cookies)
      .send({ address: "2 CITY AVE", buildingName: "Renamed", numberOfUnits: 5 });

    expect(res.status).toBe(200);
    expect(res.body.building.address).toBe("2 CITY AVE");
    expect(res.body.building.buildingName).toBe("Renamed");
    expect(res.body.building.numberOfUnits).toBe(5);
  });

  it("returns 404 when an admin updates a missing building", async () => {
    const { cookies } = await createAuthedUser("admin");
    const missingId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .patch(`/api/buildings/${missingId}`)
      .set("Cookie", cookies)
      .send({ buildingName: "Ghost" });

    expect(res.status).toBe(404);
  });

  it("lets a client update leasing/contact fields on the building they manage", async () => {
    const { cookies, userId } = await createAuthedUser("client");
    await seedBuildings();
    const building = await BuildingModel.findOneAndUpdate(
      { address: "1 CITY AVE" },
      { managedBy: userId },
      { new: true },
    );

    const res = await request(app)
      .patch(`/api/buildings/${building!.id}`)
      .set("Cookie", cookies)
      .send({ leasingPhone: "215-555-0100", website: "https://cityview.example.com" });

    expect(res.status).toBe(200);
    expect(res.body.building.leasingPhone).toBe("215-555-0100");
    expect(res.body.building.website).toBe("https://cityview.example.com");
  });

  it("silently ignores fields outside a client's allowed set", async () => {
    const { cookies, userId } = await createAuthedUser("client");
    await seedBuildings();
    const building = await BuildingModel.findOneAndUpdate(
      { address: "1 CITY AVE" },
      { managedBy: userId },
      { new: true },
    );

    const res = await request(app)
      .patch(`/api/buildings/${building!.id}`)
      .set("Cookie", cookies)
      .send({ address: "HACKED ADDRESS", leasingPhone: "215-555-0100" });

    expect(res.status).toBe(200);
    expect(res.body.building.address).toBe("1 CITY AVE");
    expect(res.body.building.leasingPhone).toBe("215-555-0100");
  });

  it("rejects a client updating a building they don't manage", async () => {
    const { cookies } = await createAuthedUser("client");
    await seedBuildings();
    const building = await BuildingModel.findOne({ address: "1 CITY AVE" });

    const res = await request(app)
      .patch(`/api/buildings/${building!.id}`)
      .set("Cookie", cookies)
      .send({ leasingPhone: "215-555-0100" });

    expect(res.status).toBe(403);
  });

  it("rejects the user role updating any building", async () => {
    const { cookies } = await createAuthedUser("user");
    await seedBuildings();
    const building = await BuildingModel.findOne({ address: "1 CITY AVE" });

    const res = await request(app)
      .patch(`/api/buildings/${building!.id}`)
      .set("Cookie", cookies)
      .send({ leasingPhone: "215-555-0100" });

    expect(res.status).toBe(403);
  });

  it("lets an admin delete a building", async () => {
    const { cookies } = await createAuthedUser("admin");
    await seedBuildings();
    const building = await BuildingModel.findOne({ address: "1 CITY AVE" });

    const res = await request(app).delete(`/api/buildings/${building!.id}`).set("Cookie", cookies);
    expect(res.status).toBe(204);

    const stored = await BuildingModel.findById(building!.id);
    expect(stored).toBeNull();
  });

  it("returns 404 when an admin deletes a missing building", async () => {
    const { cookies } = await createAuthedUser("admin");
    const missingId = new mongoose.Types.ObjectId();

    const res = await request(app).delete(`/api/buildings/${missingId}`).set("Cookie", cookies);

    expect(res.status).toBe(404);
  });
});
