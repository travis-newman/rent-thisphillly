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
