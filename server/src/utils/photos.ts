import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";
import { getR2Client } from "../config/r2";

// Shared R2 helpers used by the buildings/regions/neighborhoods photo
// endpoints (mirrors how utils/boundaries.ts holds cross-entity geo logic —
// this stays Mongoose-free; each controller does its own $push/$pull).
export const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export const MAX_PHOTOS_PER_ENTITY = 20;
// Hard server-side backstop; the client also checks this before ever
// requesting a presigned URL, but that check is easily bypassed.
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export type EntityType = "buildings" | "regions" | "neighborhoods";

// Note: a presigned URL that's requested but never confirmed (abandoned
// upload, closed tab, failed PUT) leaves an orphaned object in R2 with no
// app-side cleanup. Acceptable for low-volume admin-only usage — mitigate
// via an R2 lifecycle rule expiring unconfirmed-looking objects after a day
// or so, rather than building orphan-tracking here.

export interface Photo {
  key: string;
  url: string;
  uploadedAt: Date;
}

export function isAllowedContentType(contentType: string): contentType is AllowedContentType {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType);
}

const EXTENSION_BY_CONTENT_TYPE: Record<AllowedContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function buildObjectKey(
  entityType: EntityType,
  entityId: string,
  contentType: AllowedContentType,
): string {
  return `${entityType}/${entityId}/${randomUUID()}.${EXTENSION_BY_CONTENT_TYPE[contentType]}`;
}

export function buildPublicUrl(key: string): string {
  return `${env.R2_PUBLIC_URL}/${key}`;
}

// Binds ContentType into the signed command, which is what makes the
// allowed-content-type check enforceable — without it, the signature
// wouldn't constrain what Content-Type header the client's PUT can send.
export async function createPresignedUploadUrl(
  key: string,
  contentType: AllowedContentType,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getR2Client(), command, { expiresIn: 300 });
}

export class PhotoNotFoundError extends Error {
  constructor(key: string) {
    super(`No object found in storage for key "${key}"`);
  }
}

// Confirms the object actually landed in R2 (a client could call the
// confirm endpoint after an abandoned/failed PUT) and returns its size for
// the MAX_UPLOAD_BYTES backstop check.
export async function verifyUploadedObject(key: string): Promise<{ contentLength: number }> {
  try {
    const result = await getR2Client().send(
      new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
    );
    return { contentLength: result.ContentLength ?? 0 };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "NotFound" || name === "NoSuchKey") {
      throw new PhotoNotFoundError(key);
    }
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await getR2Client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}
