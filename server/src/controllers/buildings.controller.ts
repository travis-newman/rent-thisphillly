import type { Request, Response } from "express";
import { z } from "zod";
import { BuildingModel } from "../models/Building";
import { UserModel } from "../models/User";
import { verifyAccessToken, type AccessTokenPayload } from "../services/tokens";

const MAX_LIMIT = 100;

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(20),
  zipCode: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  mine: z.literal("true").optional(),
});

export async function list(req: Request, res: Response): Promise<void> {
  const { page, limit, zipCode, q, mine } = listQuerySchema.parse(req.query);

  const filter: Record<string, unknown> = {};
  if (zipCode) filter.zipCode = zipCode;
  if (q) {
    const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ address: pattern }, { buildingName: pattern }];
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

export async function getById(req: Request, res: Response): Promise<void> {
  const building = await BuildingModel.findById(req.params.id);
  if (!building) {
    res.status(404).json({ message: "Building not found" });
    return;
  }
  res.json({ building });
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
