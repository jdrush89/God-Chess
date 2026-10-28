import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { accountsConfigured, supabase } from "./supabase";
import {
  DEFAULT_ACCOUNT_PORTRAIT_ID,
  normalizeAccountPortraitId,
  type AccountPortraitId,
} from "./portraits";

export interface AccountProfile {
  userId: string;
  email: string;
  displayName: string;
  portraitId: AccountPortraitId;
  publicId?: string;
  needsDisplayName?: boolean;
  needsLocalDataImport?: boolean;
}

const normalizedDisplayName = (value: unknown) =>
  typeof value === "string" ? value.trim().slice(0, 24) : "";

export const resolveDisplayName = (
  savedValue: unknown,
  metadataValue: unknown,
  email?: string,
) => {
  const savedDisplayName = normalizedDisplayName(savedValue);
  const metadataDisplayName = normalizedDisplayName(metadataValue);
  return {
    savedDisplayName,
    metadataDisplayName,
    displayName:
      savedDisplayName ||
      metadataDisplayName ||
      normalizedDisplayName(email?.split("@")[0]) ||
      "Player",
    needsDisplayName: !savedDisplayName && !metadataDisplayName,
  };
};

export const resolveAuthRedirectUrl = (
  href = window.location.href,
  baseUrl = import.meta.env.BASE_URL,
) => new URL(baseUrl, href).href;

export const isPasswordRecoveryUrl = (
  href = window.location.href,
) => {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  return url.searchParams.get("type") === "recovery" ||
    hash.get("type") === "recovery";
};

export const resolveLocalDataImportPending = (value: unknown) =>
  value === true;

export const isMissingPortraitColumnError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const source = error as { code?: unknown; message?: unknown };
  return source.code === "42703" &&
    typeof source.message === "string" &&
    source.message.includes("portrait_id");
};

export const createSignUpMetadata = (
  displayName: string,
  portraitId: AccountPortraitId = DEFAULT_ACCOUNT_PORTRAIT_ID,
) => ({
  display_name: displayName.trim().slice(0, 24),
  portrait_id: normalizeAccountPortraitId(portraitId),
  local_data_import_pending: true,
});

export const createProfileUpsert = (
  id: string,
  displayName: string,
  portraitId: AccountPortraitId,
  supportsPortraits: boolean,
) => ({
  id,
  display_name: displayName,
  ...(supportsPortraits ? { portrait_id: portraitId } : {}),
});

const loadProfile = async (user: User): Promise<AccountProfile> => {
  if (!supabase) throw new Error("Account services are not configured.");
  let supportsPortraits = true;
  let { data, error } = await supabase
    .from("profiles")
    .select("display_name, public_id, portrait_id")
    .eq("id", user.id)
    .maybeSingle();
  if (isMissingPortraitColumnError(error)) {
    supportsPortraits = false;
    const legacy = await supabase
      .from("profiles")
      .select("display_name, public_id")
      .eq("id", user.id)
      .maybeSingle();
    data = legacy.data
      ? { ...legacy.data, portrait_id: undefined }
      : legacy.data;
    error = legacy.error;
  }
  if (error) throw error;
  const {
    savedDisplayName,
    metadataDisplayName,
    displayName,
    needsDisplayName,
  } = resolveDisplayName(
    data?.display_name,
    user.user_metadata.display_name,
    user.email,
  );
  const portraitId = normalizeAccountPortraitId(
    data?.portrait_id ?? user.user_metadata.portrait_id,
  );
  if (!data && metadataDisplayName) {
    const { error: createError } = await supabase
      .from("profiles")
      .upsert(createProfileUpsert(
        user.id,
        metadataDisplayName,
        portraitId,
        supportsPortraits,
      ), {
        onConflict: "id",
        ignoreDuplicates: true,
      });
    if (createError) throw createError;
  } else if (!savedDisplayName && metadataDisplayName) {
    const { error: createError } = await supabase
      .from("profiles")
      .upsert(createProfileUpsert(
        user.id,
        metadataDisplayName,
        portraitId,
        supportsPortraits,
      ));
    if (createError) throw createError;
  }
  return {
    userId: user.id,
    email: user.email ?? "",
    displayName,
    portraitId,
    publicId: data?.public_id ?? "",
    needsDisplayName,
    needsLocalDataImport: resolveLocalDataImportPending(
      user.user_metadata.local_data_import_pending,
    ),
  };
};

