// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountModal } from "./AccountModal";

const baseProps = {
  configured: true,
  loading: false,
  working: false,
  onClose: vi.fn(),
  onSignIn: vi.fn(async () => "Signed in."),
  onSignUp: vi.fn(async () => "Account created."),
  onSignOut: vi.fn(async () => undefined),
  onUpdateDisplayName: vi.fn(async () => "Display name updated."),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("account modal", () => {
  it("submits email, password, and display name when creating an account", async () => {
    render(<AccountModal {...baseProps} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^create account$/i })[0]);
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Athena" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "athena@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "divine-pass" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^create account$/i }).at(-1)!);

    await waitFor(() => expect(baseProps.onSignUp).toHaveBeenCalledWith(
      "athena@example.com",
      "divine-pass",
      "Athena",
    ));
  });

  it("updates the saved display name for a signed-in account", async () => {
    render(
      <AccountModal
        {...baseProps}
        account={{ userId: "user-1", email: "athena@example.com", displayName: "Athena" }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/saved display name/i), { target: { value: "Pallas" } });
    fireEvent.click(screen.getByRole("button", { name: /save name/i }));

    await waitFor(() => expect(baseProps.onUpdateDisplayName).toHaveBeenCalledWith("Pallas"));
  });
});
