import { Schema, model, type InferSchemaType } from "mongoose";

const buildingSchema = new Schema(
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
  },
  { timestamps: true },
);

buildingSchema.index({ location: "2dsphere" });
buildingSchema.index({ zipCode: 1 });
buildingSchema.index({ parcelNumber: 1 });
buildingSchema.index({ managedBy: 1 });
buildingSchema.index({ address: 1, zipCode: 1 });

export type Building = InferSchemaType<typeof buildingSchema>;

export const BuildingModel = model("Building", buildingSchema);
