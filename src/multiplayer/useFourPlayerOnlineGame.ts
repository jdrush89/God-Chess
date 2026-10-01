import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FourPlayerAction,
  FourPlayerConfig,
  Seat,
} from "../game/fourPlayerTypes";
import {
  FourPlayerRoomHost,
  FourPlayerRoomPeer,
} from "./fourPlayerRoom";
import type {
  FourPlayerHostRoomSnapshot,
  FourPlayerRoomSnapshot,
} from "./types";

export type FourPlayerOnlineRole = "none" | "host" | "peer";

export interface FourPlayerOnlineState {
  role: FourPlayerOnlineRole;
  connecting: boolean;
  roomCode?: string;
  participantId?: string;
  playerName?: string;
  snapshot?: FourPlayerRoomSnapshot | FourPlayerHostRoomSnapshot;
  awaitingActionId?: string;
  ended?: boolean;
  error?: string;
}

const initialState: FourPlayerOnlineState = {
  role: "none",
  connecting: false,
};

const reconnectKey = (roomCode: string) =>
  `god-chess-four-player-reconnect:${roomCode}`;

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

export const reconcileFourPlayerSnapshot = (
  current: FourPlayerOnlineState,
  snapshot: FourPlayerRoomSnapshot,
): FourPlayerOnlineState => {
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

export const fourPlayerOnlineLocalSeat = (
  state: FourPlayerOnlineState,
) => state.snapshot?.participants.find(
  (participant) => participant.local,
)?.seat;

export const fourPlayerOnlineInputDisabled = (
  state: FourPlayerOnlineState,
) => {
  const canonical = state.snapshot?.canonical;
  const seat = fourPlayerOnlineLocalSeat(state);
  return (
    !canonical ||
    state.snapshot?.status !== "playing" ||
    !seat ||
    canonical.state.activeSeat !== seat ||
    Boolean(state.awaitingActionId)
  );
};

export const useFourPlayerOnlineGame = () => {
  const [state, setState] = useState<FourPlayerOnlineState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const hostRef = useRef<FourPlayerRoomHost | undefined>(undefined);
  const peerRef = useRef<FourPlayerRoomPeer | undefined>(undefined);

  useEffect(() => () => {
    hostRef.current?.stop();
    peerRef.current?.disconnect();
  }, []);

  const hostGame = useCallback(async (hostName: string) => {
    hostRef.current?.stop();
    peerRef.current?.disconnect();
    setState({
      ...initialState,
      connecting: true,
      playerName: hostName,
    });
    const host = new FourPlayerRoomHost(hostName, {
      onSnapshot: (snapshot) => setState((current) => ({
        ...current,
        role: "host",
        connecting: false,
        roomCode: snapshot.roomCode,
        participantId: host.hostParticipantId,
        snapshot,
        awaitingActionId: undefined,
      })),
      onError: (error) => setState((current) => ({
        ...current,
        connecting: false,
        error,
      })),
    });
    try {
      const roomCode = await host.start();
      hostRef.current = host;
      setState((current) => ({
        ...current,
        role: "host",
        connecting: false,
        roomCode,
        participantId: host.hostParticipantId,
        snapshot: host.snapshot,
      }));
    } catch (error) {
      host.stop();
      setState({
        ...initialState,
        error: error instanceof Error
          ? error.message
          : "Unable to host the four-player room.",
      });
    }
  }, []);

  const joinGame = useCallback(async (
    roomCode: string,
    playerName: string,
  ) => {
    hostRef.current?.stop();
    peerRef.current?.disconnect();
    const normalizedCode = roomCode.trim().toUpperCase();
    const normalizedName = playerName.trim().slice(0, 24) || "Guest";
    const token = readReconnectToken(normalizedCode);
    setState({
      ...initialState,
      connecting: true,
      roomCode: normalizedCode,
      playerName: normalizedName,
    });
    let peer: FourPlayerRoomPeer;
    peer = new FourPlayerRoomPeer({
      onAccepted: (participantId, acceptedToken, acceptedCode) => {
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
      onSnapshot: (snapshot) => setState((current) =>
        reconcileFourPlayerSnapshot(current, snapshot)
      ),
      onRejected: (reason) => {
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
      onError: (error) => setState((current) => ({
        ...current,
        connecting: false,
        awaitingActionId: undefined,
        error,
      })),
    });
    try {
      await peer.connect(normalizedCode, normalizedName, token);
      peerRef.current = peer;
    } catch (error) {
      peer.disconnect();
      setState({
        ...initialState,
        roomCode: normalizedCode,
        playerName: normalizedName,
        error: error instanceof Error
          ? error.message
          : "Unable to join the four-player room.",
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

  const assignSeat = useCallback((participantId: string, seat?: Seat) => {
    hostRef.current?.assignSeat(participantId, seat);
  }, []);

  const updateConfig = useCallback((config: FourPlayerConfig) => {
    hostRef.current?.updateConfig(config);
  }, []);

  const startGame = useCallback(() => hostRef.current?.startGame() ?? false, []);

  const sendAction = useCallback((action: FourPlayerAction) => {
    const current = stateRef.current;
    if (fourPlayerOnlineInputDisabled(current)) return;
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

  const setUndoConsent = useCallback((enabled: boolean) => {
    const current = stateRef.current;
    if (current.role === "host") {
      hostRef.current?.setHostUndoConsent(enabled);
    } else if (current.role === "peer") {
      peerRef.current?.setUndoConsent(enabled);
    }
  }, []);

  const requestUndo = useCallback(() => {
    const current = stateRef.current;
    if (!current.snapshot?.undoAvailable) return;
    if (current.role === "host") {
      hostRef.current?.requestHostUndo();
    } else if (current.role === "peer") {
      peerRef.current?.requestUndo();
      setState((value) => ({
        ...value,
        awaitingActionId: "undo",
      }));
    }
  }, []);

  const replaceWithAi = useCallback((seat: Seat, difficulty: number) => {
    hostRef.current?.replaceDisconnectedSeatWithAi(seat, difficulty);
  }, []);

  const disconnect = useCallback((forgetToken = true) => {
    const roomCode = stateRef.current.roomCode;
    hostRef.current?.stop();
    peerRef.current?.disconnect();
    hostRef.current = undefined;
    peerRef.current = undefined;
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
      setUndoConsent,
      requestUndo,
      replaceWithAi,
      disconnect,
    },
  ] as const;
};
