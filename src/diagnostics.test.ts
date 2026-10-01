// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDebugReport,
  diagnosticsSnapshot,
  DIAGNOSTIC_ENTRY_LIMIT,
  recordActionTransition,
  recordDiagnostic,
  redactDiagnostics,
  resetDiagnosticsForTests,
} from "./diagnostics";

beforeEach(() => {
  window.sessionStorage.clear();
  resetDiagnosticsForTests();
});

describe("diagnostics", () => {
  it("keeps a bounded, monotonic ring buffer in session storage", async () => {
    for (let index = 0; index < DIAGNOSTIC_ENTRY_LIMIT + 12; index += 1) {
      recordDiagnostic({
        category: "ui",
        event: "test",
        data: { index },
      });
    }
    const snapshot = diagnosticsSnapshot();
    expect(snapshot.entries).toHaveLength(DIAGNOSTIC_ENTRY_LIMIT);
    expect(snapshot.entries[0].sequence).toBe(13);
    expect(snapshot.entries.at(-1)?.sequence).toBe(DIAGNOSTIC_ENTRY_LIMIT + 12);

    vi.resetModules();
    const reloaded = await import("./diagnostics");
    expect(reloaded.diagnosticsSnapshot().entries).toHaveLength(DIAGNOSTIC_ENTRY_LIMIT);
  });

  it("records sanitized action and stable state transitions", () => {
    recordActionTransition({
      variant: "classic",
      mode: "online",
      source: "human",
      action: { type: "move", from: "a2", to: "a3", reconnectToken: "secret" },
      before: { phase: "play", activeColor: "white", turn: 1, board: { a2: "pawn" } },
      after: { phase: "play", activeColor: "black", turn: 2, board: { a3: "pawn" } },
    });
    const entry = diagnosticsSnapshot().entries[0];
    expect(entry.event).toBe("reduce");
    expect(JSON.stringify(entry)).not.toContain("secret");
    expect(entry.data).toMatchObject({ accepted: true });
  });

  it("recursively redacts credentials, identities, SDP, and secret-shaped values", () => {
    const redacted = redactDiagnostics({
      participantId: "participant-secret",
      reconnectToken: "reconnect-secret",
      authorization: "Bearer top-secret",
      displayName: "Real Person",
      playerName: "Another Person",
      nested: {
        roomCode: "ABCDE",
        harmless: "Bearer abc.def.ghi",
        candidate: "candidate:1 1 udp 1 127.0.0.1",
      },
    });
    const serialized = JSON.stringify(redacted);
    for (const secret of [
      "participant-secret",
      "reconnect-secret",
      "top-secret",
      "Real Person",
      "Another Person",
      "ABCDE",
      "127.0.0.1",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(buildDebugReport("My match froze")).toContain("My match froze");
  });
});