export function useAccount() {
  const [account, setAccount] = useState<AccountProfile>();
  const [loading, setLoading] = useState(accountsConfigured);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const [passwordRecovery, setPasswordRecovery] = useState(
    accountsConfigured && isPasswordRecoveryUrl(),
  );

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const applyUser = async (user?: User) => {
      if (!active) return;
      if (!user) {
        setAccount(undefined);
        setLoading(false);
        return;
      }
      try {
        const profile = await loadProfile(user);
        if (active) {
          setAccount(profile);
          setError(undefined);
        }
      } catch (error) {
        console.error("Unable to load the God Chess account profile.", error);
        if (active) {
          setAccount(undefined);
          setError(error instanceof Error ? error.message : "Unable to load the account profile.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("Unable to restore the God Chess account session.", error);
        if (active) {
          setError(error.message);
          setLoading(false);
        }
        return;
      }
      void applyUser(data.session?.user);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      void applyUser(session?.user);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) throw new Error("Account services are not configured.");
    setWorking(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setError(undefined);
      return "Signed in.";
    } finally {
      setWorking(false);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    displayName: string,
    portraitId: AccountPortraitId,
  ) => {
    if (!supabase) throw new Error("Account services are not configured.");
    setWorking(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: createSignUpMetadata(displayName, portraitId),
          emailRedirectTo: resolveAuthRedirectUrl(),
        },
      });
      if (error) throw error;
      setError(undefined);
      return data.session
        ? "Account created and signed in."
        : "Account created. Check your email to confirm it, then sign in.";
    } finally {
      setWorking(false);
    }
  };

  const requestPasswordReset = async (email: string) => {
    if (!supabase) throw new Error("Account services are not configured.");
    const normalized = email.trim();
    if (!normalized) throw new Error("Email is required.");
    setWorking(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
        redirectTo: resolveAuthRedirectUrl(),
      });
      if (error) throw error;
      setError(undefined);
      return "If an account exists for that email, a password reset link has been sent.";
    } finally {
      setWorking(false);
    }
  };

  const updatePassword = async (password: string) => {
    if (!supabase || !passwordRecovery) {
      throw new Error("Open a valid password reset link before changing your password.");
    }
    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }
    setWorking(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPasswordRecovery(false);
      setError(undefined);
      return "Password updated.";
    } finally {
      setWorking(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    setWorking(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setPasswordRecovery(false);
      setError(undefined);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign out.");
      throw error;
    } finally {
      setWorking(false);
    }
  };

  const updateDisplayName = async (displayName: string) => {
    if (!supabase || !account) throw new Error("You must be signed in to update your name.");
    const normalized = displayName.trim().slice(0, 24);
    if (!normalized) throw new Error("Display name is required.");
    setWorking(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: account.userId,
          display_name: normalized,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      setAccount({ ...account, displayName: normalized, needsDisplayName: false });
      setError(undefined);
      return "Display name updated.";
    } finally {
      setWorking(false);
    }
  };

  const updatePortrait = async (portraitId: AccountPortraitId) => {
    if (!supabase || !account) {
      throw new Error("You must be signed in to update your portrait.");
    }
    const normalized = normalizeAccountPortraitId(portraitId);
    setWorking(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: account.userId,
          display_name: account.displayName,
          portrait_id: normalized,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      const { error: metadataError } = await supabase.auth.updateUser({
        data: { portrait_id: normalized },
      });
      if (metadataError) throw metadataError;
      setAccount({ ...account, portraitId: normalized });
      setError(undefined);
      return "Account portrait updated.";
    } finally {
      setWorking(false);
    }
  };

  const completeLocalDataImportDecision = async () => {
    if (!supabase || !account) {
      throw new Error("You must be signed in to finish account setup.");
    }
    setWorking(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          local_data_import_pending: false,
          local_data_import_resolved_at: new Date().toISOString(),
        },
      });
      if (error) throw error;
      setAccount({ ...account, needsLocalDataImport: false });
      setError(undefined);
    } finally {
      setWorking(false);
    }
  };

  return {
    account,
    configured: accountsConfigured,
    loading,
    working,
    error,
    passwordRecovery,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    signOut,
    updateDisplayName,
    updatePortrait,
    completeLocalDataImportDecision,
  };
}
