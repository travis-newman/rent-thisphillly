const sendMail = jest.fn().mockResolvedValue({ messageId: "test-message-id" });

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({ sendMail })),
}));

import { sendPasswordResetEmail, sendVerificationEmail } from "../services/mailer";

describe("mailer", () => {
  it("sends a verification email with the link included", async () => {
    await sendVerificationEmail("user@example.com", "https://app.example.com/verify-email/abc123");

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        subject: expect.stringMatching(/verify/i),
        html: expect.stringContaining("https://app.example.com/verify-email/abc123"),
      }),
    );
  });

  it("sends a password reset email with the link included", async () => {
    await sendPasswordResetEmail("user@example.com", "https://app.example.com/reset-password/xyz789");

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        subject: expect.stringMatching(/reset/i),
        html: expect.stringContaining("https://app.example.com/reset-password/xyz789"),
      }),
    );
  });
});
