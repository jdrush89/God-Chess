import { useCallback, useEffect, useMemo, useState } from "react";
import type { AchievementId } from "../achievements";
import type { PlayerStatisticsSnapshot } from "../playerStatistics";
import { supabase } from "./supabase";
import type { AccountProfile } from "./useAccount";
import {
  normalizeAccountPortraitId,
  type AccountPortraitId,
} from "./portraits";
import {
  normalizeRankedRating,
  type RankedRating,
} from "../ranked/types";

export type InviteVariant = "classic" | "three-player" | "four-player";
export type InvitePlayerCount = 2 | 3 | 4;

export interface SocialProfile {
  publicId: string;
  displayName: string;
  portraitId?: AccountPortraitId;
}

export interface FriendProfile extends SocialProfile {
  stats?: PlayerStatisticsSnapshot;
  rankedRating?: RankedRating;
  completedAchievementIds: AchievementId[];
}

export interface FriendRequest extends SocialProfile {
  status: "pending";
  incoming: boolean;
}

export interface GameInvite {
  id: string;
  senderPublicId: string;
  senderDisplayName: string;
  variant: InviteVariant;
  playerCount: InvitePlayerCount;
  roomCode: string;
  status: "pending";
  expiresAt: string;
}

export interface SentGameInvite {
  recipientPublicId: string;
  variant: InviteVariant;
  roomCode: string;
}

interface SocialInbox {
  friends: FriendProfile[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  invites: GameInvite[];
  sentInvites: SentGameInvite[];
}

export interface SocialContract extends SocialInbox {
  unreadCount: number;
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
  search: (term: string) => Promise<SocialProfile[]>;
  sendFriendRequest: (publicId: string) => Promise<void>;
  acceptFriendRequest: (publicId: string) => Promise<void>;
  declineFriendRequest: (publicId: string) => Promise<void>;
  removeFriend: (publicId: string) => Promise<void>;
  sendInvite: (
    publicId: string,
    variant: InviteVariant,
    playerCount: InvitePlayerCount,
    roomCode: string,
  ) => Promise<void>;
  prepareInvite: (id: string) => Promise<GameInvite>;
  respondInvite: (
    id: string,
    status: "accepted" | "declined" | "dismissed",
  ) => Promise<void>;
}

const EMPTY_INBOX: SocialInbox = {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  invites: [],
  sentInvites: [],
};

export const normalizePublicId = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 11);

export const createPublicIdCandidate = (bytes: ArrayLike<number>) => {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const suffix = Array.from({ length: 8 }, (_, index) =>
    alphabet[(bytes[index] ?? index) % alphabet.length]
  ).join("");
  return `gc-${suffix}`;
};

export const normalizeRoomCode = (value: string) =>
  value.trim().toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 5);

export const playerCountForInviteVariant = (
  variant: InviteVariant,
): InvitePlayerCount =>
  variant === "classic" ? 2 : variant === "three-player" ? 3 : 4;

export const onlinePathForInvite = (invite: Pick<GameInvite, "playerCount">) =>
  `/online/${invite.playerCount}`;

export const isUsableGameInvite = (
  invite: Pick<GameInvite, "variant" | "playerCount" | "roomCode" | "expiresAt">,
  now = Date.now(),
) =>
  playerCountForInviteVariant(invite.variant) === invite.playerCount &&
  normalizeRoomCode(invite.roomCode).length === 5 &&
  Date.parse(invite.expiresAt) > now;

export const joinGameFromInvite = async (
  invite: GameInvite,
  displayName: string,
  portraitId: AccountPortraitId,
  actions: {
    classic: (
      roomCode: string,
      playerName: string,
      portraitId: AccountPortraitId,
    ) => Promise<void>;
    threePlayer: (
      roomCode: string,
      playerName: string,
      portraitId: AccountPortraitId,
    ) => Promise<void>;
    fourPlayer: (
      roomCode: string,
      playerName: string,
      portraitId: AccountPortraitId,
    ) => Promise<void>;
  },
) => {
  if (!isUsableGameInvite(invite)) {
    throw new Error("This game invitation is no longer available.");
  }
  if (invite.variant === "classic") {
    await actions.classic(invite.roomCode, displayName, portraitId);
  } else if (invite.variant === "three-player") {
    await actions.threePlayer(invite.roomCode, displayName, portraitId);
  } else {
    await actions.fourPlayer(invite.roomCode, displayName, portraitId);
  }
};

const callRpc = async <T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> => {
  if (!supabase) throw new Error("Account services are not configured.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
};

const normalizeInbox = (value: unknown): SocialInbox => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_INBOX;
  }
  const source = value as Partial<SocialInbox>;
  const normalizeProfile = <T extends SocialProfile>(profile: T): T => ({
    ...profile,
    portraitId: normalizeAccountPortraitId(profile.portraitId),
  }) as T;
  const normalizeFriend = (profile: FriendProfile): FriendProfile => ({
    ...normalizeProfile(profile),
    rankedRating: profile.rankedRating &&
        typeof profile.rankedRating === "object"
      ? normalizeRankedRating(profile.rankedRating)
      : undefined,
  });
  return {
    friends: Array.isArray(source.friends)
      ? source.friends.map(normalizeFriend)
      : [],
    incomingRequests: Array.isArray(source.incomingRequests)
      ? source.incomingRequests.map(normalizeProfile)
      : [],
    outgoingRequests: Array.isArray(source.outgoingRequests)
      ? source.outgoingRequests.map(normalizeProfile)
      : [],
    invites: Array.isArray(source.invites)
      ? source.invites.filter(isUsableGameInvite)
      : [],
    sentInvites: Array.isArray(source.sentInvites) ? source.sentInvites : [],
  };
};

