import { useEffect, useState, type FormEvent } from "react";
import {
  Bell,
  Check,
  LoaderCircle,
  LogIn,
  LogOut,
  Search,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { ACHIEVEMENT_BY_ID } from "../achievements";
import type {
  FriendProfile,
  GameInvite,
  SocialContract,
  SocialProfile,
} from "./social";
import type { AccountProfile } from "./useAccount";

type AccountSection = "profile" | "friends";

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="friend-stat">
    <strong>{value}</strong>
    <span>{label}</span>
  </div>
);

function FriendProfileView({
  friend,
  onBack,
  onRemove,
}: {
  friend: FriendProfile;
  onBack: () => void;
  onRemove: () => Promise<void>;
}) {
  const achievements = friend.completedAchievementIds
    .map((id) => ACHIEVEMENT_BY_ID[id])
    .filter(Boolean);
  return (
    <div className="friend-profile">
      <button className="text-button" onClick={onBack}>Back to friends</button>
      <UserRound className="account-hero-icon" size={32} />
      <h2>{friend.displayName}</h2>
      <p className="account-public-id">{friend.publicId}</p>
      {friend.stats ? (
        <div className="friend-stats" aria-label={`${friend.displayName} statistics`}>
          <Stat label="Games" value={friend.stats.gamesPlayed} />
          <Stat label="Wins" value={friend.stats.gamesWon} />
          <Stat label="Captures" value={friend.stats.piecesCaptured} />
          <Stat label="Puzzles" value={friend.stats.totalPuzzlesCompleted} />
        </div>
      ) : (
        <p className="account-empty">No public game statistics yet.</p>
      )}
      <h3>Completed achievements</h3>
      {achievements.length ? (
        <div className="friend-achievements">
          {achievements.map((achievement) => (
            <article key={achievement.id}>
              <Check size={14} />
              <div>
                <strong>{achievement.title}</strong>
                <span>{achievement.description}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="account-empty">No completed achievements yet.</p>
      )}
      <button className="secondary-button account-danger" onClick={() => void onRemove()}>
        <UserMinus size={16} /> Remove friend
      </button>
    </div>
  );
}

function FriendsView({
  social,
  onAcceptInvite,
  run,
}: {
  social?: SocialContract;
  onAcceptInvite?: (invite: GameInvite) => Promise<void>;
  run: (action: () => Promise<string | void>) => Promise<void>;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<SocialProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<FriendProfile>();

  if (!social) {
    return <p className="account-empty">Friends are unavailable for this account.</p>;
  }
  if (selectedFriend) {
    return (
      <FriendProfileView
        friend={selectedFriend}
        onBack={() => setSelectedFriend(undefined)}
        onRemove={async () => {
          await run(async () => {
            await social.removeFriend(selectedFriend.publicId);
            setSelectedFriend(undefined);
            return "Friend removed.";
          });
        }}
      />
    );
  }

  const search = async (event: FormEvent) => {
    event.preventDefault();
    setSearching(true);
    try {
      setResults(await social.search(searchTerm));
    } finally {
      setSearching(false);
    }
  };
  const pendingIds = new Set([
    ...social.incomingRequests.map((request) => request.publicId),
    ...social.outgoingRequests.map((request) => request.publicId),
    ...social.friends.map((friend) => friend.publicId),
  ]);

  return (
    <div className="friends-view">
      {social.invites.length > 0 && (
        <section className="account-list-section">
          <h3><Bell size={16} /> Game invitations</h3>
          {social.invites.map((invite) => (
            <article className="account-list-row" key={invite.id}>
              <div>
                <strong>{invite.senderDisplayName}</strong>
                <span>
                  {invite.playerCount}-player room · {invite.roomCode}
                </span>
              </div>
              <div>
                <button
                  className="primary-button compact-button"
                  onClick={() => void run(async () => {
                    if (!onAcceptInvite) throw new Error("Joining invitations is unavailable.");
                    await onAcceptInvite(invite);
                  })}
                >
                  Join
                </button>
                <button
                  className="text-button"
                  onClick={() => void run(async () => {
                    await social.respondInvite(invite.id, "declined");
                    return "Invitation declined.";
                  })}
                >
                  Decline
                </button>
                <button
                  className="text-button"
                  onClick={() => void run(async () => {
                    await social.respondInvite(invite.id, "dismissed");
                    return "Invitation dismissed.";
                  })}
                >
                  Dismiss
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <form className="friend-search" onSubmit={search}>
        <label htmlFor="friend-search">Find by display name or public ID</label>
        <div>
          <input
            id="friend-search"
            value={searchTerm}
            maxLength={24}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Athena or gc-ab12cd34"
          />
          <button
            className="secondary-button friend-search-button"
            disabled={!searchTerm.trim() || searching}
          >
            {searching ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}
            Search
          </button>
        </div>
      </form>

      {results.length > 0 && (
        <section className="account-list-section">
          <h3>Search results</h3>
          {results.map((result) => (
            <article className="account-list-row" key={result.publicId}>
              <div>
                <strong>{result.displayName}</strong>
                <span>{result.publicId}</span>
              </div>
              <button
                className="secondary-button compact-button"
                disabled={pendingIds.has(result.publicId)}
                onClick={() => void run(async () => {
                  await social.sendFriendRequest(result.publicId);
                  return `Friend request sent to ${result.displayName}.`;
                })}
              >
                <UserPlus size={14} />
                {pendingIds.has(result.publicId) ? "Pending" : "Add"}
              </button>
            </article>
          ))}
        </section>
      )}

      {social.incomingRequests.length > 0 && (
        <section className="account-list-section">
          <h3>Incoming requests</h3>
          {social.incomingRequests.map((request) => (
            <article className="account-list-row" key={request.publicId}>
              <div>
                <strong>{request.displayName}</strong>
                <span>{request.publicId}</span>
              </div>
              <div>
                <button
                  className="primary-button compact-button"
                  onClick={() => void run(async () => {
                    await social.acceptFriendRequest(request.publicId);
                    return `${request.displayName} is now your friend.`;
                  })}
                >
                  Accept
                </button>
                <button
                  className="text-button"
                  onClick={() => void run(async () => {
                    await social.declineFriendRequest(request.publicId);
                    return "Friend request declined.";
                  })}
                >
                  Decline
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {social.outgoingRequests.length > 0 && (
        <section className="account-list-section">
          <h3>Sent requests</h3>
          {social.outgoingRequests.map((request) => (
            <article className="account-list-row" key={request.publicId}>
              <div>
                <strong>{request.displayName}</strong>
                <span>{request.publicId}</span>
              </div>
              <span className="account-pending">Pending</span>
            </article>
          ))}
        </section>
      )}

      <section className="account-list-section">
        <h3><Users size={16} /> Friends</h3>
        {social.loading ? (
          <p className="account-empty">Loading friends…</p>
        ) : social.friends.length ? (
          social.friends.map((friend) => (
            <button
              className="account-list-row friend-row"
              key={friend.publicId}
              onClick={() => setSelectedFriend(friend)}
            >
              <div>
                <strong>{friend.displayName}</strong>
                <span>{friend.publicId}</span>
              </div>
              <span>View profile</span>
            </button>
          ))
        ) : (
          <p className="account-empty">No accepted friends yet.</p>
        )}
      </section>
      {social.error && <p className="account-error" role="alert">{social.error}</p>}
    </div>
  );
}

export function AccountModal({
  account,
  configured,
  loading,
  working,
  serviceError,
  social,
  initialSection = "profile",
  onAcceptInvite,
  onClose,
  onSignIn,
  onSignUp,
  onSignOut,
  onUpdateDisplayName,
}: {
  account?: AccountProfile;
  configured: boolean;
  loading: boolean;
  working: boolean;
  serviceError?: string;
  social?: SocialContract;
  initialSection?: AccountSection;
  onAcceptInvite?: (invite: GameInvite) => Promise<void>;
  onClose: () => void;
  onSignIn: (email: string, password: string) => Promise<string>;
  onSignUp: (email: string, password: string, displayName: string) => Promise<string>;
  onSignOut: () => Promise<void>;
  onUpdateDisplayName: (displayName: string) => Promise<string>;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [section, setSection] = useState<AccountSection>(initialSection);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(account?.displayName ?? "");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setDisplayName(account?.displayName ?? "");
    setSection(initialSection);
    setFeedback("");
    setError("");
  }, [account?.userId, account?.displayName, initialSection]);

  const run = async (action: () => Promise<string | void>) => {
    setFeedback("");
    setError("");
    try {
      const message = await action();
      if (message) setFeedback(message);
    } catch (nextError) {
      console.error("God Chess account action failed.", nextError);
      setError(nextError instanceof Error ? nextError.message : "The account request failed.");
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(() => mode === "signin"
      ? onSignIn(email.trim(), password)
      : onSignUp(email.trim(), password, displayName.trim()));
  };

  return (
    <div className="modal-backdrop">
      <section className="account-modal">
        <button className="close-button" onClick={onClose} aria-label="Close account">
          <X size={20} />
        </button>
        <p className="eyebrow">PLAYER ACCOUNT</p>
        {!configured ? (
          <div className="account-unavailable">
            <UserRound size={32} />
            <h2>Account setup required</h2>
            <p>
              Supabase is not configured for this deployment yet. Local games remain available on this device.
            </p>
          </div>
        ) : loading ? (
          <div className="account-loading">
            <LoaderCircle className="spin" size={28} />
            <span>Restoring account</span>
          </div>
        ) : account ? (
          <>
            <div className="account-tabs">
              <button className={section === "profile" ? "active" : ""} onClick={() => setSection("profile")}>
                Profile
              </button>
              <button className={section === "friends" ? "active" : ""} onClick={() => setSection("friends")}>
                Friends{social?.unreadCount ? ` (${social.unreadCount})` : ""}
              </button>
            </div>
            {section === "friends" ? (
              <FriendsView social={social} onAcceptInvite={onAcceptInvite} run={run} />
            ) : (
              <>
                <UserRound className="account-hero-icon" size={32} />
                <h2>{account.needsDisplayName ? "Choose a display name" : account.displayName}</h2>
                <p className="account-public-id">{account.publicId || "Public ID pending"}</p>
                <p className="account-email">{account.email}</p>
                <form className="account-form" onSubmit={(event) => {
                  event.preventDefault();
                  void run(() => onUpdateDisplayName(displayName));
                }}>
                  <label>
                    {account.needsDisplayName ? "Display name" : "Saved display name"}
                    <input
                      maxLength={24}
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      required
                    />
                  </label>
                  <button className="primary-button" disabled={working || !displayName.trim()}>
                    {working ? <LoaderCircle className="spin" size={17} /> : <UserRound size={17} />}
                    {account.needsDisplayName ? "Save display name" : "Save name"}
                  </button>
                </form>
                <button className="secondary-button account-signout" disabled={working} onClick={() => void run(onSignOut)}>
                  <LogOut size={16} /> Sign out
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <div className="account-tabs">
              <button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>
                Sign in
              </button>
              <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
                Create account
              </button>
            </div>
            <form className="account-form" onSubmit={submit}>
              {mode === "signup" && (
                <label>
                  Display name
                  <input
                    maxLength={24}
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    autoComplete="nickname"
                    required
                  />
                </label>
              )}
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                />
              </label>
              <button
                className="primary-button"
                disabled={working || !email.trim() || password.length < 6 || (mode === "signup" && !displayName.trim())}
              >
                {working
                  ? <LoaderCircle className="spin" size={17} />
                  : mode === "signin"
                    ? <LogIn size={17} />
                    : <UserPlus size={17} />}
                {mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>
          </>
        )}
        {feedback && <p className="account-feedback" role="status">{feedback}</p>}
        {(error || serviceError) && <p className="account-error" role="alert">{error || serviceError}</p>}
      </section>
    </div>
  );
}
