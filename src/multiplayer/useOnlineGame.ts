import { useCallback, useEffect, useRef, useState } from "react";
import type { GameAction } from "../game/engine";
import type { Color, GameState } from "../game/types";
import { MultiplayerHost } from "./host";
import { MultiplayerPeer } from "./peer";
import type { OnlinePlayer } from "./types";

export type OnlineRole = "none" | "host" | "peer";

export interface OnlineGameState {
  role: OnlineRole;
  roomCode?: string;
  hostName?: string;
  guest?: OnlinePlayer;
  connecting: boolean;
  started: boolean;
  awaitingSync: boolean;
  localColor?: Color;
  undoConsent: {
    host: boolean;
    peer: boolean;
  };
  undoAvailable: boolean;
  error?: string;
}

interface OnlineCallbacks {
  getState: () => GameState;
  applyRemoteAction: (action: GameAction) => GameState;
  applyUndo: () => GameState | undefined;
  canUndo: () => boolean;
  receiveState: (state: GameState) => void;
}

const initialState: OnlineGameState = {
  role: "none",
  connecting: false,
  started: false,
  awaitingSync: false,
  undoConsent: { host: false, peer: false },
  undoAvailable: false,
};

export const onlinePlayerColor = (state: OnlineGameState, hostColor?: Color) => {
  if (hostColor && state.role === "host") return hostColor;
  if (hostColor && state.role === "peer") return hostColor === "white" ? "black" : "white";
  return state.localColor;
};

export const onlineTurnInputDisabled = (
  state: OnlineGameState,
  activeColor: Color,
  hostColor?: Color,
) => onlinePlayerColor(state, hostColor) !== activeColor || state.awaitingSync;

export const onlineUndoEnabled = (state: OnlineGameState) =>
  state.undoConsent.host && state.undoConsent.peer;