export const loadSocialInbox = async () =>
  normalizeInbox(await callRpc<unknown>("social_inbox"));

export const searchSocialProfiles = async (term: string) => {
  const normalized = term.trim().slice(0, 24);
  if (!normalized) return [];
  const rows = await callRpc<Array<{
    public_id: string;
    display_name: string;
    portrait_id: string;
  }>>("search_profiles", {
    search_term: normalized,
  });
  return rows.map((row) => ({
    publicId: row.public_id,
    displayName: row.display_name,
    portraitId: normalizeAccountPortraitId(row.portrait_id),
  }));
};

export const sendSocialFriendRequest = (publicId: string) =>
  callRpc<void>("send_friend_request", {
    target_public_id: normalizePublicId(publicId),
  });

export const acceptSocialFriendRequest = (publicId: string) =>
  callRpc<void>("accept_friend_request", {
    target_public_id: normalizePublicId(publicId),
  });

export const declineSocialFriendRequest = (publicId: string) =>
  callRpc<void>("decline_friend_request", {
    target_public_id: normalizePublicId(publicId),
  });

export const removeSocialFriend = (publicId: string) =>
  callRpc<void>("remove_friend", {
    target_public_id: normalizePublicId(publicId),
  });

export const sendSocialGameInvite = (
  publicId: string,
  variant: InviteVariant,
  playerCount: InvitePlayerCount,
  roomCode: string,
) => {
  if (playerCountForInviteVariant(variant) !== playerCount) {
    throw new Error("The invitation mode and player count do not match.");
  }
  const normalizedCode = normalizeRoomCode(roomCode);
  if (normalizedCode.length !== 5) throw new Error("The room code is invalid.");
  return callRpc<string>("send_game_invite", {
    target_public_id: normalizePublicId(publicId),
    invite_variant: variant,
    invite_player_count: playerCount,
    invite_room_code: normalizedCode,
    invite_expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });
};

export const prepareSocialGameInvite = async (id: string) => {
  const rows = await callRpc<Array<{
    id: string;
    sender_public_id: string;
    sender_display_name: string;
    variant: InviteVariant;
    player_count: InvitePlayerCount;
    room_code: string;
    expires_at: string;
  }>>("prepare_game_invite", {
    invite_id: id,
  });
  const row = rows[0];
  const invite: GameInvite | undefined = row && {
    id: row.id,
    senderPublicId: row.sender_public_id,
    senderDisplayName: row.sender_display_name,
    variant: row.variant,
    playerCount: row.player_count,
    roomCode: row.room_code,
    status: "pending",
    expiresAt: row.expires_at,
  };
  if (!invite || !isUsableGameInvite(invite)) {
    throw new Error("This game invitation is no longer available.");
  }
  return invite;
};

export const respondToSocialGameInvite = (
  id: string,
  status: "accepted" | "declined" | "dismissed",
) =>
  callRpc<void>("respond_game_invite", {
    invite_id: id,
    next_status: status,
  });

export const useSocial = (account?: AccountProfile): SocialContract => {
  const [inbox, setInbox] = useState<SocialInbox>(EMPTY_INBOX);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!account || !supabase) {
      setInbox(EMPTY_INBOX);
      setError(undefined);
      return;
    }
    setLoading(true);
    try {
      setInbox(await loadSocialInbox());
      setError(undefined);
    } catch (nextError) {
      console.error("Unable to load the social inbox.", nextError);
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load friends and invitations.",
      );
    } finally {
      setLoading(false);
    }
  }, [account?.userId]);

  useEffect(() => {
    void refresh();
    if (!account || !supabase) return;
    const client = supabase;
    const channel = client
      .channel(`social-inbox:${account.userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friend_requests" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_invitations" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [account?.userId, refresh]);

  const runAndRefresh = useCallback(async (
    action: () => Promise<unknown>,
  ) => {
    await action();
    await refresh();
  }, [refresh]);

  return useMemo(() => ({
    ...inbox,
    unreadCount: inbox.incomingRequests.length + inbox.invites.length,
    loading,
    error,
    refresh,
    search: searchSocialProfiles,
    sendFriendRequest: (publicId: string) =>
      runAndRefresh(() => sendSocialFriendRequest(publicId)),
    acceptFriendRequest: (publicId: string) =>
      runAndRefresh(() => acceptSocialFriendRequest(publicId)),
    declineFriendRequest: (publicId: string) =>
      runAndRefresh(() => declineSocialFriendRequest(publicId)),
    removeFriend: (publicId: string) =>
      runAndRefresh(() => removeSocialFriend(publicId)),
    sendInvite: (
      publicId: string,
      variant: InviteVariant,
      playerCount: InvitePlayerCount,
      roomCode: string,
    ) => runAndRefresh(() =>
      sendSocialGameInvite(publicId, variant, playerCount, roomCode)
    ),
    prepareInvite: prepareSocialGameInvite,
    respondInvite: (
      id: string,
      status: "accepted" | "declined" | "dismissed",
    ) => runAndRefresh(() => respondToSocialGameInvite(id, status)),
  }), [error, inbox, loading, refresh, runAndRefresh]);
};
