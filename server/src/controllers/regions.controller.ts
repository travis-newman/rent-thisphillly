import type { Request, Response } from "express";
import { z } from "zod";
import { isR2Configured } from "../config/r2";
import { NeighborhoodModel } from "../models/Neighborhood";
import { RegionModel } from "../models/Region";
import { areaStats } from "../utils/boundaries";
import { boundaryPointsToRing, closeRing } from "../utils/geo";
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

// Boundary points are the human-authored form (usually street
// intersections, optionally labeled) — the GeoJSON `boundary` polygon used
// for geospatial queries is derived from them on every create/update.
const boundaryPointsInputSchema = z
  .array(
    z.object({
      // An unlabeled point comes in as "" from the map click-to-add UI —
      // normalize that (and null/undefined) all down to null.
      label: z
        .string()
        .trim()
        .nullable()
        .optional()
        .transform((v) => v || null),
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    }),
  )
  .min(3, "boundary must have at least 3 points");

export async function list(_req: Request, res: Response): Promise<void> {
  const regions = await RegionModel.find().sort({ name: 1 });
  const neighborhoodCounts = await NeighborhoodModel.aggregate<{ _id: unknown; count: number }>([
    { $group: { _id: "$regionId", count: { $sum: 1 } } },
  ]);
  const countByRegionId = new Map(neighborhoodCounts.map((c) => [String(c._id), c.count]));

  res.json({
    regions: regions.map((region) => ({
      ...region.toObject(),
      neighborhoodCount: countByRegionId.get(String(region._id)) ?? 0,
    })),
  });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const region = await RegionModel.findById(req.params.id);
  if (!region) {
    res.status(404).json({ message: "Region not found" });
    return;
  }
  const neighborhoods = await NeighborhoodModel.find({ regionId: region._id }).sort({ name: 1 });
  const stats = await areaStats(region.boundary);
  res.json({ region, neighborhoods, ...stats });
}

const createSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  boundaryPoints: boundaryPointsInputSchema,
});

export async function create(req: Request, res: Response): Promise<void> {
  const { name, description, boundaryPoints } = createSchema.parse(req.body);
  const ring = closeRing(boundaryPointsToRing(boundaryPoints));
  const region = await RegionModel.create({
    name,
    description: description ?? null,
    boundaryPoints,
    boundary: { type: "Polygon", coordinates: [ring] },
  });
  res.status(201).json({ region });
}

const updateSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().min(1).nullable(),
    boundaryPoints: boundaryPointsInputSchema,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });

export async function update(req: Request, res: Response): Promise<void> {
  const data = updateSchema.parse(req.body);

  const region = await RegionModel.findById(req.params.id);
  if (!region) {
    res.status(404).json({ message: "Region not found" });
    return;
  }

  if (data.name !== undefined) region.name = data.name;
  if (data.description !== undefined) region.description = data.description;
  if (data.boundaryPoints !== undefined) {
    region.boundaryPoints = data.boundaryPoints.map((p) => ({
      label: p.label ?? null,
      lat: p.lat,
      lon: p.lon,
    }));
    const ring = closeRing(boundaryPointsToRing(data.boundaryPoints));
    region.boundary = { type: "Polygon", coordinates: [ring] };
  }
  await region.save();

  res.json({ region });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const region = await RegionModel.findByIdAndDelete(req.params.id);
  if (!region) {
    res.status(404).json({ message: "Region not found" });
    return;
  }
  // A neighborhood only makes sense scoped to its region, so it can't be left
  // behind as an orphan once the region it belongs to is gone.
  await NeighborhoodModel.deleteMany({ regionId: region._id });
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

  const exists = await RegionModel.exists({ _id: req.params.id });
  if (!exists) {
    res.status(404).json({ message: "Region not found" });
    return;
  }

  const key = buildObjectKey("regions", req.params.id, contentType);
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

  const updated = await RegionModel.findOneAndUpdate(
    { _id: req.params.id, $expr: { $lt: [{ $size: "$photos" }, MAX_PHOTOS_PER_ENTITY] } },
    { $push: { photos: { key, url: buildPublicUrl(key), uploadedAt: new Date() } } },
    { new: true },
  );

  if (!updated) {
    const exists = await RegionModel.exists({ _id: req.params.id });
    res.status(exists ? 400 : 404).json({
      message: exists
        ? `A region can have at most ${MAX_PHOTOS_PER_ENTITY} photos.`
        : "Region not found",
    });
    return;
  }

  res.json({ region: updated });
}

const deletePhotoQuerySchema = z.object({ key: z.string().trim().min(1) });

export async function deletePhoto(req: Request, res: Response): Promise<void> {
  if (!isR2Configured()) {
    res.status(503).json({ message: "Image storage is not configured" });
    return;
  }
  const { key } = deletePhotoQuerySchema.parse(req.query);

  const region = await RegionModel.findById(req.params.id);
  if (!region) {
    res.status(404).json({ message: "Region not found" });
    return;
  }
  if (!region.photos.some((photo) => photo.key === key)) {
    res.status(404).json({ message: "Photo not found" });
    return;
  }

  await deleteObject(key);
  await RegionModel.updateOne({ _id: req.params.id }, { $pull: { photos: { key } } });
  res.status(204).send();
}
