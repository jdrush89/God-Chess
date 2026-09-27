declare module "simple-peer-light" {
  interface Options {
    initiator?: boolean;
    trickle?: boolean;
    config?: RTCConfiguration;
  }

  interface SignalData {
    type?: string;
    sdp?: string;
    candidate?: RTCIceCandidateInit;
  }

  class Peer {
    constructor(options?: Options);
    signal(data: SignalData): void;
    send(data: string | Uint8Array): void;
    destroy(): void;
    destroyed: boolean;
    connected: boolean;
    on(event: "signal", callback: (data: SignalData) => void): void;
    on(event: "connect", callback: () => void): void;
    on(event: "data", callback: (data: string | Uint8Array) => void): void;
    on(event: "close", callback: () => void): void;
    on(event: "error", callback: (error: Error) => void): void;
  }

  export = Peer;
}
