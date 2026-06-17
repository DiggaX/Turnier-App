"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export type StationBoardProps = {
  tournamentId: string;
  children: React.ReactNode;
};

/**
 * Staff result-station shell: realtime-refreshes on any `matches` change for the
 * tournament (so confirmed matches drop off and newly-playable ones appear
 * across all stations) and offers a fullscreen toggle for kiosk use. Realtime is
 * best-effort — a normal reload always reflects the latest state.
 */
export function StationBoard({ tournamentId, children }: StationBoardProps) {
  const router = useRouter();
  const startedRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const supabase = createClient();
    const channel = supabase.channel(`station-${tournamentId}`);
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
      // Realtime not enabled — station still renders server data.
    }
    return () => {
      startedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [tournamentId, router]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen blocked — ignore.
    }
  }

  return (
    <div className="min-h-[calc(100vh-49px)] bg-[radial-gradient(900px_600px_at_50%_-10%,rgba(197,247,46,0.10),transparent_60%)]">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 pt-6 sm:px-10">
        <div className="flex items-center gap-2.5 rounded-[10px] border border-lime/40 bg-lime/[0.13] px-4 py-2.5 font-display text-sm uppercase tracking-[0.16em] text-lime">
          Station · Ergebnis-Eingabe
        </div>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="inline-flex items-center gap-2 rounded-[10px] border border-cyan/40 bg-cyan/[0.06] px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.12em] text-cyan transition-colors hover:bg-cyan/15"
        >
          {isFullscreen ? "Vollbild verlassen" : "⛶ Vollbild"}
        </button>
      </div>
      {children}
    </div>
  );
}
