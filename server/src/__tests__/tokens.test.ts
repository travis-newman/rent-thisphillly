import {
  generateRandomToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../services/tokens";

describe("tokens", () => {
  const payload = { sub: "user-1", email: "user@example.com" };

  it("signs and verifies an access token round-trip", () => {
    const token = signAccessToken(payload);
    expect(verifyAccessToken(token)).toMatchObject(payload);
  });

  it("signs and verifies a refresh token round-trip", () => {
    const token = signRefreshToken(payload);
    expect(verifyRefreshToken(token)).toMatchObject(payload);
  });

  it("rejects an access token verified as a refresh token", () => {
    const token = signAccessToken(payload);
    expect(() => verifyRefreshToken(token)).toThrow();
  });

  it("generates unique random tokens", () => {
    const a = generateRandomToken();
    const b = generateRandomToken();
    expect(a).not.toEqual(b);
    expect(a).toHaveLength(64);
  });
});
