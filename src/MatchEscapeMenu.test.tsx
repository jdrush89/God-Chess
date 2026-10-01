// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDiagnosticsForTests } from "./diagnostics";
import { MatchEscapeMenu } from "./MatchEscapeMenu";

beforeEach(() => {
  resetDiagnosticsForTests();
});

afterEach(cleanup);

describe("MatchEscapeMenu", () => {
  it("opens with Escape, traps/restores focus, and never invokes gameplay controls", async () => {
    const onLeave = vi.fn();
    render(<MatchEscapeMenu onLeave={onLeave} />);
    const trigger = screen.getByRole("button", { name: /open match menu/i });
    trigger.focus();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: /game paused locally/i })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /close match menu/i }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("copies a sanitized report and provides a selectable fallback", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<MatchEscapeMenu />);
    fireEvent.click(screen.getByRole("button", { name: /open match menu/i }));
    fireEvent.click(screen.getByRole("button", { name: /report bug/i }));
    fireEvent.change(screen.getByPlaceholderText(/describe what you clicked/i), {
      target: { value: "Hex froze after choosing b11." },
    });
    fireEvent.click(screen.getByRole("button", { name: /copy debug report/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status").textContent).toMatch(/copied/i);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    fireEvent.click(screen.getByRole("button", { name: /copy debug report/i }));
    expect(screen.getByRole("textbox", { name: /selectable debug report/i })).toBeTruthy();
  });
});
