import { Schema, model, type Types } from "mongoose";
import type { Photo } from "../utils/photos";

// InferSchemaType misreads a single-level array-of-subdocuments field
// (confirmed while adding `photos` below — it infers a full Mongoose
// `Subdocument` shape instead of a plain object) the same way it already
// does for Region/Neighborhood's triple-nested boundary coordinates, so
// this model's document shape is hand-written too rather than inferred.
export interface Building {
  address: string;
  zipCode: string | null;
  buildingName: string | null;
  leasingPhone: string | null;
  leasingEmail: string | null;
  website: string | null;
  websiteSource: string | null;
  contactConfidence: string | null;
  numberOfUnits: number | null;
  yearBuilt: number | null;
  yearBuiltSource: string | null;
  constructionEra: string | null;
  numberOfStories: number | null;
  totalLivableArea: number | null;
  marketValue: number | null;
  ownerBusinessName: string | null;
  parcelNumber: string | null;
  managedBy: Types.ObjectId | null;
  source: string | null;
  activeListingsCount: number;
  unitMix: {
    studio: number | null;
    br1: number | null;
    br2: number | null;
    br3plus: number | null;
  };
  rent: { min: number | null; max: number | null };
  location?: { type: "Point"; coordinates: number[] };
  photos: Photo[];
}

const buildingSchema = new Schema<Building>(
  {
    address: { type: String, required: true, trim: true },
    zipCode: { type: String, trim: true },
    buildingName: { type: String, trim: true },

    leasingPhone: { type: String, trim: true },
    leasingEmail: { type: String, trim: true },
    website: { type: String, trim: true },
    websiteSource: { type: String, trim: true },
    contactConfidence: { type: String, trim: true },

    numberOfUnits: { type: Number, default: null },
    yearBuilt: { type: Number, default: null },
    yearBuiltSource: { type: String, trim: true },
    constructionEra: { type: String, trim: true },
    numberOfStories: { type: Number, default: null },
    totalLivableArea: { type: Number, default: null },
    marketValue: { type: Number, default: null },

    ownerBusinessName: { type: String, trim: true },
    parcelNumber: { type: String, trim: true },

    // The client user who manages this building's listing (assigned by an admin).
    managedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

    source: { type: String, trim: true },

    activeListingsCount: { type: Number, default: 0 },
    unitMix: {
      studio: { type: Number, default: null },
      br1: { type: Number, default: null },
      br2: { type: Number, default: null },
      br3plus: { type: Number, default: null },
    },
    rent: {
      min: { type: Number, default: null },
      max: { type: Number, default: null },
    },

    location: {
      type: { type: String, enum: ["Point"], default: undefined },
      coordinates: { type: [Number], default: undefined },
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

buildingSchema.index({ location: "2dsphere" });
buildingSchema.index({ zipCode: 1 });
buildingSchema.index({ parcelNumber: 1 });
buildingSchema.index({ managedBy: 1 });
buildingSchema.index({ address: 1, zipCode: 1 });

export const BuildingModel = model<Building>("Building", buildingSchema);
