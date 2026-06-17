import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ConfirmForm } from "../matches/confirm-form";
import { createClient } from "@/lib/supabase/server";
import { agreedScore, isPlayable, type Report } from "@/lib/station/station";

import { StationBoard } from "./station-board";

export const metadata: Metadata = { title: "Station — Turnier-App" };

type RawMatch = {
  id: string;
  status: string;
  participant_a_id: string | null;
  participant_b_id: string | null;
  a: { display_name: string } | null;
  b: { display_name: string } | null;
};
type RawReport = { match_id: string; score_a: number; score_b: number };

export default async function StationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["admin", "organizer", "referee"].includes(profile.role)) {
    redirect("/login");
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!tournament) notFound();

  const { data: rawMatches } = await supabase
    .from("matches")
    .select(
      "id, status, participant_a_id, participant_b_id, " +
        "a:participant_a_id(display_name), b:participant_b_id(display_name)",
    )
    .eq("tournament_id", id)
    .order("round", { ascending: true })
    .order("slot", { ascending: true })
    .overrideTypes<RawMatch[]>();

  const playable = (rawMatches ?? []).filter((m) =>
    isPlayable({
      status: m.status,
      participantAId: m.participant_a_id,
      participantBId: m.participant_b_id,
    }),
  );

  // Agreed player reports → prefill the entry. One round-trip for all playable.
  const ids = playable.map((m) => m.id);
  let reportsByMatch = new Map<string, Report[]>();
  if (ids.length > 0) {
    const { data: reps } = await supabase
      .from("match_reports")
      .select("match_id, score_a, score_b")
      .in("match_id", ids)
      .overrideTypes<RawReport[]>();
    for (const r of reps ?? []) {
      const list = reportsByMatch.get(r.match_id) ?? [];
      list.push({ scoreA: r.score_a, scoreB: r.score_b });
      reportsByMatch.set(r.match_id, list);
    }
  }

  return (
    <StationBoard tournamentId={id}>
      <div className="mx-auto w-full max-w-[1280px] px-6 pb-20 pt-8 sm:px-10">
        <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-tight text-ink sm:text-3xl">
          {tournament.name}
        </h1>
        <p className="mb-8 font-display text-xs uppercase tracking-[0.14em] text-fg-dim">
          Tippe das Ergebnis und gib es frei.
        </p>

        {playable.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface px-6 py-10 text-center font-display text-lg text-fg-muted">
            Keine spielbaren Matches gerade.
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {playable.map((m) => {
              const agreed = agreedScore(reportsByMatch.get(m.id) ?? []);
              return (
                <div
                  key={m.id}
                  className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex-1 truncate text-right font-display text-lg font-semibold text-ink">
                      {m.a?.display_name ?? "TBD"}
                    </span>
                    <span className="font-display text-sm text-fg-dim">vs</span>
                    <span className="flex-1 truncate font-display text-lg font-semibold text-ink">
                      {m.b?.display_name ?? "TBD"}
                    </span>
                  </div>
                  <ConfirmForm
                    matchId={m.id}
                    aName={m.a?.display_name ?? "A"}
                    bName={m.b?.display_name ?? "B"}
                    defaultScoreA={agreed?.scoreA ?? null}
                    defaultScoreB={agreed?.scoreB ?? null}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </StationBoard>
  );
}
