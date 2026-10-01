// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordDiagnostic, resetDiagnosticsForTests } from "./diagnostics";
import { MatchEscapeMenu } from "./MatchEscapeMenu";

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

const setClipboard = (clipboard: { writeText: (text: string) => Promise<void> } | undefined) => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
};

const openReport = () => {
  fireEvent.click(screen.getByRole("button", { name: /open match menu/i }));
  fireEvent.click(screen.getByRole("button", { name: /report bug/i }));
};

beforeEach(() => {
  resetDiagnosticsForTests();
  setClipboard(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalClipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});

describe("MatchEscapeMenu", () => {
  it("renders one accessible top-right match trigger", () => {
    const { container } = render(<MatchEscapeMenu />);
    const trigger = screen.getByRole("button", { name: /open match menu/i });

    expect(container.querySelectorAll(".escape-menu-trigger")).toHaveLength(1);
    expect(trigger.getAttribute("data-placement")).toBe("top-right");
  });

  it("runs opt-in additional actions after closing the menu", async () => {
    const onRestart = vi.fn();
    render(
      <MatchEscapeMenu
        additionalActions={[{
          label: "Restart",
          onSelect: onRestart,
        }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open match menu/i }));
    fireEvent.click(screen.getByRole("button", { name: /^restart$/i }));

    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: /open match menu/i }),
      )
    );
  });

  it("opens with Escape, traps/restores focus, and never invokes gameplay controls", async () => {
    const onLeave = vi.fn();
    render(<MatchEscapeMenu onLeave={onLeave} />);
    const trigger = screen.getByRole("button", { name: /open match menu/i });
    trigger.focus();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: /game paused locally/i })).toBeTruthy();
    const closeButton = screen.getByRole("button", { name: /close match menu/i });
    const leaveButton = screen.getByRole("button", { name: /leave match/i });
    expect(document.activeElement).toBe(closeButton);
    leaveButton.focus();
    fireEvent.keyDown(leaveButton, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("copies the sanitized preview and announces success after the promise settles", async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    setClipboard({ writeText });
    recordDiagnostic({
      category: "online",
      event: "connected",
      data: { reconnectToken: "do-not-copy-this-secret" },
    });
    render(<MatchEscapeMenu />);
    openReport();
    fireEvent.change(screen.getByPlaceholderText(/describe what you clicked/i), {
      target: { value: "Hex froze after choosing b11." },
    });
    const preview = screen.getByLabelText(/sanitized debug report preview/i).textContent;

    fireEvent.click(screen.getByRole("button", { name: /copy debug report/i }));
    expect(await screen.findByText("Debug report copied.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/copied/i);
    expect(writeText).toHaveBeenCalledWith(preview);
    expect(writeText.mock.calls[0][0]).toContain("Hex froze after choosing b11.");
    expect(writeText.mock.calls[0][0]).not.toContain("do-not-copy-this-secret");
  });

  it("announces unavailable clipboard access and focuses a selectable fallback", async () => {
    render(<MatchEscapeMenu />);
    openReport();

    fireEvent.click(screen.getByRole("button", { name: /copy debug report/i }));
    expect(await screen.findByText(/clipboard access is unavailable/i)).toBeTruthy();
    const fallback = screen.getByRole("textbox", { name: /selectable debug report/i });
    await waitFor(() => expect(document.activeElement).toBe(fallback));
    expect((fallback as HTMLTextAreaElement).selectionStart).toBe(0);
    expect((fallback as HTMLTextAreaElement).selectionEnd).toBe(
      (fallback as HTMLTextAreaElement).value.length,
    );
  });

  it("announces clipboard rejection and preserves the selectable fallback", async () => {
    const writeText = vi.fn((_text: string) => Promise.reject(new Error("Permission denied")));
    setClipboard({ writeText });
    render(<MatchEscapeMenu />);
    openReport();

    fireEvent.click(screen.getByRole("button", { name: /copy debug report/i }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Clipboard access failed. Select and copy the report below.",
    );
    const fallback = screen.getByRole("textbox", { name: /selectable debug report/i });
    await waitFor(() => expect(document.activeElement).toBe(fallback));
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("does not let an older clipboard promise replace newer fallback feedback", async () => {
    let resolveWrite: (() => void) | undefined;
    const writeText = vi.fn((_text: string) => new Promise<void>((resolve) => {
      resolveWrite = resolve;
    }));
    setClipboard({ writeText });
    render(<MatchEscapeMenu />);
    openReport();

    fireEvent.click(screen.getByRole("button", { name: /copy debug report/i }));
    expect(screen.getByRole("status").textContent).toMatch(/copying/i);
    setClipboard(undefined);
    fireEvent.click(screen.getByRole("button", { name: /copy debug report/i }));
    expect(await screen.findByText(/clipboard access is unavailable/i)).toBeTruthy();

    await act(async () => {
      resolveWrite?.();
    });
    expect(screen.getByRole("status").textContent).toMatch(/unavailable/i);
    expect(screen.getByRole("textbox", { name: /selectable debug report/i })).toBeTruthy();
  });
});
