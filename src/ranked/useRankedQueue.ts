import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountProfile } from "../account/useAccount";
import { supabase } from "../account/supabase";
import type { Color } from "../game/types";
import {
  normalizeRankedQueueState,
  type RankedQueueState,
} from "./types";

const initialState: RankedQueueState = {
  phase: "idle",
  loading: false,
};

const callRankedRpc = async (
  name: string,
  args: Record<string, unknown> = {},
) => {
  if (!supabase) throw new Error("Account services are not configured.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return normalizeRankedQueueState(data);
};

export const useRankedQueue = (account?: AccountProfile) => {
  const [state, setState] = useState<RankedQueueState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const requestGeneration = useRef(0);
  const touchMatch = useRef(true);

  const apply = useCallback(async (
    name: string,
    args: Record<string, unknown> = {},
    showLoading = false,
  ) => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    if (showLoading) {
      setState((current) => ({
        ...current,
        loading: true,
        error: undefined,
      }));
    }
    try {
      const next = await callRankedRpc(name, args);
      if (requestGeneration.current !== generation) return undefined;
      setState(next);
      return next;
    } catch (error) {
      if (requestGeneration.current !== generation) return undefined;
      console.error(`Unable to complete ranked action ${name}.`, error);
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error
          ? error.message
          : "Unable to reach ranked matchmaking.",
      }));
      return undefined;
    }
  }, []);

  const refresh = useCallback(() => {
    if (!account || !supabase) {
      setState(initialState);
      return Promise.resolve(undefined);
    }
    return apply("ranked_status", {
      target_match_id: stateRef.current.match?.id ?? null,
      touch_match: touchMatch.current,
    });
  }, [account?.userId, apply]);

  useEffect(() => {
    requestGeneration.current += 1;
    if (!account || !supabase) {
      setState(initialState);
      return;
    }
    touchMatch.current = true;
    void apply("ranked_status", {
      target_match_id: null,
      touch_match: true,
    }, true);
  }, [account?.userId, apply]);

  useEffect(() => {
    if (
      !account ||
      !supabase ||
      (
        state.phase !== "queued" &&
        state.phase !== "matched" &&
        state.phase !== "playing"
      )
    ) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [account?.userId, refresh, state.phase]);

  const join = useCallback(() => {
    if (!account) {
      setState((current) => ({
        ...current,
        error: "Sign in before joining ranked matchmaking.",
      }));
      return Promise.resolve(undefined);
    }
    touchMatch.current = true;
    return apply("join_ranked_queue", {}, true);
  }, [account?.userId, apply]);

  const leave = useCallback(() =>
    apply("leave_ranked_queue", {}, true), [apply]);

  const publishRoom = useCallback((matchId: string, roomCode: string) =>
    apply("publish_ranked_room", {
      target_match_id: matchId,
      ranked_room_code: roomCode,
    }), [apply]);

  const reportResult = useCallback((
    matchId: string,
    winnerColor?: Color,
  ) => apply("report_ranked_result", {
    target_match_id: matchId,
    winning_color: winnerColor ?? null,
  }), [apply]);

  const forfeit = useCallback((matchId: string) =>
    apply("forfeit_ranked_match", {
      target_match_id: matchId,
    }, true), [apply]);

  const reset = useCallback(() => {
    requestGeneration.current += 1;
    setState((current) => ({
      phase: "idle",
      loading: false,
      rating: current.match?.rating ?? current.rating,
    }));
  }, []);

  const setMatchHeartbeat = useCallback((enabled: boolean) => {
    touchMatch.current = enabled;
  }, []);

  return [
    state,
    {
      join,
      leave,
      refresh,
      publishRoom,
      reportResult,
      forfeit,
      reset,
      setMatchHeartbeat,
    },
  ] as const;
};
