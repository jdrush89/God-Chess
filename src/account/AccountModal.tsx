import { useEffect, useState, type FormEvent } from "react";
import {
  Bell,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  Search,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type {
  FriendProfile,
  GameInvite,
  SocialContract,
  SocialProfile,
} from "./social";
import type { AccountProfile } from "./useAccount";
import {
  AccountPortrait,
  AccountPortraitPicker,
} from "./AccountPortrait";
import {
  DEFAULT_ACCOUNT_PORTRAIT_ID,
  type AccountPortraitId,
} from "./portraits";

type AccountSection = "profile" | "friends";
type AuthMode = "signin" | "signup" | "forgot";

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="account-field">
      <label htmlFor={id}>{label}</label>
      <div className="account-password-field">
        <input
          id={id}
          type={visible ? "text" : "password"}
          minLength={6}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </div>
  );
}

function SocialIdentity({
  profile,
}: {
  profile: SocialProfile;
}) {
  return (
    <div className="account-list-identity">
      <AccountPortrait portraitId={profile.portraitId} alt="" />
      <div>
        <strong>{profile.displayName}</strong>
        <span>{profile.publicId}</span>
      </div>
    </div>
  );
}

function FriendsView({
  social,
  onAcceptInvite,
  onViewFriendProfile,
  run,
}: {
  social?: SocialContract;
  onAcceptInvite?: (invite: GameInvite) => Promise<void>;
  onViewFriendProfile?: (friend: FriendProfile) => void;
  run: (action: () => Promise<string | void>) => Promise<void>;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<SocialProfile[]>([]);
  const [searching, setSearching] = useState(false);

  if (!social) {
    return <p className="account-empty">Friends are unavailable for this account.</p>;
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
              <SocialIdentity profile={result} />
              <button
                className="secondary-button compact-button friend-add-button"
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
              <SocialIdentity profile={request} />
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
              <SocialIdentity profile={request} />
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
              onClick={() => onViewFriendProfile?.(friend)}
            >
              <SocialIdentity profile={friend} />
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
  onViewFriendProfile,
  onClose,
  onSignIn,
  onSignUp,
  onSignOut,
  onRequestPasswordReset,
  onUpdatePassword,
  passwordRecovery = false,
  onUpdateDisplayName,
  onUpdatePortrait,
}: {
  account?: AccountProfile;
  configured: boolean;
  loading: boolean;
  working: boolean;
  serviceError?: string;
  social?: SocialContract;
  initialSection?: AccountSection;
  onAcceptInvite?: (invite: GameInvite) => Promise<void>;
  onViewFriendProfile?: (friend: FriendProfile) => void;
  onClose: () => void;
  onSignIn: (email: string, password: string) => Promise<string>;
  onSignUp: (
    email: string,
    password: string,
    displayName: string,
    portraitId: AccountPortraitId,
  ) => Promise<string>;
  onSignOut: () => Promise<void>;
  onRequestPasswordReset: (email: string) => Promise<string>;
  onUpdatePassword: (password: string) => Promise<string>;
  passwordRecovery?: boolean;
  onUpdateDisplayName: (displayName: string) => Promise<string>;
  onUpdatePortrait: (portraitId: AccountPortraitId) => Promise<string>;
}) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [section, setSection] = useState<AccountSection>(initialSection);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState(account?.displayName ?? "");
  const [portraitId, setPortraitId] = useState<AccountPortraitId>(
    account?.portraitId ?? DEFAULT_ACCOUNT_PORTRAIT_ID,
  );
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setDisplayName(account?.displayName ?? "");
    setPortraitId(account?.portraitId ?? DEFAULT_ACCOUNT_PORTRAIT_ID);
    setSection(initialSection);
    setFeedback("");
    setError("");
  }, [
    account?.userId,
    account?.displayName,
    account?.portraitId,
    initialSection,
  ]);

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
      : onSignUp(email.trim(), password, displayName.trim(), portraitId));
  };

  return (
    <div className="modal-backdrop account-modal-backdrop">
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
        ) : passwordRecovery ? (
          <>
            <KeyRound className="account-hero-icon" size={34} />
            <h2>Choose a new password</h2>
            <p className="account-recovery-copy">
              Enter a new password for your God Chess account.
            </p>
            <form className="account-form" onSubmit={(event) => {
              event.preventDefault();
              void run(() => {
                if (newPassword !== confirmPassword) {
                  throw new Error("Passwords do not match.");
                }
                return onUpdatePassword(newPassword);
              });
            }}>
              <PasswordInput
                id="account-new-password"
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
              />
              <PasswordInput
                id="account-confirm-password"
                label="Confirm new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
              />
              <button
                className="primary-button"
                disabled={
                  working ||
                  newPassword.length < 6 ||
                  confirmPassword.length < 6
                }
              >
                {working
                  ? <LoaderCircle className="spin" size={17} />
                  : <KeyRound size={17} />}
                Update password
              </button>
            </form>
          </>
        ) : !account && mode === "forgot" ? (
          <>
            <KeyRound className="account-hero-icon" size={34} />
            <h2>Reset your password</h2>
            <p className="account-recovery-copy">
              We will email you a secure link to choose a new password.
            </p>
            <form className="account-form" onSubmit={(event) => {
              event.preventDefault();
              void run(() => onRequestPasswordReset(email.trim()));
            }}>
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
              <button
                className="primary-button"
                disabled={working || !email.trim()}
              >
                {working
                  ? <LoaderCircle className="spin" size={17} />
                  : <KeyRound size={17} />}
                Send reset link
              </button>
              <button
                type="button"
                className="text-button account-recovery-back"
                onClick={() => setMode("signin")}
              >
                Back to sign in
              </button>
            </form>
          </>
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
              <FriendsView
                social={social}
                onAcceptInvite={onAcceptInvite}
                onViewFriendProfile={onViewFriendProfile}
                run={run}
              />
            ) : (
              <>
                <AccountPortrait
                  portraitId={account.portraitId}
                  className="account-hero-portrait"
                />
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
                <AccountPortraitPicker
                  value={portraitId}
                  disabled={working}
                  onChange={setPortraitId}
                />
                <button
                  className="secondary-button account-save-portrait"
                  disabled={working || portraitId === account.portraitId}
                  onClick={() => void run(() => onUpdatePortrait(portraitId))}
                >
                  Save portrait
                </button>
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
                <>
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
                  <AccountPortraitPicker
                    value={portraitId}
                    disabled={working}
                    onChange={setPortraitId}
                  />
                </>
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
              <PasswordInput
                id="account-password"
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
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
              {mode === "signin" && (
                <button
                  type="button"
                  className="text-button account-forgot-password"
                  onClick={() => setMode("forgot")}
                >
                  Forgot password?
                </button>
              )}
            </form>
          </>
        )}
        {feedback && <p className="account-feedback" role="status">{feedback}</p>}
        {(error || serviceError) && <p className="account-error" role="alert">{error || serviceError}</p>}
      </section>
    </div>
  );
}
