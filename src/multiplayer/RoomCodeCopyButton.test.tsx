// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomCodeCopyButton } from "./RoomCodeCopyButton";

const originalClipboardDescriptor =
  Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  cleanup();
  if (originalClipboardDescriptor) {
    Object.defineProperty(
      navigator,
      "clipboard",
      originalClipboardDescriptor,
    );
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const setClipboard = (
  clipboard: { writeText: (text: string) => Promise<void> } | undefined,
) => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
};

describe("RoomCodeCopyButton", () => {
  it("shows a checkmark state after copying the room code", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const { container } = render(<RoomCodeCopyButton roomCode="ABCDE" />);

    fireEvent.click(screen.getByRole("button", { name: /copy room code abcde/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("ABCDE");
      expect(screen.getByRole("button", { name: /room code abcde copied/i })).toBeTruthy();
    });
    expect(container.querySelector(".room-code.copied svg")).toBeTruthy();
  });

  it("shows a failure state when clipboard access is unavailable", async () => {
    setClipboard(undefined);
    render(<RoomCodeCopyButton roomCode="ABCDE" />);

    fireEvent.click(screen.getByRole("button", { name: /copy room code abcde/i }));

    expect(
      await screen.findByRole("button", { name: /unable to copy room code abcde/i }),
    ).toBeTruthy();
  });
});
