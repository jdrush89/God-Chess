import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../account/supabase";
import {
  normalizeRankedLeaderboard,
  type RankedLeaderboardEntry,
} from "./types";

export interface RankedLeaderboardState {
  entries: RankedLeaderboardEntry[];
  loading: boolean;
  error?: string;
}

const initialState: RankedLeaderboardState = {
  entries: [],
  loading: true,
};

export const useRankedLeaderboard = () => {
  const [state, setState] = useState<RankedLeaderboardState>(initialState);
  const requestGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    setState((current) => ({
      ...current,
      loading: true,
      error: undefined,
    }));
    try {
      if (!supabase) throw new Error("Account services are not configured.");
      const { data, error } = await supabase.rpc("ranked_leaderboard");
      if (error) throw error;
      if (requestGeneration.current !== generation) return;
      setState({
        entries: normalizeRankedLeaderboard(data),
        loading: false,
      });
    } catch (error) {
      if (requestGeneration.current !== generation) return;
      console.error("Unable to load the Ranked leaderboard.", error);
      setState({
        entries: [],
        loading: false,
        error: error instanceof Error
          ? error.message
          : "Unable to load the Ranked leaderboard.",
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      requestGeneration.current += 1;
    };
  }, [refresh]);

  return [state, { refresh }] as const;
};
