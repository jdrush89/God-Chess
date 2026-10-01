import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ThreePlayerAction,
  ThreePlayerConfig,
  ThreePlayerSeat,
} from "../game/threePlayerTypes";
import {
  ThreePlayerRoomHost,
  ThreePlayerRoomPeer,
} from "./threePlayerRoom";
import type {
  ThreePlayerHostRoomSnapshot,
  ThreePlayerRoomSnapshot,
} from "./types";

export type ThreePlayerOnlineRole = "none" | "host" | "peer";
export type ThreePlayerOnlineSnapshot =
  | ThreePlayerRoomSnapshot
  | ThreePlayerHostRoomSnapshot;

export interface ThreePlayerOnlineState {
  role: ThreePlayerOnlineRole;
  connecting: boolean;
  roomCode?: string;
  participantId?: string;
  playerName?: string;
  snapshot?: ThreePlayerOnlineSnapshot;
  awaitingActionId?: string;
  ended?: boolean;
  error?: string;
}

const initialState: ThreePlayerOnlineState = {
  role: "none",
  connecting: false,
};

const reconnectKey = (roomCode: string) =>
  `god-chess-three-player-reconnect:${roomCode}`;

const readReconnectToken = (roomCode: string) => {
  try {
    return window.sessionStorage.getItem(reconnectKey(roomCode)) ?? undefined;
  } catch {
    return undefined;
  }
};

const storeReconnectToken = (roomCode: string, token: string) => {
  try {
    window.sessionStorage.setItem(reconnectKey(roomCode), token);
  } catch {
    // Session storage can be unavailable in privacy-restricted browsers.
  }
};

const clearReconnectToken = (roomCode?: string) => {
  if (!roomCode) return;
  try {
    window.sessionStorage.removeItem(reconnectKey(roomCode));
  } catch {
    // Session storage can be unavailable in privacy-restricted browsers.
  }
};

const INVALID_RECONNECT_TOKEN =
  "That reconnect token is not valid for this match.";

export const reconcileThreePlayerSnapshot = (
  current: ThreePlayerOnlineState,
  snapshot: ThreePlayerOnlineSnapshot,
): ThreePlayerOnlineState => {
  const currentRevision = current.snapshot?.canonical?.revision;
  const incomingCanonical = snapshot.canonical;
  if (
    currentRevision !== undefined &&
    (
      incomingCanonical === undefined ||
      incomingCanonical.revision < currentRevision
    )
  ) {
    return current;
  }
  const revisionAdvanced =
    incomingCanonical !== undefined &&
    (
      currentRevision === undefined ||
      incomingCanonical.revision > currentRevision
    );
  const actionAcknowledged =
    current.awaitingActionId === undefined ||
    revisionAdvanced ||
    incomingCanonical?.lastActionId === current.awaitingActionId;
  return {
    ...current,
    role: current.role === "none" ? "peer" : current.role,
    connecting: false,
    roomCode: snapshot.roomCode,
    snapshot,
    awaitingActionId: actionAcknowledged
      ? undefined
      : current.awaitingActionId,
  };
};

export const threePlayerOnlineLocalSeat = (
  state: ThreePlayerOnlineState,
) => state.snapshot?.participants.find((participant) =>
  participant.local
)?.seat;

export const threePlayerOnlineInputDisabled = (
  state: ThreePlayerOnlineState,
) => {
  const canonical = state.snapshot?.canonical;
  const seat = threePlayerOnlineLocalSeat(state);
  const control = seat ? canonical?.state.players[seat].control : undefined;
  return (
    !canonical ||
    state.snapshot?.status !== "playing" ||
    Boolean(state.snapshot.undoProposal) ||
    !seat ||
    canonical.state.activeSeat !== seat ||
    control?.kind !== "online" ||
    control.local !== true ||
    Boolean(state.awaitingActionId)
  );
};

