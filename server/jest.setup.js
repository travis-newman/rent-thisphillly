process.env.MONGO_URI ||= "mongodb://localhost:27017/base-app-test";
// Force rather than ||= : a local .env with MAILER_DISABLED=true (used to skip
// email verification in dev) must not change whether verification is required
// in tests, which rely on it being off (see "rejects login before the email
// is verified").
process.env.MAILER_DISABLED = "false";
process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
process.env.SMTP_HOST ||= "smtp.test.local";
process.env.SMTP_PORT ||= "587";
process.env.SMTP_USER ||= "test-user";
process.env.SMTP_PASS ||= "test-pass";
process.env.SMTP_FROM ||= "Base App <no-reply@example.com>";
process.env.NODE_ENV = "test";
