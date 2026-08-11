import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    PORT: z.coerce.number().default(4000),
    CLIENT_URL: z.string().url().default("http://localhost:5173"),
    MONGO_URI: z.string().min(1, "MONGO_URI is required"),
    JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
    JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
    // z.coerce.boolean() would coerce the string "false" to `true` (any
    // non-empty string is truthy), silently breaking an explicit
    // MAILER_DISABLED=false in .env — parse the literal strings instead.
    MAILER_DISABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    // Photo storage (Cloudflare R2). Left optional rather than required —
    // unlike SMTP, there's no "disabled" toggle, since not having a bucket
    // configured yet is just a bootstrapping state, not a deliberate choice;
    // isR2Configured() (server/src/config/r2.ts) checks these at the point
    // photo endpoints are actually used, so a missing value 503s just that
    // feature instead of blocking the whole server from starting.
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    R2_PUBLIC_URL: z.string().optional(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  })
  .superRefine((data, ctx) => {
    if (data.MAILER_DISABLED || data.NODE_ENV === "test") return;

    for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] as const) {
      if (!data[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required unless MAILER_DISABLED=true`,
        });
      }
    }
  });

export const env = envSchema.parse(process.env);
