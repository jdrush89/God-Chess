import { useEffect, useState } from "react";
import { Check, LoaderCircle, Send, Users } from "lucide-react";
import type { SocialProfile } from "../account/social";

export function FriendInviteControl({
  friends,
  pendingPublicIds = [],
  onInvite,
}: {
  friends: SocialProfile[];
  pendingPublicIds?: string[];
  onInvite: (publicId: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const pending = new Set(pendingPublicIds);

  useEffect(() => {
    if (selected && !friends.some((friend) => friend.publicId === selected)) {
      setSelected("");
    }
  }, [friends, selected]);

  if (!friends.length) {
    return (
      <div className="friend-invite-control empty">
        <Users size={17} />
        <span>Add friends from your account menu to invite them directly.</span>
      </div>
    );
  }

  return (
    <div className="friend-invite-control">
      <label>
        Invite a friend
        <select value={selected} onChange={(event) => {
          setSelected(event.target.value);
          setFeedback("");
          setError("");
        }}>
          <option value="">Choose a friend</option>
          {friends.map((friend) => (
            <option
              value={friend.publicId}
              disabled={pending.has(friend.publicId)}
              key={friend.publicId}
            >
              {friend.displayName} · {friend.publicId}
              {pending.has(friend.publicId) ? " · invited" : ""}
            </option>
          ))}
        </select>
      </label>
      <button
        className="secondary-button compact-button"
        disabled={!selected || pending.has(selected) || working}
        onClick={() => {
          setWorking(true);
          setFeedback("");
          setError("");
          void onInvite(selected)
            .then(() => {
              setFeedback("Invitation sent.");
              setSelected("");
            })
            .catch((nextError) => {
              console.error("Unable to send the game invitation.", nextError);
              setError(
                nextError instanceof Error
                  ? nextError.message
                  : "Unable to send the invitation.",
              );
            })
            .finally(() => setWorking(false));
        }}
      >
        {working
          ? <LoaderCircle className="spin" size={15} />
          : feedback
            ? <Check size={15} />
            : <Send size={15} />}
        Invite
      </button>
      {feedback && <span className="friend-invite-feedback">{feedback}</span>}
      {error && <span className="friend-invite-error" role="alert">{error}</span>}
    </div>
  );
}
