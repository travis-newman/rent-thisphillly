import { Schema, model } from "mongoose";
import type { Photo } from "../utils/photos";

// InferSchemaType misreads a triple-nested [[[Number]]] array as a
// DocumentArray of subdocuments rather than plain numbers, so this model's
// document shape is hand-written instead of inferred from the schema.
export interface RegionBoundary {
  type: "Polygon";
  coordinates: number[][][];
}

// The human-authored form of a boundary: an ordered list of points (most
// often street intersections), each optionally labeled. `boundary` above is
// derived from these on every create/update and is what geospatial queries
// actually run against; `boundaryPoints` is what the admin UI edits.
export interface BoundaryPoint {
  label: string | null;
  lat: number;
  lon: number;
}

export interface Region {
  name: string;
  description: string | null;
  boundaryPoints: BoundaryPoint[];
  boundary: RegionBoundary;
  photos: Photo[];
}

const regionSchema = new Schema<Region>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: null },
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

regionSchema.index({ boundary: "2dsphere" });

export const RegionModel = model<Region>("Region", regionSchema);
