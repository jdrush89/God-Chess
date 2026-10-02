import { Bot, Crown, Shield, Swords, UserRound, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerConfig,
  type Seat,
  type SeatControl,
  type TeamId,
} from "../game/fourPlayerTypes";
import {
  defaultFourPlayerName,
  FOUR_PLAYER_PALETTES,
  FOUR_PLAYER_SEAT_LABELS,
  createLocalFourPlayerConfig,
  localFourPlayerConfigErrors,
} from "./setupConfig";

const controlMatchesDefault = (
  name: string,
  seat: Seat,
  control: SeatControl,
) => name === defaultFourPlayerName(seat, control);

export function FourPlayerSetup({
  defaultPlayerName,
  onStart,
  onBack,
  embedded = false,
}: {
  defaultPlayerName?: string;
  onStart: (config: FourPlayerConfig) => void;
  onBack: () => void;
  embedded?: boolean;
}) {
  const [config, setConfig] = useState(() =>
    createLocalFourPlayerConfig(defaultPlayerName)
  );
  const errors = useMemo(() => localFourPlayerConfigErrors(config), [config]);

  const updateConfig = (update: (draft: FourPlayerConfig) => void) => {
    setConfig((current) => {
      const next = structuredClone(current);
      update(next);
      return next;
    });
  };

  const updateControl = (seat: Seat, kind: "human" | "ai") => {
    updateConfig((next) => {
      const previous = next.seats[seat].control;
      const shouldReplaceName = controlMatchesDefault(
        next.seats[seat].name,
        seat,
        previous,
      );
      const control: SeatControl = kind === "human"
        ? { kind: "human", local: true }
        : { kind: "ai", difficulty: 5 };
      next.seats[seat].control = control;
      if (shouldReplaceName) {
        next.seats[seat].name = defaultFourPlayerName(seat, control);
      }
    });
  };

  const setTeam = (seat: Seat, team: TeamId) => {
    updateConfig((next) => {
      next.teams ??= {
        north: "team-a",
        east: "team-b",
        south: "team-a",
        west: "team-b",
      };
      next.teams[seat] = team;
    });
  };

  return (
    <main className={`four-setup-page${embedded ? " embedded" : ""}`}>
      <header className="four-setup-header">
        <div>
          <p className="eyebrow">FOUR-PLAYER LOCAL</p>
          <h1>Gather four pantheons.</h1>
          <p>
            Share one device. North stays at the top, then play continues clockwise
            through east, south, and west.
          </p>
        </div>
        {!embedded && (
          <button className="close-button" onClick={onBack} aria-label="Close four-player setup">
            <X size={20} />
          </button>
        )}
      </header>

      <section className="four-setup-options" aria-label="Four-player match options">
        <div className="four-setup-option">
          <span><Users size={18} /> Match</span>
          <div className="segmented-control">
            <button
              className={config.mode === "ffa" ? "active" : ""}
              onClick={() => updateConfig((next) => {
                next.mode = "ffa";
                next.turnPolicy = "clockwise";
              })}
            >
              Free-for-all
            </button>
            <button
              className={config.mode === "teams" ? "active" : ""}
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
              className={config.victoryMode === "last-survivor" ? "active" : ""}
              onClick={() => updateConfig((next) => {
                next.victoryMode = "last-survivor";
              })}
            >
              Last surviving
            </button>
            <button
              className={config.victoryMode === "first-king-captured" ? "active" : ""}
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
            <small>
              The capturer controls an eliminated seat’s remaining pieces. Their Gods
              and upgrades do not transfer.
            </small>
          </span>
          <input
            type="checkbox"
            checked={config.takeover}
            onChange={(event) => updateConfig((next) => {
              next.takeover = event.target.checked;
            })}
          />
        </label>

        {config.mode === "teams" && (
          <label className="four-setup-toggle">
            <span>
              <Swords size={18} />
              <strong>Alternate teams</strong>
              <small>
                Reorders the round when adjacent teammates would otherwise act
                consecutively.
              </small>
            </span>
            <input
              type="checkbox"
              checked={config.turnPolicy === "alternate-teams"}
              onChange={(event) => updateConfig((next) => {
                next.turnPolicy = event.target.checked
                  ? "alternate-teams"
                  : "clockwise";
              })}
            />
          </label>
        )}
      </section>

      <section className="four-seat-setup-grid" aria-label="Seat configuration">
        {FOUR_PLAYER_SEATS.map((seat) => {
          const seatConfig = config.seats[seat];
          const isAi = seatConfig.control.kind === "ai";
          const aiDifficulty = seatConfig.control.kind === "ai"
            ? seatConfig.control.difficulty ?? 5
            : 5;
          return (
            <article
              className={`four-seat-setup-card seat-${seat}`}
              style={{ "--seat-color": FOUR_PLAYER_PALETTES[seat] } as React.CSSProperties}
              key={seat}
            >
              <header>
                <i />
                <div>
                  <span>{FOUR_PLAYER_SEAT_LABELS[seat]}</span>
                  <small>{seatConfig.orbAffinity} affinity</small>
                </div>
                {seatConfig.control.kind === "human"
                  ? <UserRound size={20} />
                  : <Bot size={20} />}
              </header>

              <label>
                Player name
                <input
                  maxLength={24}
                  value={seatConfig.name}
                  onChange={(event) => updateConfig((next) => {
                    next.seats[seat].name = event.target.value;
                  })}
                />
              </label>

              <div className="four-seat-control">
                <span>Controller</span>
                <div className="segmented-control">
                  <button
                    className={!isAi ? "active" : ""}
                    onClick={() => updateControl(seat, "human")}
                  >
                    Human
                  </button>
                  <button
                    className={isAi ? "active" : ""}
                    onClick={() => updateControl(seat, "ai")}
                  >
                    AI
                  </button>
                </div>
              </div>

              {isAi && (
                <label className="four-ai-level">
                  <span>AI level <strong>{aiDifficulty}</strong></span>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={aiDifficulty}
                    onChange={(event) => updateConfig((next) => {
                      next.seats[seat].control = {
                        kind: "ai",
                        difficulty: Number(event.target.value),
                      };
                    })}
                  />
                </label>
              )}

              {config.mode === "teams" && (
                <div className="four-seat-control">
                  <span>Team</span>
                  <div className="segmented-control">
                    {(["team-a", "team-b"] as const).map((team) => (
                      <button
                        className={config.teams?.[seat] === team ? "active" : ""}
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

      <footer className="four-setup-footer">
        <div role="alert">
          {errors.length > 0
            ? errors.map((error) => <p key={error}>{error}</p>)
            : <p className="valid">Setup ready. All twelve Gods will be drafted once.</p>}
        </div>
        <button
          className="primary-button"
          disabled={errors.length > 0}
          onClick={() => onStart(structuredClone(config))}
        >
          Begin four-player draft
        </button>
      </footer>
    </main>
  );
}
