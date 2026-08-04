"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type BracketLiveShellProps = {
  tournamentId: string;
  children: React.ReactNode;
};

/** Refreshes the organizer bracket as scorekeepers update a match. */
export function BracketLiveShell({
  tournamentId,
  children,
}: BracketLiveShellProps) {
  const router = useRouter();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const supabase = createClient();
    const channel = supabase.channel(`organizer-bracket-${tournamentId}`);

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
        .subscribe();
    } catch {
      // A failed Realtime subscription must not make the organizer page unusable.
    }

    return () => {
      startedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [router, tournamentId]);

  return children;
}
