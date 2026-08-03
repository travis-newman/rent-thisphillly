import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../lib/auth-context";
import { Register } from "../Register";

jest.mock("../../lib/api", () => ({
  api: {
    me: jest.fn().mockRejectedValue(new Error("not authenticated")),
    register: jest.fn(),
  },
}));

import { api } from "../../lib/api";

function renderRegister() {
  render(
    <MemoryRouter>
      <AuthProvider>
        <Register />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Register", () => {
  it("renders the registration form", async () => {
    renderRegister();
    expect(await screen.findByRole("heading", { name: /create an account/i })).toBeInTheDocument();
  });

  it("submits email and password and shows the confirmation message", async () => {
    (api.register as jest.Mock).mockResolvedValue({
      message: "Registration successful. Check your email to verify your account.",
    });
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText(/email/i), "new-user@example.com");
    await user.type(screen.getByLabelText(/password/i), "a-strong-password");
    await user.click(screen.getByRole("button", { name: /register/i }));

    expect(api.register).toHaveBeenCalledWith("new-user@example.com", "a-strong-password");
    expect(await screen.findByText(/check your email to verify/i)).toBeInTheDocument();
  });

  it("shows an error message when registration fails", async () => {
    (api.register as jest.Mock).mockRejectedValue(
      new Error("An account with that email already exists"),
    );
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText(/email/i), "existing@example.com");
    await user.type(screen.getByLabelText(/password/i), "a-strong-password");
    await user.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/already exists/i);
    });
  });
});
