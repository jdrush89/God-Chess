import Peer from "simple-peer-light";
import {
  normalizeProtocolMessage,
  type ProtocolMessage,
} from "./types";

const SIGNALING_URL = "wss://rogue-daytrader-signaling.onrender.com";
const CONNECTION_TIMEOUT_MS = 20_000;
const RELAY_FALLBACK_MS = 8_000;

export const generateRoomCode = () => {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 5 },
    () => characters[Math.floor(Math.random() * characters.length)],
  ).join("");
};

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
export type PeerDisconnectReason = "peer-left" | "connection-lost";

export interface NetworkCallbacks {
  onMessage: (peerId: string, message: ProtocolMessage) => void;
  onInvalidMessage?: (peerId: string) => void;
  onPeerConnected: (peerId: string) => void;
  onPeerDisconnected: (
    peerId: string,
    reason: PeerDisconnectReason,
  ) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  onError: (error: string) => void;
}

export interface MultiplayerTransport {
  readonly connectedPeers: string[];
  hostRoom: (roomCode: string) => Promise<void>;
  joinRoom: (roomCode: string) => Promise<void>;
  send: (peerId: string, message: ProtocolMessage) => void;
  sendToHost: (message: ProtocolMessage) => void;
  broadcast: (message: ProtocolMessage) => void;
  disconnect: () => void;
}

export type TransportFactory = (
  callbacks: NetworkCallbacks,
) => MultiplayerTransport;

