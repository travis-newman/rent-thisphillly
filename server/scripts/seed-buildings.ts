import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import mongoose from "mongoose";

const CSV_PATH = resolve(import.meta.dirname, "../../assets/philadelphia_apartments_master.csv");
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/rent-thisphilly";

// Minimal RFC4180 parser: handles quoted fields, embedded commas, and "" escapes.
// The source data (owner/business names) contains fields like `"FOO, LP"`, so a
// naive split(",") would misalign columns.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // skip, \n handles the line break
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toNullableNumber(value: string): number | null {
  if (!value || value.trim() === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function toNullableString(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

interface BuildingRecord {
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
  source: string | null;
  activeListingsCount: number;
  unitMix: {
    studio: number | null;
    br1: number | null;
    br2: number | null;
    br3plus: number | null;
  };
  rent: { min: number | null; max: number | null };
  location?: { type: "Point"; coordinates: [number, number] };
}

function rowToRecord(header: string[], row: string[]): BuildingRecord | null {
  const get = (name: string): string => {
    const idx = header.indexOf(name);
    return idx === -1 ? "" : (row[idx] ?? "");
  };

  const address = get("address").trim();
  if (!address) return null;

  const lon = toNullableNumber(get("lon"));
  const lat = toNullableNumber(get("lat"));

  return {
    address,
    zipCode: toNullableString(get("zip_code")),
    buildingName: toNullableString(get("building_name")),
    leasingPhone: toNullableString(get("leasing_phone")),
    leasingEmail: toNullableString(get("leasing_email")),
    website: toNullableString(get("website")),
    websiteSource: toNullableString(get("website_source")),
    contactConfidence: toNullableString(get("contact_confidence")),
    numberOfUnits: toNullableNumber(get("numberofunits")),
    yearBuilt: toNullableNumber(get("year_built")),
    yearBuiltSource: toNullableString(get("year_built_source")),
    constructionEra: toNullableString(get("construction_era")),
    numberOfStories: toNullableNumber(get("number_stories")),
    totalLivableArea: toNullableNumber(get("total_livable_area")),
    marketValue: toNullableNumber(get("market_value")),
    ownerBusinessName: toNullableString(get("owner_business_name")),
    parcelNumber: toNullableString(get("parcel_number")),
    source: toNullableString(get("source")),
    activeListingsCount: toNullableNumber(get("active_listings_count")) ?? 0,
    unitMix: {
      studio: toNullableNumber(get("studio_count")),
      br1: toNullableNumber(get("br1_count")),
      br2: toNullableNumber(get("br2_count")),
      br3plus: toNullableNumber(get("br3plus_count")),
    },
    rent: {
      min: toNullableNumber(get("rent_min")),
      max: toNullableNumber(get("rent_max")),
    },
    ...(lon !== null && lat !== null
      ? { location: { type: "Point" as const, coordinates: [lon, lat] as [number, number] } }
      : {}),
  };
}

async function main(): Promise<void> {
  const csvText = readFileSync(CSV_PATH, "utf8");
  const rows = parseCSV(csvText).filter((r) => r.some((f) => f !== ""));
  const [header, ...dataRows] = rows;

  const records = dataRows
    .map((row) => rowToRecord(header, row))
    .filter((r): r is BuildingRecord => r !== null);

  console.log(`Parsed ${records.length} building records from ${CSV_PATH}`);

  await mongoose.connect(MONGO_URI);
  console.log(`Connected to ${MONGO_URI}`);

  const { BuildingModel } = await import("../src/models/Building");
  await BuildingModel.init(); // ensure indexes exist before we insert and disconnect

  const existing = await BuildingModel.countDocuments();
  if (existing > 0) {
    console.log(`Clearing ${existing} existing building document(s) before reseeding...`);
    await BuildingModel.deleteMany({});
  }

  const result = await BuildingModel.insertMany(records, { ordered: false });
  console.log(`Inserted ${result.length} buildings.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
