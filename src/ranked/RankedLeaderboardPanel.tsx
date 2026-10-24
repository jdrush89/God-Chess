import {
  Crown,
  LoaderCircle,
  RotateCcw,
  Trophy,
} from "lucide-react";
import { AccountPortrait } from "../account/AccountPortrait";
import { roundedRankedRating } from "./types";
import { useRankedLeaderboard } from "./useRankedLeaderboard";

export function RankedLeaderboardPanel() {
  const [state, actions] = useRankedLeaderboard();

  return (
    <section className="ranked-leaderboard-panel">
      <header>
        <span><Crown size={28} /></span>
        <div>
          <p className="eyebrow">RANKED · TOP 100</p>
          <h1>Divine leaderboard</h1>
          <p>Players are ordered by their current Glicko-2 rating.</p>
        </div>
      </header>

      {state.loading ? (
        <div className="ranked-leaderboard-status" role="status">
          <LoaderCircle className="spin" size={32} />
          <strong>Loading leaderboard</strong>
        </div>
      ) : state.error ? (
        <div className="ranked-leaderboard-status" role="alert">
          <Trophy size={32} />
          <strong>Leaderboard unavailable</strong>
          <p>{state.error}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void actions.refresh()}
          >
            <RotateCcw size={15} />
            Try again
          </button>
        </div>
      ) : state.entries.length === 0 ? (
        <div className="ranked-leaderboard-status" role="status">
          <Trophy size={32} />
          <strong>No rated players yet</strong>
          <p>Complete a Ranked match to claim the first position.</p>
        </div>
      ) : (
        <div
          className="ranked-leaderboard"
          role="table"
          aria-label="Ranked leaderboard"
        >
          <div className="ranked-leaderboard-head" role="row">
            <span role="columnheader">Rank</span>
            <span role="columnheader">Player</span>
            <span role="columnheader">Rating</span>
            <span role="columnheader">Record</span>
          </div>
          {state.entries.map((entry, index) => (
            <article
              className={index < 3 ? `top-${index + 1}` : ""}
              role="row"
              key={entry.publicId}
            >
              <strong className="ranked-leaderboard-rank" role="cell">
                {index + 1}
              </strong>
              <div className="ranked-leaderboard-player" role="cell">
                <AccountPortrait
                  portraitId={entry.portraitId}
                  alt=""
                />
                <span>
                  <strong>{entry.displayName}</strong>
                  <small>{entry.publicId}</small>
                </span>
              </div>
              <div className="ranked-leaderboard-rating" role="cell">
                <strong>{roundedRankedRating(entry)}</strong>
                <small>RD {Math.round(entry.deviation)}</small>
              </div>
              <div className="ranked-leaderboard-record" role="cell">
                <strong>
                  {entry.wins}W · {entry.losses}L · {entry.draws}D
                </strong>
                <small>{entry.gamesPlayed} games</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
