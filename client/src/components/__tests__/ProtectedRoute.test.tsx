import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../../lib/auth-context";
import { ProtectedRoute } from "../ProtectedRoute";

jest.mock("../../lib/api", () => ({
  api: {
    me: jest.fn(),
  },
}));

import { api } from "../../lib/api";

function renderProtected() {
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>Login page</p>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<p>Dashboard page</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("redirects to /login when there is no authenticated user", async () => {
    (api.me as jest.Mock).mockRejectedValue(new Error("not authenticated"));
    renderProtected();
    expect(await screen.findByText("Login page")).toBeInTheDocument();
  });

  it("renders the protected content when a user is authenticated", async () => {
    (api.me as jest.Mock).mockResolvedValue({ user: { id: "1", email: "user@example.com" } });
    renderProtected();
    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  });
});
