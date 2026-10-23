import {
  LoaderCircle,
  Shield,
  Swords,
  Trophy,
  UserRound,
  Wifi,
} from "lucide-react";
import { AccountPortrait } from "../account/AccountPortrait";
import type { RankedQueueState } from "./types";
import { roundedRankedRating } from "./types";

export function RankedQueuePanel({
  state,
  signedIn,
  onJoin,
  onLeave,
  onReset,
}: {
  state: RankedQueueState;
  signedIn: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onReset: () => void;
}) {
  const match = state.match;
  const localWon = Boolean(
    match?.winnerColor && match.winnerColor === match.color,
  );
  return (
    <div className="ranked-panel">
      <header>
        <span><Trophy size={24} /></span>
        <div>
          <p className="eyebrow">RANKED · 1V1</p>
          <h1>Divine rating</h1>
          <p>Classic one-on-one God Chess. Undo is disabled.</p>
        </div>
        {state.rating && (
          <strong className="ranked-rating-card">
            {roundedRankedRating(state.rating)}
            <small>Glicko-2 rating</small>
          </strong>
        )}
      </header>

      {state.phase === "idle" && (
        <section className="ranked-idle">
          <Swords size={38} />
          <h2>Enter the ranked queue</h2>
          <p>
            You will be matched automatically with one other player. No room
            code is needed.
          </p>
          <button
            className="primary-button"
            disabled={!signedIn || state.loading}
            onClick={onJoin}
          >
            {state.loading
              ? <><LoaderCircle className="spin" size={17} /> Joining</>
              : "Start ranked game"}
          </button>
          {!signedIn && (
            <small>Sign in with a player account to play ranked.</small>
          )}
        </section>
      )}

      {state.phase === "queued" && (
        <section className="ranked-waiting" role="status">
          <LoaderCircle className="spin" size={34} />
          <h2>Waiting for other players.</h2>
          <p>The match begins automatically when another player is ready.</p>
          <button
            className="secondary-button"
            disabled={state.loading}
            onClick={onLeave}
          >
            Leave queue
          </button>
        </section>
      )}

      {(state.phase === "matched" || state.phase === "playing") && match && (
        <section className="ranked-match-found" role="status">
          <Wifi size={32} />
          <h2>{state.phase === "matched" ? "Match found" : "Ranked match connected"}</h2>
          <p>
            {state.phase === "matched"
              ? "Connecting the two queued players..."
              : "Preparing the classic board and divine draft."}
          </p>
          <div className="ranked-roster">
            {match.participants.map((participant) => (
              <article
                className={participant.connected ? "" : "disconnected"}
                key={participant.publicId}
              >
                <AccountPortrait portraitId={participant.portraitId} alt="" />
                <div>
                  <strong>{participant.displayName}</strong>
                  <small>
                    {participant.color === "white" ? "White" : "Black"}
                    {" · Rating "}{Math.round(participant.rating)}
                  </small>
                </div>
                {participant.connected
                  ? <UserRound size={17} />
                  : <LoaderCircle className="spin" size={17} />}
              </article>
            ))}
          </div>
          <small>
            A disconnected player has 2 minutes to return before they
            forfeit.
          </small>
          <button
            className="secondary-button"
            disabled={state.loading}
            onClick={onLeave}
          >
            Forfeit match
          </button>
        </section>
      )}

      {(state.phase === "completed" || state.phase === "cancelled") && (
        <section className="ranked-complete" role="status">
          {state.phase === "cancelled"
            ? <Shield size={36} />
            : <Trophy size={36} />}
          <h2>
            {state.phase === "cancelled"
              ? "Ranked match cancelled"
              : match?.resultReason === "draw"
                ? "Ranked draw"
                : localWon ? "Ranked victory" : "Ranked defeat"}
          </h2>
          <p>
            {match?.resultReason === "disconnect" ||
                match?.resultReason === "forfeit"
              ? "The result was recorded after a disconnect or forfeit."
              : state.phase === "cancelled"
                ? "The match could not continue, so no rating changed."
                : "The result and Glicko-2 ratings have been recorded."}
          </p>
          {match?.rating && (
            <strong className="ranked-result-rating">
              {roundedRankedRating(match.rating)}
              {match.ratingChange !== undefined && (
                <small>
                  {match.ratingChange >= 0 ? "+" : ""}
                  {Math.round(match.ratingChange)} rating
                </small>
              )}
            </strong>
          )}
          <button className="primary-button" onClick={onReset}>
            Return to Online
          </button>
        </section>
      )}

      {state.error && (
        <p className="online-error" role="alert">{state.error}</p>
      )}
    </div>
  );
}