export const useThreePlayerOnlineGame = () => {
  const [state, setState] = useState<ThreePlayerOnlineState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const hostRef = useRef<ThreePlayerRoomHost | undefined>(undefined);
  const peerRef = useRef<ThreePlayerRoomPeer | undefined>(undefined);
  const attemptGeneration = useRef(0);

  useEffect(() => () => {
    attemptGeneration.current += 1;
    const host = hostRef.current;
    const peer = peerRef.current;
    hostRef.current = undefined;
    peerRef.current = undefined;
    host?.stop();
    peer?.disconnect();
  }, []);

  const hostGame = useCallback(async (hostName: string) => {
    const generation = attemptGeneration.current + 1;
    attemptGeneration.current = generation;
    const previousHost = hostRef.current;
    const previousPeer = peerRef.current;
    hostRef.current = undefined;
    peerRef.current = undefined;
    previousHost?.stop();
    previousPeer?.disconnect();
    setState({
      ...initialState,
      connecting: true,
      playerName: hostName,
    });
    let host: ThreePlayerRoomHost;
    const isCurrent = () =>
      attemptGeneration.current === generation &&
      hostRef.current === host;
    host = new ThreePlayerRoomHost(hostName, {
      onSnapshot: (snapshot) => {
        if (!isCurrent()) return;
        setState((current) => ({
          ...reconcileThreePlayerSnapshot(current, snapshot),
          role: "host",
          participantId: host.hostParticipantId,
        }));
      },
      onError: (error) => {
        if (!isCurrent()) return;
        setState((current) => ({
          ...current,
          connecting: false,
          error,
        }));
      },
    });
    hostRef.current = host;
    try {
      const roomCode = await host.start();
      if (!isCurrent()) {
        host.stop();
        return;
      }
      setState((current) => ({
        ...current,
        role: "host",
        connecting: false,
        roomCode,
        participantId: host.hostParticipantId,
        snapshot: host.snapshot,
      }));
    } catch (error) {
      if (!isCurrent()) return;
      hostRef.current = undefined;
      host.stop();
      setState({
        ...initialState,
        error: error instanceof Error
          ? error.message
          : "Unable to host the three-player room.",
      });
    }
  }, []);

  const joinGame = useCallback(async (
    roomCode: string,
    playerName: string,
  ) => {
    const generation = attemptGeneration.current + 1;
    attemptGeneration.current = generation;
    const previousHost = hostRef.current;
    const previousPeer = peerRef.current;
    hostRef.current = undefined;
    peerRef.current = undefined;
    previousHost?.stop();
    previousPeer?.disconnect();
    const normalizedCode = roomCode.trim().toUpperCase();
    const normalizedName = playerName.trim().slice(0, 24) || "Guest";
    const token = readReconnectToken(normalizedCode);
    setState({
      ...initialState,
      connecting: true,
      roomCode: normalizedCode,
      playerName: normalizedName,
    });
    let peer: ThreePlayerRoomPeer;
    const isCurrent = () =>
      attemptGeneration.current === generation &&
      peerRef.current === peer;
    peer = new ThreePlayerRoomPeer({
      onAccepted: (participantId, acceptedToken, acceptedCode) => {
        if (!isCurrent()) return;
        storeReconnectToken(acceptedCode, acceptedToken);
        setState((current) => ({
          ...current,
          role: "peer",
          connecting: false,
          participantId,
          roomCode: acceptedCode,
          error: undefined,
        }));
      },
      onSnapshot: (snapshot) => {
        if (!isCurrent()) return;
        setState((current) =>
          reconcileThreePlayerSnapshot(current, snapshot)
        );
      },
      onRejected: (reason) => {
        if (!isCurrent()) return;
        peerRef.current = undefined;
        peer.disconnect();
        if (token && reason === INVALID_RECONNECT_TOKEN) {
          clearReconnectToken(normalizedCode);
        }
        setState({
          ...initialState,
          roomCode: normalizedCode,
          playerName: normalizedName,
          error: reason,
        });
      },
      onDisconnected: (roomEnded) => {
        if (!isCurrent()) return;
        peerRef.current = undefined;
        if (roomEnded) clearReconnectToken(normalizedCode);
        setState((current) => ({
          ...initialState,
          roomCode: current.roomCode,
          playerName: current.playerName,
          ended: true,
          connecting: false,
          error: roomEnded
            ? "The host disconnected. This room has ended."
            : "The connection was interrupted. Rejoin the room to resume.",
        }));
      },
      onError: (error) => {
        if (!isCurrent()) return;
        setState((current) => ({
          ...current,
          connecting: false,
          error,
        }));
      },
    });
    peerRef.current = peer;
    try {
      await peer.connect(normalizedCode, normalizedName, token);
      if (!isCurrent()) peer.disconnect();
    } catch (error) {
      if (!isCurrent()) return;
      peerRef.current = undefined;
      peer.disconnect();
      setState({
        ...initialState,
        roomCode: normalizedCode,
        playerName: normalizedName,
        error: error instanceof Error
          ? error.message
          : "Unable to join the three-player room.",
      });
    }
  }, []);

  const setReady = useCallback((ready: boolean) => {
    const current = stateRef.current;
    if (current.role === "host") {
      hostRef.current?.setHostReady(ready);
    } else if (current.role === "peer") {
      peerRef.current?.setReady(ready);
    }
  }, []);

  const assignSeat = useCallback((
    participantId: string,
    seat?: ThreePlayerSeat,
  ) => {
    hostRef.current?.assignSeat(participantId, seat);
  }, []);

  const updateConfig = useCallback((config: ThreePlayerConfig) => {
    hostRef.current?.updateConfig(config);
  }, []);

  const startGame = useCallback(() =>
    hostRef.current?.startGame() ?? false, []);

  const sendAction = useCallback((action: ThreePlayerAction) => {
    const current = stateRef.current;
    if (threePlayerOnlineInputDisabled(current)) return;
    if (current.role === "host") {
      hostRef.current?.submitHostAction(action);
      return;
    }
    const revision = current.snapshot?.canonical?.revision;
    if (current.role !== "peer" || revision === undefined) return;
    const actionId = globalThis.crypto?.randomUUID?.() ??
      `action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    peerRef.current?.sendAction(revision, actionId, action);
    setState((value) => ({
      ...value,
      awaitingActionId: actionId,
      error: undefined,
    }));
  }, []);

  const requestUndo = useCallback(() => {
    const current = stateRef.current;
    const revision = current.snapshot?.canonical?.revision;
    if (!current.snapshot?.undoAvailable || revision === undefined) return;
    if (current.role === "host") {
      hostRef.current?.requestHostUndo();
    } else if (current.role === "peer") {
      peerRef.current?.requestUndo(revision);
    }
  }, []);

  const voteUndo = useCallback((approved: boolean) => {
    const current = stateRef.current;
    const proposal = current.snapshot?.undoProposal;
    if (
      !proposal?.localEligible ||
      (approved && proposal.localApproved)
    ) return;
    if (current.role === "host") {
      hostRef.current?.voteHostUndo(
        proposal.requestId,
        proposal.targetRevision,
        approved,
      );
    } else if (current.role === "peer") {
      peerRef.current?.voteUndo(
        proposal.requestId,
        proposal.targetRevision,
        approved,
      );
    }
  }, []);

  const replaceWithAi = useCallback((
    seat: ThreePlayerSeat,
    difficulty: number,
  ) => {
    hostRef.current?.replaceDisconnectedSeatWithAi(seat, difficulty);
  }, []);

  const disconnect = useCallback((forgetToken = true) => {
    const roomCode = stateRef.current.roomCode;
    attemptGeneration.current += 1;
    const host = hostRef.current;
    const peer = peerRef.current;
    hostRef.current = undefined;
    peerRef.current = undefined;
    host?.stop();
    peer?.disconnect();
    if (forgetToken) clearReconnectToken(roomCode);
    setState(initialState);
  }, []);

  return [
    state,
    {
      hostGame,
      joinGame,
      setReady,
      assignSeat,
      updateConfig,
      startGame,
      sendAction,
      requestUndo,
      voteUndo,
      replaceWithAi,
      disconnect,
    },
  ] as const;
};