export class NetworkManager implements MultiplayerTransport {
  private ws: WebSocket | null = null;
  private peers = new Map<string, Peer>();
  private relayPeers = new Set<string>();
  private callbacks: NetworkCallbacks;
  private peerId = crypto.randomUUID();
  private isHost = false;
  private hostPeerId: string | null = null;
  private firstConnectionResolver: (() => void) | null = null;

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
  }

  get connectedPeers() {
    return [...new Set([...this.peers.keys(), ...this.relayPeers])];
  }

  async hostRoom(roomCode: string) {
    this.isHost = true;
    await this.connectSignaling();
    await this.waitForRoomResponse(
      { type: "create_room", roomCode, peerId: this.peerId },
      "room_created",
      "creating room",
    );
  }

  async joinRoom(roomCode: string) {
    this.isHost = false;
    await this.connectSignaling();
    const response = await this.waitForRoomResponse(
      { type: "join_room", roomCode, peerId: this.peerId },
      "room_joined",
      "joining room",
    );
    const hostPeerId = (response.peers as string[] | undefined)?.[0];
    if (!hostPeerId) throw new Error("The room has no host.");
    this.hostPeerId = hostPeerId;
    this.createPeerConnection(hostPeerId, true);
    await new Promise<void>((resolve) => {
      this.firstConnectionResolver = resolve;
      window.setTimeout(() => {
        if (this.firstConnectionResolver && this.ws?.readyState === WebSocket.OPEN) {
          this.relayPeers.add(hostPeerId);
          this.callbacks.onPeerConnected(hostPeerId);
          this.firstConnectionResolver();
          this.firstConnectionResolver = null;
        }
      }, RELAY_FALLBACK_MS);
    });
  }

  send(peerId: string, message: ProtocolMessage) {
    const peer = this.peers.get(peerId);
    if (peer?.connected && !peer.destroyed) {
      peer.send(JSON.stringify(message));
      return;
    }
    if (this.relayPeers.has(peerId) && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "relay", targetPeerId: peerId, data: message }));
    }
  }

  sendToHost(message: ProtocolMessage) {
    if (this.hostPeerId) this.send(this.hostPeerId, message);
  }

  broadcast(message: ProtocolMessage) {
    this.connectedPeers.forEach((peerId) => this.send(peerId, message));
  }

  disconnect() {
    const peers = [...this.peers.values()];
    this.peers.clear();
    this.relayPeers.clear();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    peers.forEach((peer) => peer.destroy());
    this.hostPeerId = null;
    this.isHost = false;
    this.callbacks.onStatusChange("disconnected");
  }

  private connectSignaling() {
    return new Promise<void>((resolve, reject) => {
      this.callbacks.onStatusChange("connecting");
      const ws = new WebSocket(SIGNALING_URL);
      this.ws = ws;
      ws.onopen = () => {
        this.setupSignalingHandlers();
        resolve();
      };
      ws.onerror = () => {
        this.callbacks.onStatusChange("error");
        this.callbacks.onError("Unable to reach the multiplayer signaling server.");
        reject(new Error("Signaling connection failed."));
      };
      ws.onclose = () => {
        if (this.ws === ws) this.callbacks.onStatusChange("disconnected");
      };
    });
  }

  private waitForRoomResponse(
    request: Record<string, unknown>,
    successType: string,
    operation: string,
  ) {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out ${operation}.`));
      }, CONNECTION_TIMEOUT_MS);
      const handler = (event: MessageEvent) => {
        let message: Record<string, unknown>;
        try {
          const decoded = JSON.parse(String(event.data));
          if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return;
          message = decoded as Record<string, unknown>;
        } catch {
          return;
        }
        if (message.type !== successType && message.type !== "error") return;
        cleanup();
        if (message.type === "error") reject(new Error(String(message.message)));
        else resolve(message);
      };
      const cleanup = () => {
        window.clearTimeout(timer);
        this.ws?.removeEventListener("message", handler);
      };
      this.ws?.addEventListener("message", handler);
      this.ws?.send(JSON.stringify(request));
    });
  }

  private setupSignalingHandlers() {
    if (!this.ws) return;
    this.ws.onmessage = (event) => {
      let message: Record<string, unknown>;
      try {
        const decoded = JSON.parse(String(event.data));
        if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return;
        message = decoded as Record<string, unknown>;
      } catch {
        this.callbacks.onError("Received an invalid signaling message.");
        return;
      }
      if (message.type === "peer_joined" && this.isHost) {
        const peerId = String(message.peerId);
        window.setTimeout(() => {
          const peer = this.peers.get(peerId);
          if ((!peer || !peer.connected) && this.ws?.readyState === WebSocket.OPEN) {
            this.relayPeers.add(peerId);
            this.callbacks.onPeerConnected(peerId);
          }
        }, RELAY_FALLBACK_MS);
      } else if (message.type === "peer_left") {
        this.removePeer(String(message.peerId));
      } else if (message.type === "signal") {
        this.handleSignal(String(message.fromPeerId), message.signalData);
      } else if (message.type === "relay" || message.type === "broadcast") {
        this.deliverMessage(String(message.fromPeerId), message.data);
      }
    };
  }

  private createPeerConnection(remotePeerId: string, initiator: boolean) {
    const peer = new Peer({
      initiator,
      trickle: true,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          {
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          {
            urls: "turn:openrelay.metered.ca:443?transport=tcp",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
        ],
      },
    });
    peer.on("signal", (signalData) => {
      this.ws?.send(JSON.stringify({
        type: "signal",
        targetPeerId: remotePeerId,
        fromPeerId: this.peerId,
        signalData,
      }));
    });
    peer.on("connect", () => {
      const wasRelay = this.relayPeers.delete(remotePeerId);
      if (!wasRelay) this.callbacks.onPeerConnected(remotePeerId);
      this.firstConnectionResolver?.();
      this.firstConnectionResolver = null;
    });
    peer.on("data", (data) => {
      try {
        const serialized = typeof data === "string" ? data : new TextDecoder().decode(data);
        this.deliverMessage(remotePeerId, JSON.parse(serialized));
      } catch {
        this.callbacks.onInvalidMessage?.(remotePeerId);
      }
    });
    peer.on("close", () => this.fallbackToRelay(remotePeerId));
    peer.on("error", () => this.fallbackToRelay(remotePeerId));
    this.peers.set(remotePeerId, peer);
  }

  private deliverMessage(peerId: string, value: unknown) {
    const message = normalizeProtocolMessage(value);
    if (!message) {
      this.callbacks.onInvalidMessage?.(peerId);
      return;
    }
    this.callbacks.onMessage(peerId, message);
  }

  private handleSignal(remotePeerId: string, signalData: unknown) {
    if (!this.isHost && this.hostPeerId && remotePeerId !== this.hostPeerId) return;
    if (!this.peers.has(remotePeerId)) this.createPeerConnection(remotePeerId, false);
    this.peers.get(remotePeerId)?.signal(signalData as never);
  }

  private fallbackToRelay(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    this.peers.delete(peerId);
    if (peer && !peer.destroyed) peer.destroy();
    if (this.ws?.readyState === WebSocket.OPEN) {
      const wasConnected = this.relayPeers.has(peerId);
      this.relayPeers.add(peerId);
      if (!wasConnected) this.callbacks.onPeerConnected(peerId);
      this.firstConnectionResolver?.();
      this.firstConnectionResolver = null;
      return;
    }
    this.relayPeers.delete(peerId);
    this.callbacks.onPeerDisconnected(peerId, "connection-lost");
  }

  private removePeer(peerId: string) {
    const peer = this.peers.get(peerId);
    const existed = Boolean(peer) || this.relayPeers.has(peerId);
    this.peers.delete(peerId);
    this.relayPeers.delete(peerId);
    if (peer && !peer.destroyed) peer.destroy();
    if (existed) this.callbacks.onPeerDisconnected(peerId, "peer-left");
  }
}
