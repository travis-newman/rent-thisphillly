import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "../auth-context";

jest.mock("../api", () => ({
  api: {
    me: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
  },
}));

import { api } from "../api";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe("AuthProvider / useAuth", () => {
  it("starts loading, then has no user when /me fails", async () => {
    (api.me as jest.Mock).mockRejectedValue(new Error("not authenticated"));
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("restores the session from /me on mount", async () => {
    (api.me as jest.Mock).mockResolvedValue({ user: { id: "1", email: "user@example.com" } });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual({ id: "1", email: "user@example.com" });
  });

  it("sets the user after a successful login", async () => {
    (api.me as jest.Mock).mockRejectedValue(new Error("not authenticated"));
    (api.login as jest.Mock).mockResolvedValue({ user: { id: "2", email: "second@example.com" } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login("second@example.com", "password123");
    });

    expect(result.current.user).toEqual({ id: "2", email: "second@example.com" });
  });

  it("clears the user on logout", async () => {
    (api.me as jest.Mock).mockResolvedValue({ user: { id: "1", email: "user@example.com" } });
    (api.logout as jest.Mock).mockResolvedValue(undefined);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
  });

  it("throws when used outside of an AuthProvider", () => {
    const originalError = console.error;
    console.error = jest.fn();
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
    console.error = originalError;
  });
});
