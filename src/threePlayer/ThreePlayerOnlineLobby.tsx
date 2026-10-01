import {
  Bot,
  Check,
  Copy,
  Crown,
  Shield,
  UserRound,
  Wifi,
} from "lucide-react";
import {
  THREE_PLAYER_SEATS,
  type ThreePlayerConfig,
  type ThreePlayerSeat,
} from "../game/threePlayerTypes";
import type {
  ThreePlayerHostParticipant,
  ThreePlayerParticipant,
} from "../multiplayer/types";
import type { ThreePlayerOnlineState } from "../multiplayer/useThreePlayerOnlineGame";
import {
  THREE_PLAYER_PALETTES,
  THREE_PLAYER_SEAT_LABELS,
  THREE_PLAYER_VARIANTS,
} from "./setupConfig";

const isHostParticipant = (
  participant: ThreePlayerParticipant,
): participant is ThreePlayerHostParticipant =>
  "participantId" in participant &&
  typeof participant.participantId === "string";

const startErrors = (state: ThreePlayerOnlineState) => {
  const snapshot = state.snapshot;
  if (!snapshot) return ["Waiting for the room state."];
  const connected = snapshot.participants.filter((participant) =>
    participant.connected
  );
  const errors: string[] = [];
  if (connected.length < 2) errors.push("At least two Humans must be connected.");
  if (connected.length > 3) errors.push("At most three Humans may be connected.");
  if (connected.some((participant) => !participant.seat)) {
    errors.push("Assign every connected Human to a seat.");
  }
  if (connected.some((participant) => !participant.ready)) {
    errors.push("Every connected Human must be ready.");
  }
  if (!snapshot.participants.find((participant) => participant.host)?.seat) {
    errors.push("The host must own one seat.");
  }
  return errors;
};

