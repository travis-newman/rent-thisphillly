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

const listQuerySchema = z.object({
  regionId: z.string().trim().min(1).optional(),
});

export async function list(req: Request, res: Response): Promise<void> {
  const { regionId } = listQuerySchema.parse(req.query);
  const filter = regionId ? { regionId } : {};
  const neighborhoods = await NeighborhoodModel.find(filter).sort({ name: 1 });
  res.json({ neighborhoods });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const neighborhood = await NeighborhoodModel.findById(req.params.id);
  if (!neighborhood) {
    res.status(404).json({ message: "Neighborhood not found" });
    return;
  }
  const [region, stats] = await Promise.all([
    RegionModel.findById(neighborhood.regionId),
    areaStats(neighborhood.boundary),
  ]);
  res.json({ neighborhood, region, ...stats });
}

async function regionExists(regionId: string): Promise<boolean> {
  return (await RegionModel.exists({ _id: regionId })) !== null;
}

const createSchema = z.object({
  regionId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  boundaryPoints: boundaryPointsInputSchema,
});

export async function create(req: Request, res: Response): Promise<void> {
  const { regionId, name, description, boundaryPoints } = createSchema.parse(req.body);

  if (!(await regionExists(regionId))) {
    res.status(400).json({ message: "regionId must reference an existing region" });
    return;
  }

  const ring = closeRing(boundaryPointsToRing(boundaryPoints));
  const neighborhood = await NeighborhoodModel.create({
    regionId,
    name,
    description: description ?? null,
    boundaryPoints,
    boundary: { type: "Polygon", coordinates: [ring] },
  });
  res.status(201).json({ neighborhood });
}

const updateSchema = z
  .object({
    regionId: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1).nullable(),
    boundaryPoints: boundaryPointsInputSchema,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });

export async function update(req: Request, res: Response): Promise<void> {
  const data = updateSchema.parse(req.body);

  const neighborhood = await NeighborhoodModel.findById(req.params.id);
  if (!neighborhood) {
    res.status(404).json({ message: "Neighborhood not found" });
    return;
  }

  if (data.regionId !== undefined) {
    if (!(await regionExists(data.regionId))) {
      res.status(400).json({ message: "regionId must reference an existing region" });
      return;
    }
    Object.assign(neighborhood, { regionId: data.regionId });
  }
  if (data.name !== undefined) neighborhood.name = data.name;
  if (data.description !== undefined) neighborhood.description = data.description;
  if (data.boundaryPoints !== undefined) {
    neighborhood.boundaryPoints = data.boundaryPoints.map((p) => ({
      label: p.label ?? null,
      lat: p.lat,
      lon: p.lon,
    }));
    const ring = closeRing(boundaryPointsToRing(data.boundaryPoints));
    neighborhood.boundary = { type: "Polygon", coordinates: [ring] };
  }
  await neighborhood.save();

  res.json({ neighborhood });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const neighborhood = await NeighborhoodModel.findByIdAndDelete(req.params.id);
  if (!neighborhood) {
    res.status(404).json({ message: "Neighborhood not found" });
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

  const exists = await NeighborhoodModel.exists({ _id: req.params.id });
  if (!exists) {
    res.status(404).json({ message: "Neighborhood not found" });
    return;
  }

  const key = buildObjectKey("neighborhoods", req.params.id, contentType);
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

  const updated = await NeighborhoodModel.findOneAndUpdate(
    { _id: req.params.id, $expr: { $lt: [{ $size: "$photos" }, MAX_PHOTOS_PER_ENTITY] } },
    { $push: { photos: { key, url: buildPublicUrl(key), uploadedAt: new Date() } } },
    { new: true },
  );

  if (!updated) {
    const exists = await NeighborhoodModel.exists({ _id: req.params.id });
    res.status(exists ? 400 : 404).json({
      message: exists
        ? `A neighborhood can have at most ${MAX_PHOTOS_PER_ENTITY} photos.`
        : "Neighborhood not found",
    });
    return;
  }

  res.json({ neighborhood: updated });
}

const deletePhotoQuerySchema = z.object({ key: z.string().trim().min(1) });

export async function deletePhoto(req: Request, res: Response): Promise<void> {
  if (!isR2Configured()) {
    res.status(503).json({ message: "Image storage is not configured" });
    return;
  }
  const { key } = deletePhotoQuerySchema.parse(req.query);

  const neighborhood = await NeighborhoodModel.findById(req.params.id);
  if (!neighborhood) {
    res.status(404).json({ message: "Neighborhood not found" });
    return;
  }
  if (!neighborhood.photos.some((photo) => photo.key === key)) {
    res.status(404).json({ message: "Photo not found" });
    return;
  }

  await deleteObject(key);
  await NeighborhoodModel.updateOne({ _id: req.params.id }, { $pull: { photos: { key } } });
  res.status(204).send();
}
