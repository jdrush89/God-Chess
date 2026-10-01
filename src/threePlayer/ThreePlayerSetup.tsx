import { Bot, Crown, Shield, UserRound, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createThreePlayerGame } from "../game/threePlayerEngine";
import {
  THREE_PLAYER_SEATS,
  type ThreePlayerConfig,
  type ThreePlayerSeat,
  type ThreePlayerSeatControl,
} from "../game/threePlayerTypes";
import { ThreePlayerBoard } from "./ThreePlayerBoard";
import {
  createLocalThreePlayerConfig,
  defaultThreePlayerName,
  localThreePlayerConfigErrors,
  THREE_PLAYER_PALETTES,
  THREE_PLAYER_SEAT_LABELS,
  THREE_PLAYER_VARIANTS,
} from "./setupConfig";

const controlMatchesDefault = (
  name: string,
  seat: ThreePlayerSeat,
  control: ThreePlayerSeatControl,
) => name === defaultThreePlayerName(seat, control);

export function ThreePlayerSetup({
  defaultPlayerName,
  onStart,
  onBack,
}: {
  defaultPlayerName?: string;
  onStart: (config: ThreePlayerConfig) => void;
  onBack: () => void;
}) {
  const [config, setConfig] = useState(() =>
    createLocalThreePlayerConfig(defaultPlayerName)
  );
  const errors = useMemo(() => localThreePlayerConfigErrors(config), [config]);

  const updateConfig = (update: (draft: ThreePlayerConfig) => void) => {
    setConfig((current) => {
      const next = structuredClone(current);
      update(next);
      return next;
    });
  };

  const updateControl = (seat: ThreePlayerSeat, kind: "human" | "ai") => {
    updateConfig((next) => {
      const previous = next.seats[seat].control;
      const replaceName = controlMatchesDefault(
        next.seats[seat].name,
        seat,
        previous,
      );
      const control: ThreePlayerSeatControl = kind === "human"
        ? { kind: "human", local: true }
        : { kind: "ai", difficulty: 5 };
      next.seats[seat].control = control;
      if (replaceName) next.seats[seat].name = defaultThreePlayerName(seat, control);
    });
  };

  return (
    <main className="three-setup-page">
      <header className="three-setup-header">
        <div>
          <p className="eyebrow">THREE-PLAYER LOCAL</p>
          <h1>Choose the battlefield.</h1>
          <p>
            Nine Gods will be drafted. Three remain unused while White, Red, and
            Black contest one topology-driven board.
          </p>
        </div>
        <button className="close-button" onClick={onBack} aria-label="Close three-player setup">
          <X size={20} />
        </button>
      </header>

      <section className="three-variant-grid" aria-label="Board variant">
        {THREE_PLAYER_VARIANTS.map((variant) => {
          const previewConfig = structuredClone(config);
          previewConfig.boardVariant = variant.id;
          const preview = createThreePlayerGame(previewConfig);
          return (
            <button
              className={`three-variant-card ${config.boardVariant === variant.id ? "active" : ""}`}
              aria-pressed={config.boardVariant === variant.id}
              onClick={() => updateConfig((next) => {
                next.boardVariant = variant.id;
              })}
              key={variant.id}
            >
              <span className="three-variant-preview">
                <ThreePlayerBoard state={preview} preview />
              </span>
              <strong>{variant.name}</strong>
              <small>{variant.description}</small>
            </button>
          );
        })}
      </section>

      <section className="three-setup-options" aria-label="Three-player match options">
        <div className="three-setup-option">
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
              className={config.victoryMode === "first-checkmate" ? "active" : ""}
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
            <small>
              A checkmating seat controls an eliminated army’s remaining pieces.
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
      </section>

      <section className="three-seat-setup-grid" aria-label="Seat configuration">
        {THREE_PLAYER_SEATS.map((seat) => {
          const seatConfig = config.seats[seat];
          const isAi = seatConfig.control.kind === "ai";
          const difficulty = seatConfig.control.kind === "ai"
            ? seatConfig.control.difficulty ?? 5
            : 5;
          return (
            <article
              className={`three-seat-setup-card seat-${seat}`}
              style={{ "--seat-color": THREE_PLAYER_PALETTES[seat] } as React.CSSProperties}
              key={seat}
            >
              <header>
                <i />
                <div>
                  <span>{THREE_PLAYER_SEAT_LABELS[seat]}</span>
                  <small>{seat === "red" ? "Dynamic affinity" : `${seat === "white" ? "Light" : "Dark"} affinity`}</small>
                </div>
                {isAi ? <Bot size={20} /> : <UserRound size={20} />}
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
              <div className="three-seat-control">
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
                <label className="three-ai-level">
                  <span>AI difficulty <strong>{difficulty}</strong></span>
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

      <footer className="three-setup-footer">
        <div role="alert">
          {errors.length
            ? errors.map((error) => <p key={error}>{error}</p>)
            : <p className="valid">Setup ready. At least one local Human can take the board.</p>}
        </div>
        <button
          className="primary-button"
          disabled={errors.length > 0}
          onClick={() => onStart(structuredClone(config))}
        >
          Begin three-player draft
        </button>
      </footer>
    </main>
  );
}
