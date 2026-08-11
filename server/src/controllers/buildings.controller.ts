import type { Request, Response } from "express";
import { z } from "zod";
import { isR2Configured } from "../config/r2";
import { BuildingModel } from "../models/Building";
import { NeighborhoodModel } from "../models/Neighborhood";
import { RegionModel } from "../models/Region";
import { UserModel } from "../models/User";
import { verifyAccessToken, type AccessTokenPayload } from "../services/tokens";
import { resolveAreaFilter } from "../utils/boundaries";
import { closeRing, isValidRing } from "../utils/geo";
import {
  MAX_PHOTOS_PER_ENTITY,
  MAX_UPLOAD_BYTES,
  PhotoNotFoundError,
  buildObjectKey,
  buildPublicUrl,
  createPresignedUploadUrl,
  deleteObject,
  isAllowedContentType,
  verifyUploadedObject,
} from "../utils/photos";

const MAX_LIMIT = 100;

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(20),
  zipCode: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  mine: z.literal("true").optional(),
  regionId: z.string().trim().min(1).optional(),
  neighborhoodId: z.string().trim().min(1).optional(),
});

export async function list(req: Request, res: Response): Promise<void> {
  const { page, limit, zipCode, q, mine, regionId, neighborhoodId } = listQuerySchema.parse(
    req.query,
  );

  const filter: Record<string, unknown> = {};
  if (zipCode) filter.zipCode = zipCode;
  if (q) {
    const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ address: pattern }, { buildingName: pattern }];
  }

  if (regionId || neighborhoodId) {
    const areaFilter = await resolveAreaFilter({ regionId, neighborhoodId });
    if (areaFilter === false) {
      res.json({ buildings: [], total: 0, page, limit });
      return;
    }
    Object.assign(filter, areaFilter);
  }

  if (mine) {
    // Public route, so auth here is best-effort: no cookie/invalid token just
    // means "no buildings", not a hard 401 — the rest of the endpoint stays
    // usable without a session.
    const token = req.cookies?.accessToken as string | undefined;
    const payload = token ? tryVerifyAccessToken(token) : null;
    if (!payload) {
      res.json({ buildings: [], total: 0, page, limit });
      return;
    }
    filter.managedBy = payload.sub;
  }

  const [buildings, total] = await Promise.all([
    BuildingModel.find(filter)
      .sort({ address: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    BuildingModel.countDocuments(filter),
  ]);

  res.json({ buildings, total, page, limit });
}

function tryVerifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

// A closed ring of [lon, lat] pairs, sent by the client as a JSON string
// (from a drawn polygon/rectangle) — validated and auto-closed here so a
// malformed or open ring can't reach the $geoWithin query.
const polygonSchema = z
  .string()
  .optional()
  .transform((val, ctx): [number, number][] | undefined => {
    if (!val) return undefined;

    let parsed: unknown;
    try {
      parsed = JSON.parse(val);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "polygon must be valid JSON" });
      return z.NEVER;
    }

    if (!isValidRing(parsed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "polygon must be an array of at least 3 [lon, lat] pairs",
      });
      return z.NEVER;
    }

    return closeRing(parsed);
  });

const mapQuerySchema = z.object({
  zipCode: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  polygon: polygonSchema,
  regionId: z.string().trim().min(1).optional(),
  neighborhoodId: z.string().trim().min(1).optional(),
});

