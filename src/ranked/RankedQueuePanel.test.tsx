// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RankedQueuePanel } from "./RankedQueuePanel";
import { DEFAULT_RANKED_RATING, type RankedQueueState } from "./types";

const callbacks = () => ({
  onJoin: vi.fn(),
  onLeave: vi.fn(),
  onReset: vi.fn(),
});

afterEach(cleanup);

describe("RankedQueuePanel", () => {
  it("requires an account and does not expose room-code controls", () => {
    const actions = callbacks();
    render(
      <RankedQueuePanel
        state={{ phase: "idle", loading: false }}
        signedIn={false}
        {...actions}
      />,
    );

    expect(
      (screen.getByRole("button", {
        name: /start ranked game/i,
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/sign in with a player account/i)).toBeTruthy();
    expect(screen.queryByLabelText(/room code/i)).toBeNull();
  });

  it("shows the requested waiting state and leaves the queue", () => {
    const actions = callbacks();
    render(
      <RankedQueuePanel
        state={{
          phase: "queued",
          loading: false,
          rating: DEFAULT_RANKED_RATING,
        }}
        signedIn
        {...actions}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Waiting for other players.",
    );
    fireEvent.click(screen.getByRole("button", { name: /leave queue/i }));
    expect(actions.onLeave).toHaveBeenCalledOnce();
  });

  it("shows player ratings, colors, and the reconnect window", () => {
    const state: RankedQueueState = {
      phase: "playing",
      loading: false,
      rating: { ...DEFAULT_RANKED_RATING, rating: 1600 },
      match: {
        id: "match-1",
        phase: "playing",
        roomCode: "ABCDE",
        joinToken: "white-token",
        color: "white",
        host: true,
        participants: [
          {
            publicId: "gc-athena",
            displayName: "Athena",
            portraitId: "artemis",
            color: "white",
            host: true,
            connected: true,
            rating: 1600,
          },
          {
            publicId: "gc-ares",
            displayName: "Ares",
            portraitId: "ares",
            color: "black",
            host: false,
            connected: false,
            rating: 1575,
          },
        ],
      },
    };
    render(<RankedQueuePanel state={state} signedIn {...callbacks()} />);

    expect(screen.getByText("Athena").parentElement?.textContent).toContain(
      "White · Rating 1600",
    );
    expect(screen.getByText("Ares").parentElement?.textContent).toContain(
      "Black · Rating 1575",
    );
    expect(screen.getByText(/2 minutes to return/i)).toBeTruthy();
  });

  it("shows the completed rating change", () => {
    const actions = callbacks();
    render(
      <RankedQueuePanel
        state={{
          phase: "completed",
          loading: false,
          rating: { ...DEFAULT_RANKED_RATING, rating: 1538 },
          match: {
            id: "match-2",
            phase: "completed",
            joinToken: "black-token",
            color: "black",
            host: false,
            participants: [],
            winnerColor: "black",
            resultReason: "forfeit",
            rating: { ...DEFAULT_RANKED_RATING, rating: 1538 },
            ratingChange: 38,
          },
        }}
        signedIn
        {...actions}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("Ranked victory");
    expect(screen.getByText("+38 rating")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /return to online/i }));
    expect(actions.onReset).toHaveBeenCalledOnce();
  });
});
