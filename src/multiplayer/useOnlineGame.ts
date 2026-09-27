import { useCallback, useEffect, useRef, useState } from "react";
import type { GameAction } from "../game/engine";
import type { GameState } from "../game/types";
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
  error?: string;
}

interface OnlineCallbacks {
  getState: () => GameState;
  applyRemoteAction: (action: GameAction) => GameState;
  receiveState: (state: GameState) => void;
}

const initialState: OnlineGameState = {
  role: "none",
  connecting: false,
  started: false,
  awaitingSync: false,
};

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
    setState({ role: "none", connecting: true, started: false, awaitingSync: false });
    const host = new MultiplayerHost(hostName, {
      getState: () => callbacksRef.current.getState(),
      applyRemoteAction: (action) => callbacksRef.current.applyRemoteAction(action),
      onGuestJoined: (guest) => setState((current) => ({ ...current, guest })),
      onGuestLeft: () => setState((current) => ({
        ...current,
        guest: undefined,
        started: false,
        error: current.started ? "The other player disconnected." : undefined,
      })),
      onError: (error) => setState((current) => ({ ...current, error, connecting: false })),
    });
    try {
      const roomCode = await host.start();
      hostRef.current = host;
      setState({
        role: "host",
        roomCode,
        hostName,
        connecting: false,
        started: false,
        awaitingSync: false,
      });
    } catch (error) {
      host.stop();
      setState({
        role: "none",
        connecting: false,
        started: false,
        awaitingSync: false,
        error: error instanceof Error ? error.message : "Unable to host the game.",
      });
    }
  }, []);

  const joinGame = useCallback(async (roomCode: string, playerName: string) => {
    hostRef.current?.stop();
    peerRef.current?.disconnect();
    const normalizedCode = roomCode.trim().toUpperCase();
    setState({
      role: "none",
      roomCode: normalizedCode,
      connecting: true,
      started: false,
      awaitingSync: false,
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
      onGameStart: (gameState) => {
        callbacksRef.current.receiveState(gameState);
        setState((current) => ({
          ...current,
          started: true,
          connecting: false,
          awaitingSync: false,
        }));
      },
      onStateSync: (gameState) => {
        callbacksRef.current.receiveState(gameState);
        setState((current) => ({ ...current, awaitingSync: false }));
      },
      onRejected: (reason) => {
        peer.disconnect();
        setState({
          role: "none",
          connecting: false,
          started: false,
          awaitingSync: false,
          error: reason,
        });
      },
      onDisconnected: () => setState((current) => ({
        ...current,
        started: false,
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
        role: "none",
        connecting: false,
        started: false,
        awaitingSync: false,
        error: error instanceof Error ? error.message : "Unable to join the game.",
      });
    }
  }, []);

  const startGame = useCallback((gameState: GameState) => {
    hostRef.current?.startGame(gameState);
    setState((current) => ({ ...current, started: true }));
  }, []);

  const syncState = useCallback((gameState: GameState) => {
    hostRef.current?.syncState(gameState);
  }, []);

  const sendAction = useCallback((action: GameAction) => {
    peerRef.current?.sendAction(action);
    setState((current) => ({ ...current, awaitingSync: true }));
  }, []);

  const disconnect = useCallback(() => {
    hostRef.current?.stop();
    peerRef.current?.disconnect();
    hostRef.current = undefined;
    peerRef.current = undefined;
    setState(initialState);
  }, []);

  return [state, { hostGame, joinGame, startGame, syncState, sendAction, disconnect }] as const;
};
