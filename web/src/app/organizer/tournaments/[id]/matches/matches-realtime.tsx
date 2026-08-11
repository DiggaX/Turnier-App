"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * Keeps the referee's matches page current: refreshes on any `matches` change of
 * this tournament and on any `match_reports` change, so an incoming player report
 * shows up without a reload.
 *
 * `match_reports` has no tournament_id to filter on — RLS already limits the rows
 * a staff member can see to their own org, and the callback only triggers a
 * refresh. Realtime is best-effort: a reload always shows the latest state.
 */
export function MatchesRealtime({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  // Strict Mode double-invokes effects in dev; guard so we open exactly one
  // channel and don't tear down the live one on the throwaway second pass.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const supabase = createClient();
    const channel = supabase.channel(`matches-${tournamentId}`);

    try {
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "matches",
            filter: `tournament_id=eq.${tournamentId}`,
          },
          () => router.refresh(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "match_reports" },
          () => router.refresh(),
        )
        .subscribe();
    } catch {
      // Realtime not enabled / misconfigured — page still renders server data.
    }

    return () => {
      startedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [tournamentId, router]);

  return null;
}
