import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CopyStatus = "idle" | "copied" | "failed";

export function RoomCodeCopyButton({ roomCode }: { roomCode: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setStatus("idle");
    return () => {
      if (resetTimer.current !== undefined) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, [roomCode]);

  const copyRoomCode = async () => {
    if (resetTimer.current !== undefined) {
      window.clearTimeout(resetTimer.current);
    }
    try {
      if (typeof navigator.clipboard?.writeText !== "function") {
        throw new Error("Clipboard unavailable.");
      }
      await navigator.clipboard.writeText(roomCode);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    resetTimer.current = window.setTimeout(() => setStatus("idle"), 2000);
  };

  const label = status === "copied"
    ? `Room code ${roomCode} copied`
    : status === "failed"
      ? `Unable to copy room code ${roomCode}`
      : `Copy room code ${roomCode}`;

  return (
    <button
      aria-label={label}
      className={`room-code ${status}`}
      onClick={() => void copyRoomCode()}
      title={status === "copied"
        ? "Room code copied"
        : status === "failed"
          ? "Unable to copy room code"
          : "Copy room code"}
    >
      {roomCode}
      {status === "copied"
        ? <Check size={15} aria-hidden="true" />
        : status === "failed"
          ? <X size={15} aria-hidden="true" />
          : <Copy size={15} aria-hidden="true" />}
    </button>
  );
}
