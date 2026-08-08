import type { Request, Response } from "express";
import { z } from "zod";
import { ROLES, UserModel } from "../models/User";

export async function list(_req: Request, res: Response): Promise<void> {
  const users = await UserModel.find().select("email role status createdAt").sort({ createdAt: 1 });
  res.json({ users });
}

const updateSchema = z
  .object({
    role: z.enum(ROLES),
    status: z.enum(["active", "suspended"]),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });

export async function update(req: Request, res: Response): Promise<void> {
  const data = updateSchema.parse(req.body);

  const user = await UserModel.findByIdAndUpdate(req.params.id, data, { new: true }).select(
    "email role status createdAt",
  );
  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }
  res.json({ user });
}
