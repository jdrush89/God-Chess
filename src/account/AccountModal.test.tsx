// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPlayerStatisticsProgress,
  createPlayerStatisticsSnapshot,
} from "../playerStatistics";
import { AccountModal } from "./AccountModal";
import type { SocialContract } from "./social";

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

const social = (overrides: Partial<SocialContract> = {}): SocialContract => ({
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  invites: [],
  sentInvites: [],
  unreadCount: 0,
  loading: false,
  refresh: vi.fn(async () => undefined),
  search: vi.fn(async () => []),
  sendFriendRequest: vi.fn(async () => undefined),
  acceptFriendRequest: vi.fn(async () => undefined),
  declineFriendRequest: vi.fn(async () => undefined),
  removeFriend: vi.fn(async () => undefined),
  sendInvite: vi.fn(async () => undefined),
  prepareInvite: vi.fn(),
  respondInvite: vi.fn(async () => undefined),
  ...overrides,
});

const account = {
  userId: "user-1",
  email: "athena@example.com",
  displayName: "Athena",
  publicId: "gc-athena22",
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
        account={account}
      />,
    );
    fireEvent.change(screen.getByLabelText(/saved display name/i), { target: { value: "Pallas" } });
    fireEvent.click(screen.getByRole("button", { name: /save name/i }));

    await waitFor(() => expect(baseProps.onUpdateDisplayName).toHaveBeenCalledWith("Pallas"));
  });

  it("searches players by name and sends a friend request using the public ID", async () => {
    const contract = social({
      search: vi.fn(async () => [
        { publicId: "gc-ares3344", displayName: "Ares" },
      ]),
    });
    render(
      <AccountModal
        {...baseProps}
        account={account}
        social={contract}
        initialSection="friends"
      />,
    );
    fireEvent.change(screen.getByLabelText(/find by display name/i), {
      target: { value: "Ares" },
    });
    const searchButton = screen.getByRole("button", { name: /^search$/i });
    expect(searchButton.classList.contains("friend-search-button")).toBe(true);
    fireEvent.click(searchButton);
    expect(await screen.findByText("gc-ares3344")).toBeTruthy();
    const addButton = screen.getByRole("button", { name: /^add$/i });
    expect(addButton.classList.contains("friend-add-button")).toBe(true);
    fireEvent.click(addButton);
    await waitFor(() =>
      expect(contract.sendFriendRequest).toHaveBeenCalledWith("gc-ares3344")
    );
  });

  it("accepts incoming requests and shows sanitized friend stats and achievements", async () => {
    const contract = social({
      incomingRequests: [{
        publicId: "gc-ares3344",
        displayName: "Ares",
        status: "pending",
        incoming: true,
      }],
      friends: [{
        publicId: "gc-zeus5566",
        displayName: "Zeus",
        completedAchievementIds: ["it-begins"],
        stats: {
          ...createPlayerStatisticsSnapshot(
            createPlayerStatisticsProgress(),
            [],
          ),
          gamesPlayed: 12,
          gamesWon: 7,
          piecesCaptured: 44,
          totalPuzzlesCompleted: 5,
        },
      }],
      unreadCount: 1,
    });
    render(
      <AccountModal
        {...baseProps}
        account={account}
        social={contract}
        initialSection="friends"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));
    await waitFor(() =>
      expect(contract.acceptFriendRequest).toHaveBeenCalledWith("gc-ares3344")
    );
    fireEvent.click(screen.getByRole("button", { name: /Zeus.*View profile/i }));
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("44")).toBeTruthy();
    expect(screen.getByText("It Begins")).toBeTruthy();
    expect(screen.queryByText(/matches/i)).toBeNull();
  });

  it("joins a persistent game invitation without requesting a room code", async () => {
    const invite = {
      id: "invite-1",
      senderPublicId: "gc-ares3344",
      senderDisplayName: "Ares",
      variant: "classic" as const,
      playerCount: 2 as const,
      roomCode: "ABCDE",
      status: "pending" as const,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const acceptInvite = vi.fn(async () => undefined);
    render(
      <AccountModal
        {...baseProps}
        account={account}
        social={social({ invites: [invite], unreadCount: 1 })}
        initialSection="friends"
        onAcceptInvite={acceptInvite}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^join$/i }));
    await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith(invite));
    expect(screen.queryByLabelText(/room code/i)).toBeNull();
  });
});
