import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

export function isR2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET &&
      env.R2_PUBLIC_URL,
  );
}

let client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      // Explicit credentials, rather than the SDK's default provider chain,
      // which otherwise probes EC2 IMDS/shared config files — pointless
      // latency (and can hang) outside of AWS.
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
      // R2 doesn't support the flexible-checksum features newer SDK
      // versions enable by default; left on, PUTs — including presigned
      // ones, since checksum headers become part of the signature — fail.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}
