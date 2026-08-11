import { Schema, model, type Types } from "mongoose";
import type { Photo } from "../utils/photos";
import type { BoundaryPoint, RegionBoundary } from "./Region";

// See Region.ts — InferSchemaType misreads the triple-nested boundary
// coordinates, so this document shape is hand-written too.
export interface Neighborhood {
  name: string;
  description: string | null;
  regionId: Types.ObjectId;
  boundaryPoints: BoundaryPoint[];
  boundary: RegionBoundary;
  photos: Photo[];
}

const neighborhoodSchema = new Schema<Neighborhood>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: null },
    regionId: { type: Schema.Types.ObjectId, ref: "Region", required: true },
    boundaryPoints: [
      {
        _id: false,
        label: { type: String, trim: true, default: null },
        lat: { type: Number, required: true },
        lon: { type: Number, required: true },
      },
    ],
    // GeoJSON Polygon: a single outer ring, no holes.
    boundary: {
      type: { type: String, enum: ["Polygon"], required: true },
      coordinates: { type: [[[Number]]], required: true },
    },

    photos: [
      {
        _id: false,
        key: { type: String, required: true },
        url: { type: String, required: true },
        uploadedAt: { type: Date, required: true },
      },
    ],
  },
  { timestamps: true },
);

neighborhoodSchema.index({ boundary: "2dsphere" });
neighborhoodSchema.index({ regionId: 1 });

export const NeighborhoodModel = model<Neighborhood>("Neighborhood", neighborhoodSchema);
