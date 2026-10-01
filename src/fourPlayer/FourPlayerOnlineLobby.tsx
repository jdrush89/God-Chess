import {
  Bot,
  Check,
  Copy,
  Crown,
  Shield,
  Swords,
  UserRound,
  Users,
  Wifi,
} from "lucide-react";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerConfig,
  type Seat,
  type TeamId,
} from "../game/fourPlayerTypes";
import type { FourPlayerOnlineState } from "../multiplayer/useFourPlayerOnlineGame";
import type { FourPlayerHostRoomSnapshot } from "../multiplayer/types";
import {
  FOUR_PLAYER_PALETTES,
  FOUR_PLAYER_SEAT_LABELS,
} from "./setupConfig";

const startErrors = (state: FourPlayerOnlineState) => {
  const snapshot = state.snapshot;
  if (!snapshot) return ["Waiting for the room state."];
  const connected = snapshot.participants.filter((participant) =>
    participant.connected
  );
  const errors: string[] = [];
  if (connected.length < 2) errors.push("At least two Humans must be connected.");
  if (connected.some((participant) => !participant.seat)) {
    errors.push("Assign every connected Human to a seat.");
  }
  if (connected.some((participant) => !participant.ready)) {
    errors.push("Every connected Human must be ready.");
  }
  if (!snapshot.participants.find((participant) =>
    participant.host
  )?.seat) {
    errors.push("The host must own one seat.");
  }
  return errors;
};

