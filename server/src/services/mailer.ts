import nodemailer from "nodemailer";
import { env } from "../config/env";

// In the test environment (unit tests mock this module entirely, but the
// e2e server process runs it for real) use nodemailer's built-in JSON
// transport so no network call is made and no real SMTP account is needed.
const transporter =
  env.NODE_ENV === "test"
    ? nodemailer.createTransport({ jsonTransport: true })
    : env.MAILER_DISABLED
      ? null
      : nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_PORT === 465,
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
        });

async function send(to: string, subject: string, html: string, link: string): Promise<void> {
  if (transporter === null) {
    console.log(`[mailer disabled] "${subject}" for ${to}: ${link}`);
    return;
  }

  await transporter.sendMail({ from: env.SMTP_FROM, to, subject, html });
}

export async function sendVerificationEmail(to: string, link: string): Promise<void> {
  await send(
    to,
    "Verify your email",
    `<p>Welcome! Please verify your email by clicking the link below.</p><p><a href="${link}">${link}</a></p>`,
    link,
  );
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
  await send(
    to,
    "Reset your password",
    `<p>You requested a password reset. Click the link below to choose a new password.</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    link,
  );
}
