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
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => () => {
    hostRef.current?.stop();
    peerRef.current?.disconnect();
  }, []);

  const hostGame = useCallback(async (hostName: string) => {
    hostRef.current?.stop();
    peerRef.current?.disconnect();
    setState({ ...initialState, connecting: true });
    const host = new MultiplayerHost(hostName, {
      getState: () => callbacksRef.current.getState(),
      applyRemoteAction: (action) => callbacksRef.current.applyRemoteAction(action),
      applyUndo: () => callbacksRef.current.applyUndo(),
      canUndo: () => callbacksRef.current.canUndo(),
      onGuestJoined: (guest) => setState((current) => ({ ...current, guest })),
      onGuestLeft: () => setState((current) => ({
        ...current,
        guest: undefined,
        started: false,
        localColor: undefined,
        undoConsent: { ...current.undoConsent, peer: false },
        undoAvailable: false,
        error: current.started ? "The other player disconnected." : undefined,
      })),
      onUndoSettings: (hostEnabled, guestEnabled, canUndo) => setState((current) => ({
        ...current,
        undoConsent: { host: hostEnabled, peer: guestEnabled },
        undoAvailable: canUndo,
      })),
      onError: (error) => setState((current) => ({ ...current, error, connecting: false })),
    });
    try {
      const roomCode = await host.start();
      hostRef.current = host;
      setState({
        ...initialState,
        role: "host",
        roomCode,
        hostName,
      });
    } catch (error) {
      host.stop();
      setState({
        ...initialState,
        connecting: false,
        error: error instanceof Error ? error.message : "Unable to host the game.",
      });
    }
  }, []);

  const joinGame = useCallback(async (roomCode: string, playerName: string) => {
    hostRef.current?.stop();
    peerRef.current?.disconnect();
    const normalizedCode = roomCode.trim().toUpperCase();
    setState({
      ...initialState,
      roomCode: normalizedCode,
      connecting: true,
    });
    const peer = new MultiplayerPeer({
      onJoinAccepted: (guest, acceptedCode) => setState((current) => ({
        ...current,
        role: "peer",
        roomCode: acceptedCode,
        guest,
        connecting: false,
        awaitingSync: false,
      })),
      onLobbyState: (hostName, guest) => setState((current) => ({
        ...current,
        hostName,
        guest,
      })),
      onGameStart: (gameState, guestColor) => {
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
        callbacksRef.current.receiveState(gameState);
        setState((current) => ({ ...current, awaitingSync: false }));
      },
      onUndoSettings: (hostEnabled, guestEnabled, canUndo) => setState((current) => ({
        ...current,
        undoConsent: { host: hostEnabled, peer: guestEnabled },
        undoAvailable: canUndo,
      })),
      onRejected: (reason) => {
        peer.disconnect();
        setState({
          ...initialState,
          connecting: false,
          error: reason,
        });
      },
      onDisconnected: () => setState((current) => ({
        ...current,
        started: false,
        localColor: undefined,
        error: "The host disconnected.",
      })),
      onError: (error) => setState((current) => ({ ...current, error, connecting: false })),
    });
    try {
      await peer.connect(normalizedCode, playerName.trim().slice(0, 24) || "Guest");
      peerRef.current = peer;
    } catch (error) {
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
    hostRef.current?.stop();
    peerRef.current?.disconnect();
    hostRef.current = undefined;
    peerRef.current = undefined;
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