export function ThreePlayerOnlineLobby({
  online,
  onReady,
  onAssignSeat,
  onUpdateConfig,
  onStart,
  onLeave,
}: {
  online: ThreePlayerOnlineState;
  onReady: (ready: boolean) => void;
  onAssignSeat: (
    participantId: string,
    seat?: ThreePlayerSeat,
  ) => void;
  onUpdateConfig: (config: ThreePlayerConfig) => void;
  onStart: () => void;
  onLeave: () => void;
}) {
  const snapshot = online.snapshot;
  if (!snapshot) {
    return (
      <div className="online-lobby three-online-lobby loading">
        <Wifi size={24} />
        <h3>Synchronizing the room</h3>
        <p>{online.error ?? "Waiting for the host lobby state..."}</p>
        <button className="text-button leave-room-button" onClick={onLeave}>
          Leave room
        </button>
      </div>
    );
  }
  const local = snapshot.participants.find((participant) => participant.local);
  const isHost = online.role === "host";
  const hostParticipants = snapshot.participants.filter(
    isHostParticipant,
  ) as ThreePlayerHostParticipant[];
  const errors = startErrors(online);

  const updateConfig = (update: (draft: ThreePlayerConfig) => void) => {
    const next = structuredClone(snapshot.config);
    update(next);
    onUpdateConfig(next);
  };

  const assignedParticipantId = (seat: ThreePlayerSeat) => {
    const participant = snapshot.participants.find((candidate) =>
      candidate.seat === seat
    );
    return participant && isHostParticipant(participant)
      ? participant.participantId
      : undefined;
  };

  return (
    <div className="three-online-lobby">
      <header className="three-online-room-header">
        <div>
          <Wifi size={22} />
          <span>THREE-PLAYER ROOM</span>
        </div>
        <button
          className="room-code"
          onClick={() => navigator.clipboard.writeText(snapshot.roomCode)}
          title="Copy room code"
        >
          {snapshot.roomCode}<Copy size={15} />
        </button>
      </header>

      <div className="three-online-participants">
        {snapshot.participants.map((participant, index) => (
          <article
            className={`${participant.connected ? "" : "disconnected"} ${participant.ready ? "ready" : ""}`}
            key={`${participant.name}-${participant.seat ?? index}`}
          >
            <UserRound size={17} />
            <div>
              <strong>{participant.name}{participant.local ? " (You)" : ""}</strong>
              <small>
                {participant.host ? "Host" : "Guest"}
                {participant.seat
                  ? ` · ${THREE_PLAYER_SEAT_LABELS[participant.seat]}`
                  : " · Unassigned"}
              </small>
            </div>
            <span>
              {participant.connected
                ? participant.ready ? <><Check size={13} /> Ready</> : "Not ready"
                : "Reserved"}
            </span>
          </article>
        ))}
      </div>

      <section className="three-online-options" aria-label="Online match options">
        <div className="three-online-variants">
          <span>Battlefield</span>
          <div>
            {THREE_PLAYER_VARIANTS.map((variant) => (
              <button
                className={snapshot.config.boardVariant === variant.id
                  ? "active"
                  : ""}
                disabled={!isHost}
                title={variant.description}
                onClick={() => updateConfig((next) => {
                  next.boardVariant = variant.id;
                })}
                key={variant.id}
              >
                {variant.name}
              </button>
            ))}
          </div>
        </div>
        <div className="three-setup-option">
          <span><Crown size={18} /> Victory</span>
          <div className="segmented-control">
            <button
              className={snapshot.config.victoryMode === "last-survivor"
                ? "active"
                : ""}
              disabled={!isHost}
              onClick={() => updateConfig((next) => {
                next.victoryMode = "last-survivor";
              })}
            >
              Last surviving
            </button>
            <button
              className={snapshot.config.victoryMode === "first-checkmate"
                ? "active"
                : ""}
              disabled={!isHost}
              onClick={() => updateConfig((next) => {
                next.victoryMode = "first-checkmate";
              })}
            >
              First King captured
            </button>
          </div>
        </div>
        <label className="three-setup-toggle">
          <span>
            <Shield size={18} />
            <strong>Piece takeover</strong>
            <small>Control a checkmated army's surviving pieces.</small>
          </span>
          <input
            type="checkbox"
            disabled={!isHost}
            checked={snapshot.config.takeover}
            onChange={(event) => updateConfig((next) => {
              next.takeover = event.target.checked;
            })}
          />
        </label>
      </section>

      <section className="three-online-seats" aria-label="Online seat assignments">
        {THREE_PLAYER_SEATS.map((seat) => {
          const assigned = snapshot.participants.find((participant) =>
            participant.seat === seat
          );
          const seatConfig = snapshot.config.seats[seat];
          const difficulty = seatConfig.control.kind === "ai"
            ? seatConfig.control.difficulty ?? 5
            : 5;
          return (
            <article
              className={`three-online-seat seat-${seat}`}
              style={{
                "--seat-color": THREE_PLAYER_PALETTES[seat],
              } as React.CSSProperties}
              key={seat}
            >
              <header>
                <i />
                <div>
                  <strong>{THREE_PLAYER_SEAT_LABELS[seat]}</strong>
                  <small>
                    {seat === "red"
                      ? "Dynamic affinity"
                      : `${seat === "white" ? "Light" : "Dark"} affinity`}
                  </small>
                </div>
                {assigned ? <UserRound size={19} /> : <Bot size={19} />}
              </header>
              {isHost ? (
                <label>
                  Controller
                  <select
                    value={assignedParticipantId(seat) ?? "ai"}
                    onChange={(event) => {
                      const assignedId = assignedParticipantId(seat);
                      if (assignedId) onAssignSeat(assignedId, undefined);
                      if (event.target.value !== "ai") {
                        onAssignSeat(event.target.value, seat);
                      }
                    }}
                  >
                    <option value="ai">Divine AI</option>
                    {hostParticipants
                      .filter((participant) => participant.connected)
                      .map((participant) => (
                        <option
                          value={participant.participantId}
                          key={participant.participantId}
                        >
                          {participant.name}{participant.host ? " (Host)" : ""}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <p>
                  {assigned
                    ? assigned.name
                    : `Divine AI · Level ${difficulty}`}
                </p>
              )}
              {!assigned && isHost && (
                <label className="three-ai-level">
                  <span>AI level <strong>{difficulty}</strong></span>
                  <input
                    aria-label={`${THREE_PLAYER_SEAT_LABELS[seat]} AI difficulty`}
                    type="range"
                    min="1"
                    max="10"
                    value={difficulty}
                    onChange={(event) => updateConfig((next) => {
                      next.seats[seat].control = {
                        kind: "ai",
                        difficulty: Number(event.target.value),
                      };
                    })}
                  />
                </label>
              )}
            </article>
          );
        })}
      </section>

      <footer className="three-online-footer">
        <div role="alert">
          {online.error
            ? <p>{online.error}</p>
            : errors.length
              ? errors.map((error) => <p key={error}>{error}</p>)
              : <p className="valid">All participants are assigned and ready.</p>}
        </div>
        <div>
          <button
            className={local?.ready ? "secondary-button" : "primary-button"}
            disabled={!local?.seat}
            onClick={() => onReady(!local?.ready)}
          >
            {local?.ready ? "Not ready" : "Ready"}
          </button>
          {isHost && (
            <button
              className="primary-button"
              disabled={errors.length > 0}
              onClick={onStart}
            >
              Begin three-player draft
            </button>
          )}
          <button className="text-button leave-room-button" onClick={onLeave}>
            Leave room
          </button>
        </div>
      </footer>
    </div>
  );
}
