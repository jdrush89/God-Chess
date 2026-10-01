// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFourPlayerOnlineConfig } from "../multiplayer/fourPlayerRoom";
import type { FourPlayerOnlineState } from "../multiplayer/useFourPlayerOnlineGame";
import { FourPlayerOnlineLobby } from "./FourPlayerOnlineLobby";

afterEach(cleanup);

const onlineState = (role: "host" | "peer"): FourPlayerOnlineState => {
  const config = createFourPlayerOnlineConfig();
  config.seats.north.name = "Alex";
  config.seats.north.control = {
    kind: "online",
    participantId: "host",
    local: true,
  };
  config.seats.east.name = "Alex";
  config.seats.east.control = {
    kind: "online",
    participantId: "guest",
  };
  return {
    role,
    connecting: false,
    roomCode: "ABCDE",
    participantId: role === "host" ? "host" : "guest",
    snapshot: {
      roomCode: "ABCDE",
      status: "lobby",
      participants: [
        {
          ...(role === "host" ? { participantId: "host" } : {}),
          name: "Alex",
          host: true,
          connected: true,
          ready: false,
          local: role === "host",
          seat: "north",
        },
        {
          ...(role === "host" ? { participantId: "guest" } : {}),
          name: "Alex",
          host: false,
          connected: true,
          ready: false,
          local: role === "peer",
          seat: "east",
        },
      ],
      config,
      localUndoConsent: false,
      undoAvailable: false,
    },
  };
};

describe("four-player online lobby", () => {
  it("lets the host configure seats and blocks start until everyone is ready", () => {
    const assign = vi.fn();
    const updateConfig = vi.fn();
    render(
      <FourPlayerOnlineLobby
        online={onlineState("host")}
        onReady={vi.fn()}
        onAssignSeat={assign}
        onUpdateConfig={updateConfig}
        onStart={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Alex").length).toBeGreaterThanOrEqual(2);
    expect(
      (screen.getByRole("button", { name: /begin four-player draft/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    const south = document.querySelector(".four-online-seat.seat-south") as HTMLElement;
    fireEvent.change(within(south).getByLabelText(/controller/i), {
      target: { value: "guest" },
    });
    expect(assign).toHaveBeenCalledWith("guest", "south");

    fireEvent.click(screen.getByRole("button", { name: /2v2 teams/i }));
    expect(updateConfig).toHaveBeenCalled();
  });

  it("keeps host-only controls hidden from guests while showing their assigned seat", () => {
    const ready = vi.fn();
    render(
      <FourPlayerOnlineLobby
        online={onlineState("peer")}
        onReady={ready}
        onAssignSeat={vi.fn()}
        onUpdateConfig={vi.fn()}
        onStart={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /begin four-player draft/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /2v2 teams/i })).toBeNull();
    expect(screen.getAllByText(/east/i).length).toBeGreaterThan(0);
    const readyButton = screen.getByRole("button", { name: /^ready$/i });
    expect((readyButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(readyButton);
    expect(ready).toHaveBeenCalledWith(true);
  });

  it("keeps an unassigned guest from readying", () => {
    const online = onlineState("peer");
    delete online.snapshot!.participants[1].seat;
    online.snapshot!.config.seats.east.control = { kind: "ai", difficulty: 5 };
    render(
      <FourPlayerOnlineLobby
        online={online}
        onReady={vi.fn()}
        onAssignSeat={vi.fn()}
        onUpdateConfig={vi.fn()}
        onStart={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    expect(
      (screen.getByRole("button", { name: /^ready$/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