// Lightweight, unpaginated points for the map view — full building docs
// (owner, market value, unit mix, etc.) would be a lot of unused payload
// across ~1,400 markers, so this only sends what a pin/popup needs.
export async function map(req: Request, res: Response): Promise<void> {
  const { zipCode, q, polygon, regionId, neighborhoodId } = mapQuerySchema.parse(req.query);

  let filter: Record<string, unknown>;
  if (regionId || neighborhoodId) {
    const areaFilter = await resolveAreaFilter({ regionId, neighborhoodId });
    if (areaFilter === false) {
      res.json({ buildings: [] });
      return;
    }
    filter = areaFilter ?? { "location.coordinates": { $exists: true } };
  } else if (polygon) {
    filter = {
      location: { $geoWithin: { $geometry: { type: "Polygon", coordinates: [polygon] } } },
    };
  } else {
    filter = { "location.coordinates": { $exists: true } };
  }

  if (zipCode) filter.zipCode = zipCode;
  if (q) {
    const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ address: pattern }, { buildingName: pattern }];
  }

  const buildings = await BuildingModel.find(filter)
    .select("buildingName address zipCode numberOfUnits location")
    .lean();

  res.json({
    buildings: buildings.map((b) => ({
      _id: b._id,
      buildingName: b.buildingName ?? null,
      address: b.address,
      zipCode: b.zipCode ?? null,
      numberOfUnits: b.numberOfUnits ?? null,
      lat: b.location!.coordinates![1],
      lon: b.location!.coordinates![0],
    })),
  });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const building = await BuildingModel.findById(req.params.id);
  if (!building) {
    res.status(404).json({ message: "Building not found" });
    return;
  }

  // Region/neighborhood membership isn't stored on the building — it's
  // derived from its point falling inside a drawn boundary, so it's looked
  // up fresh rather than risking a stale denormalized reference after an
  // admin edits or redraws a region/neighborhood shape.
  let region = null;
  let neighborhood = null;
  if (building.location?.coordinates) {
    const point = { type: "Point" as const, coordinates: building.location.coordinates };
    [region, neighborhood] = await Promise.all([
      RegionModel.findOne({ boundary: { $geoIntersects: { $geometry: point } } }),
      NeighborhoodModel.findOne({ boundary: { $geoIntersects: { $geometry: point } } }),
    ]);
  }

  res.json({ building, region, neighborhood });
}

// Fields an admin can set, covering every parameter surfaced in the UI.
// Excludes derived/data-pipeline fields (source, unitMix, rent, location,
// parcelNumber, *Source, constructionEra) which come from the CSV import,
// not hand-editing.
const adminFields = {
  address: z.string().trim().min(1),
  zipCode: z.string().trim().min(1).nullable(),
  buildingName: z.string().trim().min(1).nullable(),
  leasingPhone: z.string().trim().min(1).nullable(),
  leasingEmail: z.string().trim().email().nullable(),
  website: z.string().trim().url().nullable(),
  numberOfUnits: z.coerce.number().int().nonnegative().nullable(),
  yearBuilt: z.coerce.number().int().nullable(),
  numberOfStories: z.coerce.number().int().nonnegative().nullable(),
  totalLivableArea: z.coerce.number().nonnegative().nullable(),
  marketValue: z.coerce.number().nonnegative().nullable(),
  ownerBusinessName: z.string().trim().min(1).nullable(),
  managedBy: z.string().trim().min(1).nullable(),
};

const createSchema = z.object(adminFields).partial({
  zipCode: true,
  buildingName: true,
  leasingPhone: true,
  leasingEmail: true,
  website: true,
  numberOfUnits: true,
  yearBuilt: true,
  numberOfStories: true,
  totalLivableArea: true,
  marketValue: true,
  ownerBusinessName: true,
  managedBy: true,
});

const adminUpdateSchema = z
  .object(adminFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });

// A client only manages their assigned building's leasing/contact info.
const clientUpdateSchema = z
  .object({
    leasingPhone: adminFields.leasingPhone,
    leasingEmail: adminFields.leasingEmail,
    website: adminFields.website,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });

// Returns false if managedBy is set but doesn't reference an existing client user.
async function isValidManager(managedBy: string | null | undefined): Promise<boolean> {
  if (!managedBy) return true;
  const manager = await UserModel.findById(managedBy);
  return manager?.role === "client";
}

export async function create(req: Request, res: Response): Promise<void> {
  const data = createSchema.parse(req.body);
  if (!(await isValidManager(data.managedBy))) {
    res.status(400).json({ message: "managedBy must reference an existing client user" });
    return;
  }
  const building = await BuildingModel.create(data);
  res.status(201).json({ building });
}

