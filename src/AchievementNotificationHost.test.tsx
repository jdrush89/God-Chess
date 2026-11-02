// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AchievementNotificationHost,
  announceAchievementUnlocks,
  createAchievementUnlockNotices,
} from "./AchievementNotificationHost";
import { createAchievementProgress } from "./achievements";

afterEach(() => {
  vi.useRealTimers();
});

describe("achievement unlock notifications", () => {
  it("includes rewards unlocked by the completed achievement", () => {
    const before = createAchievementProgress();
    const after = createAchievementProgress();
    after.completed.consistency = "2026-11-02T00:00:00.000Z";

    expect(createAchievementUnlockNotices(before, after)).toEqual([
      expect.objectContaining({
        id: "consistency",
        title: "Consistency",
        rewards: ["Gargoyle piece theme"],
      }),
    ]);
  });

  it("reports God skins unlocked by ability achievements", () => {
    const before = createAchievementProgress();
    const after = createAchievementProgress();
    after.completed.anoobus = "2026-11-02T00:00:00.000Z";

    expect(createAchievementUnlockNotices(before, after)[0].rewards).toEqual([
      "Anubis: Tightrope skin",
    ]);
  });

  it("slides away after five seconds and shows queued unlocks in order", () => {
    vi.useFakeTimers();
    render(<AchievementNotificationHost />);
    const before = createAchievementProgress();
    const first = createAchievementProgress();
    first.completed["it-begins"] = "2026-11-02T00:00:00.000Z";
    const second = {
      ...first,
      completed: {
        ...first.completed,
        consistency: "2026-11-02T00:00:01.000Z",
      },
    };

    act(() => {
      announceAchievementUnlocks(before, first);
      announceAchievementUnlocks(first, second);
    });
    expect(screen.getByText("It Begins")).toBeTruthy();

    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByRole("status").className).toContain("leaving");

    act(() => vi.advanceTimersByTime(350));
    expect(screen.getByText("Consistency")).toBeTruthy();
    expect(screen.getByText(/Gargoyle piece theme/)).toBeTruthy();
  });
});
