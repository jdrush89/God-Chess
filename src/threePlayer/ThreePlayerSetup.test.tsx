// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreePlayerSetup } from "./ThreePlayerSetup";

afterEach(cleanup);

describe("ThreePlayerSetup", () => {
  it("shows five visual variants and configures local seats", () => {
    const { container } = render(
      <ThreePlayerSetup onStart={() => undefined} onBack={() => undefined} />,
    );

    expect(container.querySelectorAll(".three-variant-card")).toHaveLength(5);
    expect(container.querySelectorAll(".three-variant-preview svg")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: /Circular.*Four rings/i }));
    expect(screen.getByRole("button", { name: /Circular.*Four rings/i }).getAttribute("aria-pressed")).toBe("true");

    const aiButtons = screen.getAllByRole("button", { name: /^AI$/i });
    aiButtons.forEach((button) => fireEvent.click(button));
    expect(screen.getByText(/At least one seat must be Human/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Begin three-player draft/i }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getAllByRole("button", { name: /^Human$/i })[0]);
    expect(screen.getByText(/Setup ready/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Begin three-player draft/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers per-AI difficulty and match rules", () => {
    const onStart = vi.fn();
    const { container } = render(
      <ThreePlayerSetup onStart={onStart} onBack={() => undefined} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /^AI$/i })[1]);
    const difficulty = screen.getByRole("slider", { name: /Red AI difficulty/i });
    fireEvent.change(difficulty, { target: { value: "9" } });
    expect((difficulty as HTMLInputElement).value).toBe("9");

    const victoryButtons = Array.from(
      container.querySelectorAll(".three-setup-option .segmented-control button"),
    );
    expect(victoryButtons.map((button) => button.textContent?.trim())).toEqual([
      "Last surviving",
      "First King captured",
    ]);
    expect(screen.getByRole("button", { name: /Last surviving/i }).className).toContain("active");
    fireEvent.click(screen.getByRole("button", { name: /First King captured/i }));
    fireEvent.click(screen.getByRole("button", { name: /Begin three-player draft/i }));
    expect(onStart.mock.calls[0][0].victoryMode).toBe("first-checkmate");
    fireEvent.click(screen.getByRole("checkbox", { name: /Piece takeover/i }));
    expect((screen.getByRole("checkbox", { name: /Piece takeover/i }) as HTMLInputElement).checked).toBe(true);
  });
});