export async function update(req: Request, res: Response): Promise<void> {
  const currentUser = req.currentUser!;
  const building = await BuildingModel.findById(req.params.id);
  if (!building) {
    res.status(404).json({ message: "Building not found" });
    return;
  }

  if (currentUser.role === "admin") {
    const data = adminUpdateSchema.parse(req.body);
    if ("managedBy" in data && !(await isValidManager(data.managedBy))) {
      res.status(400).json({ message: "managedBy must reference an existing client user" });
      return;
    }
    Object.assign(building, data);
  } else if (currentUser.role === "client") {
    if (!building.managedBy || building.managedBy.toString() !== currentUser.id) {
      res.status(403).json({ message: "You do not manage this building" });
      return;
    }
    const data = clientUpdateSchema.parse(req.body);
    Object.assign(building, data);
  } else {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  await building.save();
  res.json({ building });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const building = await BuildingModel.findByIdAndDelete(req.params.id);
  if (!building) {
    res.status(404).json({ message: "Building not found" });
    return;
  }
  res.status(204).send();
}

const presignPhotoSchema = z.object({ contentType: z.string().trim().min(1) });

export async function presignPhoto(req: Request, res: Response): Promise<void> {
  if (!isR2Configured()) {
    res.status(503).json({ message: "Image storage is not configured" });
    return;
  }
  const { contentType } = presignPhotoSchema.parse(req.body);
  if (!isAllowedContentType(contentType)) {
    res.status(400).json({ message: "Unsupported content type" });
    return;
  }

  const exists = await BuildingModel.exists({ _id: req.params.id });
  if (!exists) {
    res.status(404).json({ message: "Building not found" });
    return;
  }

  const key = buildObjectKey("buildings", req.params.id, contentType);
  const uploadUrl = await createPresignedUploadUrl(key, contentType);
  res.json({ uploadUrl, key });
}

const confirmPhotoSchema = z.object({ key: z.string().trim().min(1) });

export async function addPhoto(req: Request, res: Response): Promise<void> {
  if (!isR2Configured()) {
    res.status(503).json({ message: "Image storage is not configured" });
    return;
  }
  const { key } = confirmPhotoSchema.parse(req.body);

  let contentLength: number;
  try {
    ({ contentLength } = await verifyUploadedObject(key));
  } catch (err) {
    if (err instanceof PhotoNotFoundError) {
      res.status(400).json({ message: "Upload not found in storage — try uploading again." });
      return;
    }
    throw err;
  }

  if (contentLength > MAX_UPLOAD_BYTES) {
    await deleteObject(key);
    res.status(400).json({ message: "File is too large." });
    return;
  }

  const updated = await BuildingModel.findOneAndUpdate(
    { _id: req.params.id, $expr: { $lt: [{ $size: "$photos" }, MAX_PHOTOS_PER_ENTITY] } },
    { $push: { photos: { key, url: buildPublicUrl(key), uploadedAt: new Date() } } },
    { new: true },
  );

  if (!updated) {
    const exists = await BuildingModel.exists({ _id: req.params.id });
    res
      .status(exists ? 400 : 404)
      .json({
        message: exists
          ? `A building can have at most ${MAX_PHOTOS_PER_ENTITY} photos.`
          : "Building not found",
      });
    return;
  }

  res.json({ building: updated });
}

const deletePhotoQuerySchema = z.object({ key: z.string().trim().min(1) });

export async function deletePhoto(req: Request, res: Response): Promise<void> {
  if (!isR2Configured()) {
    res.status(503).json({ message: "Image storage is not configured" });
    return;
  }
  const { key } = deletePhotoQuerySchema.parse(req.query);

  const building = await BuildingModel.findById(req.params.id);
  if (!building) {
    res.status(404).json({ message: "Building not found" });
    return;
  }
  if (!building.photos.some((photo) => photo.key === key)) {
    res.status(404).json({ message: "Photo not found" });
    return;
  }

  await deleteObject(key);
  await BuildingModel.updateOne({ _id: req.params.id }, { $pull: { photos: { key } } });
  res.status(204).send();
}
