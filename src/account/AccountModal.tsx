import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, LogIn, LogOut, UserPlus, UserRound, X } from "lucide-react";
import type { AccountProfile } from "./useAccount";

export function AccountModal({
  account,
  configured,
  loading,
  working,
  serviceError,
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
  onClose: () => void;
  onSignIn: (email: string, password: string) => Promise<string>;
  onSignUp: (email: string, password: string, displayName: string) => Promise<string>;
  onSignOut: () => Promise<void>;
  onUpdateDisplayName: (displayName: string) => Promise<string>;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(account?.displayName ?? "");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setDisplayName(account?.displayName ?? "");
    setFeedback("");
    setError("");
  }, [account?.userId, account?.displayName]);

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
            <UserRound className="account-hero-icon" size={32} />
            <h2>{account.displayName}</h2>
            <p className="account-email">{account.email}</p>
            <form className="account-form" onSubmit={(event) => {
              event.preventDefault();
              void run(() => onUpdateDisplayName(displayName));
            }}>
              <label>
                Saved display name
                <input
                  maxLength={24}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                />
              </label>
              <button className="primary-button" disabled={working || !displayName.trim()}>
                {working ? <LoaderCircle className="spin" size={17} /> : <UserRound size={17} />}
                Save name
              </button>
            </form>
            <button className="secondary-button account-signout" disabled={working} onClick={() => void run(onSignOut)}>
              <LogOut size={16} /> Sign out
            </button>
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
