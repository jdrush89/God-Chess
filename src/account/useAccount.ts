import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { accountsConfigured, supabase } from "./supabase";

export interface AccountProfile {
  userId: string;
  email: string;
  displayName: string;
}

const defaultDisplayName = (user: User) =>
  String(user.user_metadata.display_name || user.email?.split("@")[0] || "Player").slice(0, 24);

const loadProfile = async (user: User): Promise<AccountProfile> => {
  if (!supabase) throw new Error("Account services are not configured.");
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  const displayName = String(data?.display_name || defaultDisplayName(user)).slice(0, 24);
  if (!data) {
    const { error: createError } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: displayName });
    if (createError) throw createError;
  }
  return {
    userId: user.id,
    email: user.email ?? "",
    displayName,
  };
};

export function useAccount() {
  const [account, setAccount] = useState<AccountProfile>();
  const [loading, setLoading] = useState(accountsConfigured);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

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
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
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

  const signUp = async (email: string, password: string, displayName: string) => {
    if (!supabase) throw new Error("Account services are not configured.");
    setWorking(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName.trim().slice(0, 24) } },
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

  const signOut = async () => {
    if (!supabase) return;
    setWorking(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setError(undefined);
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
        .update({ display_name: normalized, updated_at: new Date().toISOString() })
        .eq("id", account.userId);
      if (error) throw error;
      setAccount({ ...account, displayName: normalized });
      setError(undefined);
      return "Display name updated.";
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
    signIn,
    signUp,
    signOut,
    updateDisplayName,
  };
}