export function FourPlayerOnlineLobby({
  online,
  onReady,
  onAssignSeat,
  onUpdateConfig,
  onStart,
  onLeave,
}: {
  online: FourPlayerOnlineState;
  onReady: (ready: boolean) => void;
  onAssignSeat: (participantId: string, seat?: Seat) => void;
  onUpdateConfig: (config: FourPlayerConfig) => void;
  onStart: () => void;
  onLeave: () => void;
}) {
  const snapshot = online.snapshot;
  if (!snapshot) {
    return (
      <div className="online-lobby four-online-lobby loading">
        <Wifi size={24} />
        <h3>Synchronizing the room</h3>
        <p>{online.error ?? "Waiting for the host lobby state..."}</p>
        <button className="text-button leave-room-button" onClick={onLeave}>
          Leave room
        </button>
      </div>
    );
  }
  const isHost = online.role === "host";
  const local = snapshot.participants.find((participant) => participant.local);
  const hostParticipants = isHost
    ? (snapshot as FourPlayerHostRoomSnapshot).participants
    : [];
  const errors = startErrors(online);

  const updateConfig = (update: (draft: FourPlayerConfig) => void) => {
    const next = structuredClone(snapshot.config);
    update(next);
    onUpdateConfig(next);
  };

  const setTeam = (seat: Seat, team: TeamId) => {
    updateConfig((next) => {
      next.teams ??= {
        north: "team-a",
        east: "team-b",
        south: "team-a",
        west: "team-b",
      };
      const previous = next.teams[seat];
      if (previous === team) return;
      const swap = FOUR_PLAYER_SEATS.find((candidate) =>
        candidate !== seat && next.teams?.[candidate] === team
      );
      next.teams[seat] = team;
      if (swap) next.teams[swap] = previous;
    });
  };

  return (
    <div className="four-online-lobby">
      <header className="four-online-room-header">
        <div>
          <Wifi size={22} />
          <span>FOUR-PLAYER ROOM</span>
        </div>
        <button
          className="room-code"
          onClick={() => navigator.clipboard.writeText(snapshot.roomCode)}
          title="Copy room code"
        >
          {snapshot.roomCode}<Copy size={15} />
        </button>
      </header>

      <div className="four-online-participants">
        {snapshot.participants.map((participant, index) => (
          <article
            className={`${participant.connected ? "" : "disconnected"} ${participant.ready ? "ready" : ""}`}
            key={`${participant.host ? "host" : "guest"}-${participant.seat ?? "unassigned"}-${index}`}
          >
            <UserRound size={17} />
            <div>
              <strong>{participant.name}</strong>
              <small>
                {participant.host ? "Host" : "Guest"}
                {participant.seat
                  ? ` · ${FOUR_PLAYER_SEAT_LABELS[participant.seat]}`
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

      {isHost && (
        <section className="four-online-options" aria-label="Online match options">
          <div className="four-setup-option">
            <span><Users size={18} /> Match</span>
            <div className="segmented-control">
              <button
                className={snapshot.config.mode === "ffa" ? "active" : ""}
                onClick={() => updateConfig((next) => {
                  next.mode = "ffa";
                  next.turnPolicy = "clockwise";
                })}
              >
                Free-for-all
              </button>
              <button
                className={snapshot.config.mode === "teams" ? "active" : ""}
                onClick={() => updateConfig((next) => {
                  next.mode = "teams";
                  next.teams ??= {
                    north: "team-a",
                    east: "team-b",
                    south: "team-a",
                    west: "team-b",
                  };
                })}
              >
                2v2 teams
              </button>
            </div>
          </div>
          <div className="four-setup-option">
            <span><Crown size={18} /> Victory</span>
            <div className="segmented-control">
              <button
                className={snapshot.config.victoryMode === "last-survivor" ? "active" : ""}
                onClick={() => updateConfig((next) => {
                  next.victoryMode = "last-survivor";
                })}
              >
                Last surviving
              </button>
              <button
                className={snapshot.config.victoryMode === "first-king-captured" ? "active" : ""}
                onClick={() => updateConfig((next) => {
                  next.victoryMode = "first-king-captured";
                })}
              >
                First King captured
              </button>
            </div>
          </div>
          <label className="four-setup-toggle">
            <span>
              <Shield size={18} />
              <strong>Piece takeover</strong>
              <small>The capturer controls an eliminated seat’s remaining pieces.</small>
            </span>
            <input
              type="checkbox"
              checked={snapshot.config.takeover}
              onChange={(event) => updateConfig((next) => {
                next.takeover = event.target.checked;
              })}
            />
          </label>
          {snapshot.config.mode === "teams" && (
            <label className="four-setup-toggle">
              <span>
                <Swords size={18} />
                <strong>Alternate teams</strong>
                <small>Avoid consecutive allied turns when the layout permits.</small>
              </span>
              <input
                type="checkbox"
                checked={snapshot.config.turnPolicy === "alternate-teams"}
                onChange={(event) => updateConfig((next) => {
                  next.turnPolicy = event.target.checked
                    ? "alternate-teams"
                    : "clockwise";
                })}
              />
            </label>
          )}
        </section>
      )}

      <section className="four-online-seats" aria-label="Online seat assignments">
        {FOUR_PLAYER_SEATS.map((seat) => {
          const assigned = snapshot.participants.find((participant) =>
            participant.seat === seat
          );
          const hostAssigned = hostParticipants.find((participant) =>
            participant.seat === seat
          );
          const seatConfig = snapshot.config.seats[seat];
          const difficulty = seatConfig.control.kind === "ai"
            ? seatConfig.control.difficulty ?? 5
            : 5;
          return (
            <article
              className={`four-online-seat seat-${seat}`}
              style={{ "--seat-color": FOUR_PLAYER_PALETTES[seat] } as React.CSSProperties}
              key={seat}
            >
              <header>
                <i />
                <div>
                  <strong>{FOUR_PLAYER_SEAT_LABELS[seat]}</strong>
                  <small>{seatConfig.orbAffinity} affinity</small>
                </div>
                {assigned ? <UserRound size={19} /> : <Bot size={19} />}
              </header>
              {isHost ? (
                <label>
                  Controller
                  <select
                    value={hostAssigned?.participantId ?? "ai"}
                    onChange={(event) => {
                      if (hostAssigned) {
                        onAssignSeat(hostAssigned.participantId, undefined);
                      }
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
                <p>{assigned ? assigned.name : `Divine AI · Level ${difficulty}`}</p>
              )}
              {!assigned && isHost && (
                <label className="four-ai-level">
                  <span>AI level <strong>{difficulty}</strong></span>
                  <input
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
              {snapshot.config.mode === "teams" && isHost && (
                <div className="four-seat-control">
                  <span>Team</span>
                  <div className="segmented-control">
                    {(["team-a", "team-b"] as const).map((team) => (
                      <button
                        className={snapshot.config.teams?.[seat] === team ? "active" : ""}
                        onClick={() => setTeam(seat, team)}
                        key={team}
                      >
                        {team === "team-a" ? "Team A" : "Team B"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </section>

      <footer className="four-online-footer">
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
              Begin four-player draft
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