export const useOnlineGame = (callbacks: OnlineCallbacks) => {
  const [state, setState] = useState(initialState);
  const hostRef = useRef<MultiplayerHost | undefined>(undefined);
  const peerRef = useRef<MultiplayerPeer | undefined>(undefined);
  const attemptGeneration = useRef(0);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

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
    setState({ ...initialState, connecting: true });
    let host: MultiplayerHost;
    const isCurrent = () =>
      attemptGeneration.current === generation &&
      hostRef.current === host;
    host = new MultiplayerHost(hostName, {
      getState: () => callbacksRef.current.getState(),
      applyRemoteAction: (action) => callbacksRef.current.applyRemoteAction(action),
      applyUndo: () => callbacksRef.current.applyUndo(),
      canUndo: () => callbacksRef.current.canUndo(),
      onGuestJoined: (guest) => {
        if (isCurrent()) setState((current) => ({ ...current, guest }));
      },
      onGuestLeft: () => {
        if (!isCurrent()) return;
        setState((current) => ({
          ...current,
          guest: undefined,
          started: false,
          localColor: undefined,
          undoConsent: { ...current.undoConsent, peer: false },
          undoAvailable: false,
          error: current.started ? "The other player disconnected." : undefined,
        }));
      },
      onUndoSettings: (hostEnabled, guestEnabled, canUndo) => {
        if (!isCurrent()) return;
        setState((current) => ({
          ...current,
          undoConsent: { host: hostEnabled, peer: guestEnabled },
          undoAvailable: canUndo,
        }));
      },
      onError: (error) => {
        if (isCurrent()) {
          setState((current) => ({ ...current, error, connecting: false }));
        }
      },
    });
    hostRef.current = host;
    try {
      const roomCode = await host.start();
      if (!isCurrent()) {
        host.stop();
        return;
      }
      setState({
        ...initialState,
        role: "host",
        roomCode,
        hostName,
      });
    } catch (error) {
      if (!isCurrent()) return;
      hostRef.current = undefined;
      host.stop();
      setState({
        ...initialState,
        connecting: false,
        error: error instanceof Error ? error.message : "Unable to host the game.",
      });
    }
  }, []);

  const joinGame = useCallback(async (roomCode: string, playerName: string) => {
    const generation = attemptGeneration.current + 1;
    attemptGeneration.current = generation;
    const previousHost = hostRef.current;
    const previousPeer = peerRef.current;
    hostRef.current = undefined;
    peerRef.current = undefined;
    previousHost?.stop();
    previousPeer?.disconnect();
    const normalizedCode = roomCode.trim().toUpperCase();
    setState({
      ...initialState,
      roomCode: normalizedCode,
      connecting: true,
    });
    let peer: MultiplayerPeer;
    const isCurrent = () =>
      attemptGeneration.current === generation &&
      peerRef.current === peer;
    peer = new MultiplayerPeer({
      onJoinAccepted: (guest, acceptedCode) => {
        if (!isCurrent()) return;
        setState((current) => ({
          ...current,
          role: "peer",
          roomCode: acceptedCode,
          guest,
          connecting: false,
          awaitingSync: false,
        }));
      },
      onLobbyState: (hostName, guest) => {
        if (isCurrent()) setState((current) => ({ ...current, hostName, guest }));
      },
      onGameStart: (gameState, guestColor) => {
        if (!isCurrent()) return;
        callbacksRef.current.receiveState(gameState);
        setState((current) => ({
          ...current,
          started: true,
          connecting: false,
          awaitingSync: false,
          localColor: guestColor,
        }));
      },
      onStateSync: (gameState) => {
        if (!isCurrent()) return;
        callbacksRef.current.receiveState(gameState);
        setState((current) => ({ ...current, awaitingSync: false }));
      },
      onUndoSettings: (hostEnabled, guestEnabled, canUndo) => {
        if (!isCurrent()) return;
        setState((current) => ({
          ...current,
          undoConsent: { host: hostEnabled, peer: guestEnabled },
          undoAvailable: canUndo,
        }));
      },
      onRejected: (reason) => {
        if (!isCurrent()) return;
        peerRef.current = undefined;
        peer.disconnect();
        setState({
          ...initialState,
          connecting: false,
          error: reason,
        });
      },
      onDisconnected: () => {
        if (!isCurrent()) return;
        peerRef.current = undefined;
        setState((current) => ({
          ...current,
          started: false,
          localColor: undefined,
          error: "The host disconnected.",
        }));
      },
      onError: (error) => {
        if (isCurrent()) {
          setState((current) => ({ ...current, error, connecting: false }));
        }
      },
    });
    peerRef.current = peer;
    try {
      await peer.connect(normalizedCode, playerName.trim().slice(0, 24) || "Guest");
      if (!isCurrent()) peer.disconnect();
    } catch (error) {
      if (!isCurrent()) return;
      peerRef.current = undefined;
      peer.disconnect();
      setState({
        ...initialState,
        connecting: false,
        error: error instanceof Error ? error.message : "Unable to join the game.",
      });
    }
  }, []);

  const startGame = useCallback((gameState: GameState) => {
    hostRef.current?.startGame(gameState);
    setState((current) => ({
      ...current,
      started: true,
      localColor: gameState.onlineHostColor,
    }));
  }, []);

  const syncState = useCallback((gameState: GameState) => {
    hostRef.current?.syncState(gameState);
  }, []);

  const sendAction = useCallback((action: GameAction) => {
    peerRef.current?.sendAction(action);
    setState((current) => ({ ...current, awaitingSync: true }));
  }, []);

  const setUndoConsent = useCallback((enabled: boolean) => {
    if (state.role === "host") {
      hostRef.current?.setUndoConsent(enabled);
      return;
    }
    if (state.role === "peer") {
      peerRef.current?.sendUndoConsent(enabled);
      setState((current) => ({
        ...current,
        undoConsent: { ...current.undoConsent, peer: enabled },
        undoAvailable: enabled && current.undoConsent.host && current.undoAvailable,
      }));
    }
  }, [state.role]);

  const requestUndo = useCallback(() => {
    if (!onlineUndoEnabled(state) || !state.undoAvailable) return;
    if (state.role === "host") {
      hostRef.current?.requestUndo();
      return;
    }
    if (state.role === "peer") {
      peerRef.current?.requestUndo();
      setState((current) => ({ ...current, awaitingSync: true }));
    }
  }, [state]);

  const disconnect = useCallback(() => {
    attemptGeneration.current += 1;
    const host = hostRef.current;
    const peer = peerRef.current;
    hostRef.current = undefined;
    peerRef.current = undefined;
    host?.stop();
    peer?.disconnect();
    setState(initialState);
  }, []);

  return [
    state,
    {
      hostGame,
      joinGame,
      startGame,
      syncState,
      sendAction,
      setUndoConsent,
      requestUndo,
      disconnect,
    },
  ] as const;
};
