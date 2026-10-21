// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptSocialFriendRequest,
  createPublicIdCandidate,
  joinGameFromInvite,
  normalizePublicId,
  onlinePathForInvite,
  playerCountForInviteVariant,
  prepareSocialGameInvite,
  searchSocialProfiles,
  sendSocialFriendRequest,
  sendSocialGameInvite,
  useSocial,
} from "./social";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  postgresCallbacks: [] as Array<() => void>,
}));

vi.mock("./supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  },
}));

describe("social account contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.postgresCallbacks.length = 0;
    mocks.rpc.mockResolvedValue({ data: undefined, error: null });
    const channel = {
      on: vi.fn((_event, _filter, callback: () => void) => {
        mocks.postgresCallbacks.push(callback);
        return channel;
      }),
      subscribe: vi.fn(() => channel),
    };
    mocks.channel.mockReturnValue(channel);
  });

  it("normalizes and creates short public account IDs without UUID data", () => {
    expect(normalizePublicId(" GC-A_B!12cd34 ")).toBe("gc-ab12cd34");
    expect(createPublicIdCandidate([0, 1, 2, 3, 4, 5, 6, 7])).toMatch(
      /^gc-[a-z0-9]{8}$/,
    );
  });

  it("searches by display name without stripping spaces", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ public_id: "gc-athena22", display_name: "Athena Prime" }],
      error: null,
    });
    await expect(searchSocialProfiles(" Athena Prime ")).resolves.toEqual([
      { publicId: "gc-athena22", displayName: "Athena Prime" },
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith("search_profiles", {
      search_term: "Athena Prime",
    });
  });

  it("uses public IDs for friend request lifecycle RPCs", async () => {
    await sendSocialFriendRequest("GC-AB12CD34");
    await acceptSocialFriendRequest("GC-AB12CD34");
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "send_friend_request", {
      target_public_id: "gc-ab12cd34",
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "accept_friend_request", {
      target_public_id: "gc-ab12cd34",
    });
  });

  it.each([
    ["classic", 2, "/online/2"],
    ["three-player", 3, "/online/3"],
    ["four-player", 4, "/online/4"],
  ] as const)(
    "maps %s invitations to the existing %i-player join route",
    (variant, playerCount, path) => {
      expect(playerCountForInviteVariant(variant)).toBe(playerCount);
      expect(onlinePathForInvite({ playerCount })).toBe(path);
    },
  );

  it.each([
    ["classic", 2, "classic"],
    ["three-player", 3, "threePlayer"],
    ["four-player", 4, "fourPlayer"],
  ] as const)(
    "dispatches %s invitation joins directly to the %s action",
    async (variant, playerCount, actionName) => {
      const actions = {
        classic: vi.fn(async () => undefined),
        threePlayer: vi.fn(async () => undefined),
        fourPlayer: vi.fn(async () => undefined),
      };
      await joinGameFromInvite({
        id: "invite-1",
        senderPublicId: "gc-athena22",
        senderDisplayName: "Athena",
        variant,
        playerCount,
        roomCode: "ABCDE",
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }, "Zeus", actions);
      expect(actions[actionName]).toHaveBeenCalledWith("ABCDE", "Zeus");
      expect(
        Object.values(actions).filter((action) => action.mock.calls.length),
      ).toHaveLength(1);
    },
  );

  it("sends typed room metadata and rejects mismatched player counts", async () => {
    await sendSocialGameInvite(
      "gc-ab12cd34",
      "three-player",
      3,
      "abcde",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("send_game_invite", expect.objectContaining({
      target_public_id: "gc-ab12cd34",
      invite_variant: "three-player",
      invite_player_count: 3,
      invite_room_code: "ABCDE",
    }));
    expect(() =>
      sendSocialGameInvite("gc-ab12cd34", "classic", 4, "ABCDE")
    ).toThrow(/do not match/i);
  });

  it("maps a prepared persistent invitation to the client contract", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        id: "invite-1",
        sender_public_id: "gc-ab12cd34",
        sender_display_name: "Athena",
        variant: "four-player",
        player_count: 4,
        room_code: "ABCDE",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }],
      error: null,
    });
    await expect(prepareSocialGameInvite("invite-1")).resolves.toEqual(
      expect.objectContaining({
        id: "invite-1",
        senderPublicId: "gc-ab12cd34",
        senderDisplayName: "Athena",
        variant: "four-player",
        playerCount: 4,
        roomCode: "ABCDE",
        status: "pending",
      }),
    );
  });

  it("loads persistent invitations and refreshes them from realtime changes", async () => {
    const invite = {
      id: "invite-1",
      senderPublicId: "gc-ab12cd34",
      senderDisplayName: "Athena",
      variant: "classic",
      playerCount: 2,
      roomCode: "ABCDE",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          friends: [],
          incomingRequests: [],
          outgoingRequests: [],
          invites: [],
          sentInvites: [],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          friends: [],
          incomingRequests: [],
          outgoingRequests: [],
          invites: [invite],
          sentInvites: [],
        },
        error: null,
      });

    const { result } = renderHook(() => useSocial({
      userId: "user-1",
      email: "athena@example.com",
      displayName: "Athena",
      publicId: "gc-athena22",
    }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.channel).toHaveBeenCalledWith("social-inbox:user-1");

    mocks.postgresCallbacks[1]();
    await waitFor(() => expect(result.current.invites).toHaveLength(1));
    expect(result.current.unreadCount).toBe(1);
  });
});
