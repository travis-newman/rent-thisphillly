import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../../lib/auth-context";
import { Login } from "../Login";

jest.mock("../../lib/api", () => ({
  api: {
    me: jest.fn().mockRejectedValue(new Error("not authenticated")),
    login: jest.fn(),
  },
}));

import { api } from "../../lib/api";

function renderLogin() {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<p>Dashboard page</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("Login", () => {
  it("renders the login form", async () => {
    renderLogin();
    expect(await screen.findByRole("heading", { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
  });

  it("logs in and navigates to the dashboard on success", async () => {
    (api.login as jest.Mock).mockResolvedValue({ user: { id: "1", email: "user@example.com" } });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/^password/i), "password123");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
    expect(api.login).toHaveBeenCalledWith("user@example.com", "password123");
  });

  it("shows an error message when login fails", async () => {
    (api.login as jest.Mock).mockRejectedValue(new Error("Invalid email or password"));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/^password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password");
    });
  });
});
