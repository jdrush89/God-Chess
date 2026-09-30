// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createThreePlayerOnlineConfig } from "../multiplayer/threePlayerRoom";
import type { ThreePlayerOnlineState } from "../multiplayer/useThreePlayerOnlineGame";
import { ThreePlayerOnlineLobby } from "./ThreePlayerOnlineLobby";

afterEach(cleanup);

const onlineState = (role: "host" | "peer"): ThreePlayerOnlineState => {
  const config = createThreePlayerOnlineConfig();
  config.seats.white.name = "Alex";
  config.seats.white.control = {
    kind: "online",
    ...(role === "host" ? { participantId: "host" } : {}),
    local: role === "host",
  };
  config.seats.red.name = "Blair";
  config.seats.red.control = {
    kind: "online",
    ...(role === "host" ? { participantId: "guest" } : {}),
    local: role === "peer",
  };
  const base = {
    role,
    connecting: false,
    roomCode: "ABCDE",
    participantId: role === "host" ? "host" : "guest",
  } satisfies Partial<ThreePlayerOnlineState>;
  if (role === "host") {
    return {
      ...base,
      role,
      snapshot: {
        roomCode: "ABCDE",
        status: "lobby",
        participants: [
          {
            participantId: "host",
            name: "Alex",
            host: true,
            connected: true,
            ready: false,
            local: true,
            seat: "white",
          },
          {
            participantId: "guest",
            name: "Blair",
            host: false,
            connected: true,
            ready: false,
            local: false,
            seat: "red",
          },
        ],
        config,
        undoAvailable: false,
      },
    };
  }
  return {
    ...base,
    role,
    snapshot: {
      roomCode: "ABCDE",
      status: "lobby",
      participants: [
        {
          name: "Alex",
          host: true,
          connected: true,
          ready: false,
          local: false,
          seat: "white",
        },
        {
          name: "Blair",
          host: false,
          connected: true,
          ready: false,
          local: true,
          seat: "red",
        },
      ],
      config,
      undoAvailable: false,
    },
  };
};

describe("three-player online lobby", () => {
  it("lets the host configure variants, seats, AI, and start gating", () => {
    const assign = vi.fn();
    const updateConfig = vi.fn();
    render(
      <ThreePlayerOnlineLobby
        online={onlineState("host")}
        onReady={vi.fn()}
        onAssignSeat={assign}
        onUpdateConfig={updateConfig}
        onStart={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    expect(
      (screen.getByRole("button", {
        name: /begin three-player draft/i,
      }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /^Circular$/i }));
    expect(updateConfig).toHaveBeenCalled();

    const black = document.querySelector(
      ".three-online-seat.seat-black",
    ) as HTMLElement;
    fireEvent.change(within(black).getByLabelText(/controller/i), {
      target: { value: "guest" },
    });
    expect(assign).toHaveBeenCalledWith("guest", "black");

    fireEvent.change(screen.getByLabelText(/black ai difficulty/i), {
      target: { value: "8" },
    });
    expect(updateConfig).toHaveBeenCalledTimes(2);
  });

  it("keeps host-only controls read-only for guests and exposes readiness", () => {
    const ready = vi.fn();
    render(
      <ThreePlayerOnlineLobby
        online={onlineState("peer")}
        onReady={ready}
        onAssignSeat={vi.fn()}
        onUpdateConfig={vi.fn()}
        onStart={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", {
      name: /begin three-player draft/i,
    })).toBeNull();
    expect(screen.queryAllByLabelText(/controller/i)).toHaveLength(0);
    expect((screen.getByRole("button", {
      name: /^Circular$/i,
    }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Ready$/i }));
    expect(ready).toHaveBeenCalledWith(true);
  });
});
