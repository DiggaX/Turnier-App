"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export type LiveBoardProps = {
  tournamentId: string;
  children: React.ReactNode;
};

/**
 * Realtime + fullscreen shell for the public live board.
 *
 * On mount it opens a Supabase Realtime channel for this tournament and
 * subscribes to changes on `matches` and `tournaments`. Any change triggers a
 * `router.refresh()`, which re-runs the server component and streams fresh data
 * into the (presentational) children — so when the referee confirms a result,
 * the beamer updates without a manual reload.
 *
 * Realtime is best-effort: if the publication isn't enabled on the project the
 * subscription simply never pushes (the board still renders the server data and
 * a normal reload always reflects the latest state). The subscribe path is
 * wrapped so a misconfiguration can't throw and break the page.
 */
export function LiveBoard({ tournamentId, children }: LiveBoardProps) {
  const router = useRouter();
  // Strict Mode double-invokes effects in dev; guard so we open exactly one
  // channel and don't tear down the live one on the throwaway second pass.
  const startedRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const supabase = createClient();
    const channel = supabase.channel(`board-${tournamentId}`);

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
          {
            event: "*",
            schema: "public",
            table: "tournaments",
            filter: `id=eq.${tournamentId}`,
          },
          () => router.refresh(),
        )
        .subscribe();
    } catch {
      // Realtime not enabled / misconfigured — board still renders server data.
    }

    return () => {
      startedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [tournamentId, router]);

  // Track fullscreen so the toggle label/icon stays in sync if the user exits
  // via Esc rather than the button.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen API blocked (e.g. permissions) — ignore, board stays usable.
    }
  }

  return (
    <div className="min-h-[calc(100vh-49px)] bg-[radial-gradient(900px_600px_at_50%_-10%,rgba(31,209,227,0.12),transparent_60%)]">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 pt-6 sm:px-10">
        <div className="flex items-center gap-2.5 rounded-[10px] border border-live/40 bg-live/[0.13] px-4 py-2.5 font-display text-sm uppercase tracking-[0.16em] text-live">
          <span
            aria-hidden
            className="inline-block size-2.5 animate-pulse rounded-full bg-live"
          />
          LIVE
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
