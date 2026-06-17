"use server";

import { generateDoubleElim } from "@/lib/bracket/double-elim";
import { generateRoundRobin } from "@/lib/bracket/round-robin";
import { generateSingleElim } from "@/lib/bracket/single-elim";
import { generateGroupStage, groupCountFor } from "@/lib/groups/groups";
import { generateSwissRoundOne } from "@/lib/swiss/generate";
import { pairKey, pairSwissRound, swissRoundCount } from "@/lib/swiss/pairing";
import { swissStandings } from "@/lib/swiss/standings";
import { computeStandings, type DoneMatch } from "@/lib/standings";
import { seedPlayoffAdvancers } from "@/lib/groups/playoff-seeding";
import {
  buildIdMap,
  resolveByeAdvances,
  resolveLinkUpdates,
  resolveLoserLinkUpdates,
} from "@/lib/bracket/resolve-links";
import type { GeneratedMatch, SeededParticipant } from "@/lib/bracket/types";
import type { Database, TournamentFormat } from "@/lib/database.types";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type MatchInsert = Database["public"]["Tables"]["matches"]["Insert"];

export type ActionResult = { ok: true } | { error: string };

/**
 * Verify the caller is signed in and a staff member (admin/organizer/referee).
 * Returns the authenticated Supabase client on success, or an error string.
 */
async function requireStaff(): Promise<
  { supabase: Supabase } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Nicht angemeldet." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["admin", "organizer", "referee"].includes(profile.role)) {
    return { error: "Diese Aktion ist nicht erlaubt." };
  }

  return { supabase };
}

/**
 * Persist the seeding order for a tournament's checked-in participants.
 *
 * `orderedParticipantIds` is the desired order; each participant's `seed` is set
 * to its 1-based index. Every id must be a CHECKED-IN participant of this
 * tournament — anything else is rejected so seeds always reference real entrants.
 */
export async function saveSeeds(
  tournamentId: string,
  orderedParticipantIds: string[],
): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { supabase } = guard;

  if (orderedParticipantIds.length === 0) {
    return { error: "Keine Teilnehmer zum Setzen." };
  }
  // Reject duplicate ids up front.
  if (new Set(orderedParticipantIds).size !== orderedParticipantIds.length) {
    return { error: "Doppelte Teilnehmer im Seeding." };
  }

  // Load the tournament's checked-in participants and validate the input set.
  const { data: checkedIn, error: loadErr } = await supabase
    .from("participants")
    .select("id")
    .eq("tournament_id", tournamentId)
    .not("checked_in_at", "is", null);

  if (loadErr) {
    return { error: friendlyDbError(loadErr, "Teilnehmer konnten nicht geladen werden.") };
  }

  const validIds = new Set((checkedIn ?? []).map((p) => p.id));
  for (const id of orderedParticipantIds) {
    if (!validIds.has(id)) {
      return { error: "Ungültiger oder nicht eingecheckter Teilnehmer im Seeding." };
    }
  }

  // Assign seed = index + 1 (1-based). Update one row at a time so each is
  // scoped to its tournament (defends against cross-tournament id injection).
  for (let i = 0; i < orderedParticipantIds.length; i++) {
    const { error: updErr } = await supabase
      .from("participants")
      .update({ seed: i + 1 })
      .eq("id", orderedParticipantIds[i])
      .eq("tournament_id", tournamentId);
    if (updErr) {
      return { error: friendlyDbError(updErr, "Seeding konnte nicht gespeichert werden.") };
    }
  }

  return { ok: true };
}

/** Pick the generator for a format, or null if the format is unsupported. */
function generatorFor(
  format: TournamentFormat,
): ((p: SeededParticipant[]) => GeneratedMatch[]) | null {
  switch (format) {
    case "single_elim":
      return generateSingleElim;
    case "round_robin":
      return generateRoundRobin;
    case "double_elim":
      return generateDoubleElim;
    case "swiss":
      return generateSwissRoundOne;
    default:
      return null;
  }
}

/**
 * Generate (or regenerate) the bracket for a tournament from its checked-in
 * participants, ordered by seed.
 *
 * Pipeline:
 *  1. Ensure every checked-in participant has a 1..N seed (assign by created_at
 *     for any missing) so the generator receives a clean sequence.
 *  2. Run the format's generator.
 *  3. DELETE existing matches, INSERT the generated rows, then for single-elim
 *     wire `next_match_id`/`next_slot` and immediately advance byes.
 *  4. Flip the tournament to `running`.
 */
export async function generateBracket(
  tournamentId: string,
): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { supabase } = guard;

  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select("id, format")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tErr) {
    return { error: friendlyDbError(tErr, "Turnier konnte nicht geladen werden.") };
  }
  if (!tournament) {
    return { error: "Turnier nicht gefunden." };
  }

  // Load checked-in participants ordered so that seeded ones come first (by
  // seed asc), unseeded ones after (by created_at). This gives a stable order
  // for assigning a clean 1..N sequence below.
  const { data: parts, error: pErr } = await supabase
    .from("participants")
    .select("id, seed, created_at")
    .eq("tournament_id", tournamentId)
    .not("checked_in_at", "is", null)
    .order("seed", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (pErr) {
    return { error: friendlyDbError(pErr, "Teilnehmer konnten nicht geladen werden.") };
  }

  const participants = parts ?? [];
  if (participants.length < 2) {
    return { error: "Mindestens 2 eingecheckte Teilnehmer nötig." };
  }

  // Assign a clean 1..N seed in the loaded order so the generator gets a
  // contiguous sequence regardless of pre-existing (or missing) seeds.
  const seeded: SeededParticipant[] = participants.map((p, i) => ({
    id: p.id,
    seed: i + 1,
  }));

  // Persist any seed corrections so the stored seed matches what we generated.
  for (let i = 0; i < participants.length; i++) {
    if (participants[i].seed !== i + 1) {
      const { error: seedErr } = await supabase
        .from("participants")
        .update({ seed: i + 1 })
        .eq("id", participants[i].id)
        .eq("tournament_id", tournamentId);
      if (seedErr) {
        return { error: friendlyDbError(seedErr, "Seeding konnte nicht gespeichert werden.") };
      }
    }
  }

  let generated: GeneratedMatch[];
  if (tournament.format === "groups_playoffs") {
    const g = groupCountFor(seeded.length);
    if (g === 0) {
      return {
        error:
          "Gruppen → Playoffs braucht mindestens 6 eingecheckte Teilnehmer.",
      };
    }
    generated = generateGroupStage(seeded, g);
  } else {
    const generator = generatorFor(tournament.format);
    if (!generator) {
      return { error: "Format wird noch nicht unterstützt." };
    }
    // The double-elim generator throws for non-power-of-two entrant counts;
    // surface that as a friendly message instead of a 500.
    try {
      generated = generator(seeded);
    } catch {
      if (tournament.format === "double_elim") {
        return {
          error:
            "Double Elimination braucht 4, 8, 16 … (Zweierpotenz) eingecheckte Teilnehmer.",
        };
      }
      return { error: "Es konnten keine Matches erzeugt werden." };
    }
  }
  if (generated.length === 0) {
    return { error: "Es konnten keine Matches erzeugt werden." };
  }

  // 1. Remove any existing bracket for this tournament (full regenerate).
  const { error: delErr } = await supabase
    .from("matches")
    .delete()
    .eq("tournament_id", tournamentId);
  if (delErr) {
    return { error: friendlyDbError(delErr, "Vorhandene Matches konnten nicht entfernt werden.") };
  }

  // 2. Insert the generated matches. Advancement-link columns stay null for
  // now; the `bracket` column is persisted so resolution can key on it.
  const rows: MatchInsert[] = generated.map((m) => ({
    tournament_id: tournamentId,
    bracket: m.bracket,
    round: m.round,
    slot: m.slot,
    participant_a_id: m.participantAId,
    participant_b_id: m.participantBId,
    winner_id: m.winnerId,
    status: m.status,
    group_no: m.groupNo ?? null,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from("matches")
    .insert(rows)
    .select("id, bracket, round, slot");

  if (insErr || !inserted) {
    return { error: friendlyDbError(insErr, "Matches konnten nicht angelegt werden.") };
  }

  // 3. Elimination formats: resolve advancement links. Single-elim also
  // auto-advances byes; double-elim additionally wires each match's loser drop.
  if (
    tournament.format === "single_elim" ||
    tournament.format === "double_elim"
  ) {
    let idMap;
    try {
      idMap = buildIdMap(generated, inserted);
    } catch {
      return { error: "Bracket konnte nicht verknüpft werden." };
    }

    // 3a. Winner advancement links (both formats).
    const linkUpdates = resolveLinkUpdates(generated, idMap);
    for (const u of linkUpdates) {
      const { error: linkErr } = await supabase
        .from("matches")
        .update({ next_match_id: u.nextMatchId, next_slot: u.nextSlot })
        .eq("id", u.id);
      if (linkErr) {
        return { error: friendlyDbError(linkErr, "Bracket-Verknüpfung fehlgeschlagen.") };
      }
    }

    if (tournament.format === "double_elim") {
      // 3b. Loser drop links (double-elim only): each WB loser falls to the LB.
      const loserUpdates = resolveLoserLinkUpdates(generated, idMap);
      for (const u of loserUpdates) {
        const { error: loserErr } = await supabase
          .from("matches")
          .update({
            loser_next_match_id: u.loserNextMatchId,
            loser_next_slot: u.loserNextSlot,
          })
          .eq("id", u.id);
        if (loserErr) {
          return { error: friendlyDbError(loserErr, "Bracket-Verknüpfung fehlgeschlagen.") };
        }
      }
      // No bye propagation: a power-of-two double-elim bracket has no byes.
    } else {
      // 4. Single-elim bye propagation: a bye winner already advances into its
      // next match.
      const advances = resolveByeAdvances(generated, idMap);
      for (const a of advances) {
        const patch =
          a.nextSlot === "a"
            ? { participant_a_id: a.winnerId }
            : { participant_b_id: a.winnerId };
        const { error: advErr } = await supabase
          .from("matches")
          .update(patch)
          .eq("id", a.nextMatchId);
        if (advErr) {
          return { error: friendlyDbError(advErr, "Freilos konnte nicht weitergeleitet werden.") };
        }
      }
    }
  }

  // 5. Mark the tournament as running.
  const { error: statusErr } = await supabase
    .from("tournaments")
    .update({ status: "running" })
    .eq("id", tournamentId);
  if (statusErr) {
    return { error: friendlyDbError(statusErr, "Turnierstatus konnte nicht aktualisiert werden.") };
  }

  return { ok: true };
}

/**
 * Advance a Swiss tournament to its next round.
 *
 * Reads every match so far, verifies the current round is fully decided
 * (`done`/`bye`) and that fewer than `R = ceil(log2(N))` rounds have been
 * played, computes the live standings (byes count as wins), pairs the next
 * round via `pairSwissRound` (avoiding rematches and repeat byes), and inserts
 * the new round's matches. A bye row is inserted already decided.
 */
export async function advanceSwissRound(
  tournamentId: string,
): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { supabase } = guard;

  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select("id, format")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tErr) {
    return { error: friendlyDbError(tErr, "Turnier konnte nicht geladen werden.") };
  }
  if (!tournament) return { error: "Turnier nicht gefunden." };
  if (tournament.format !== "swiss") {
    return { error: "Nur für Swiss-Turniere verfügbar." };
  }

  const { data: matches, error: mErr } = await supabase
    .from("matches")
    .select(
      "round, status, participant_a_id, participant_b_id, winner_id, score_a, score_b",
    )
    .eq("tournament_id", tournamentId)
    .order("round", { ascending: true });
  if (mErr) {
    return { error: friendlyDbError(mErr, "Matches konnten nicht geladen werden.") };
  }
  if (!matches || matches.length === 0) {
    return { error: "Erst Runde 1 generieren." };
  }

  const currentRound = Math.max(...matches.map((m) => m.round));

  // Entrants = the distinct participants of round 1 (everyone plays each round).
  const entrants = new Set<string>();
  for (const m of matches) {
    if (m.round !== 1) continue;
    if (m.participant_a_id) entrants.add(m.participant_a_id);
    if (m.participant_b_id) entrants.add(m.participant_b_id);
  }
  const totalRounds = swissRoundCount(entrants.size);
  if (currentRound >= totalRounds) {
    return { error: "Alle Swiss-Runden sind gespielt — der Endstand steht fest." };
  }

  const currentDone = matches
    .filter((m) => m.round === currentRound)
    .every((m) => m.status === "done" || m.status === "bye");
  if (!currentDone) {
    return { error: "Die aktuelle Runde ist noch nicht abgeschlossen." };
  }

  // Build standings inputs + play/bye history across ALL rounds.
  const done: DoneMatch[] = [];
  const byeIds: string[] = [];
  const played = new Set<string>();
  const byeHistory = new Set<string>();
  for (const m of matches) {
    if (m.status === "bye") {
      const w = m.winner_id ?? m.participant_a_id;
      if (w) {
        byeIds.push(w);
        byeHistory.add(w);
      }
      continue;
    }
    if (
      m.status === "done" &&
      m.participant_a_id &&
      m.participant_b_id &&
      m.score_a != null &&
      m.score_b != null
    ) {
      done.push({
        participantAId: m.participant_a_id,
        participantBId: m.participant_b_id,
        scoreA: m.score_a,
        scoreB: m.score_b,
      });
      played.add(pairKey(m.participant_a_id, m.participant_b_id));
    }
  }

  const ranked = swissStandings(done, byeIds).map((r) => r.participantId);
  // Safety net: ensure every entrant is ranked (no-op in normal play).
  for (const id of entrants) {
    if (!ranked.includes(id)) ranked.push(id);
  }

  const { pairings, bye } = pairSwissRound(ranked, played, byeHistory);

  const nextRound = currentRound + 1;
  const rows: MatchInsert[] = [];
  let slot = 0;
  for (const [a, b] of pairings) {
    rows.push({
      tournament_id: tournamentId,
      bracket: "winner",
      round: nextRound,
      slot,
      participant_a_id: a,
      participant_b_id: b,
      status: "pending",
    });
    slot++;
  }
  if (bye) {
    rows.push({
      tournament_id: tournamentId,
      bracket: "winner",
      round: nextRound,
      slot,
      participant_a_id: bye,
      participant_b_id: null,
      winner_id: bye,
      status: "bye",
    });
  }

  const { error: insErr } = await supabase.from("matches").insert(rows);
  if (insErr) {
    return { error: friendlyDbError(insErr, "Nächste Runde konnte nicht angelegt werden.") };
  }

  return { ok: true };
}

const ADVANCE_PER_GROUP = 2;

/**
 * Generate the single-elimination playoff for a groups->playoffs tournament.
 *
 * Guards: staff only, format must be `groups_playoffs`, a group stage must
 * exist, every group match must be decided, and the playoff must not already
 * exist. Computes each group's standings (top `ADVANCE_PER_GROUP` advance),
 * seeds them so group winners sit opposite their runners-up, generates a seeded
 * single-elim bracket (group_no = NULL), inserts it, and wires advancement +
 * bye links exactly like generateBracket does for single-elim.
 */
export async function generatePlayoffs(
  tournamentId: string,
): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { supabase } = guard;

  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select("id, format")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tErr) {
    return { error: friendlyDbError(tErr, "Turnier konnte nicht geladen werden.") };
  }
  if (!tournament) return { error: "Turnier nicht gefunden." };
  if (tournament.format !== "groups_playoffs") {
    return { error: "Nur für Gruppen → Playoffs verfügbar." };
  }

  const { data: matches, error: mErr } = await supabase
    .from("matches")
    .select(
      "group_no, status, participant_a_id, participant_b_id, score_a, score_b",
    )
    .eq("tournament_id", tournamentId);
  if (mErr) {
    return { error: friendlyDbError(mErr, "Matches konnten nicht geladen werden.") };
  }
  const all = matches ?? [];
  const groupMatches = all.filter((m) => m.group_no !== null);
  const playoffMatches = all.filter((m) => m.group_no === null);

  if (groupMatches.length === 0) {
    return { error: "Erst die Gruppenphase generieren." };
  }
  if (playoffMatches.length > 0) {
    return { error: "Die Playoffs wurden bereits ausgelost." };
  }
  const allDone = groupMatches.every(
    (m) => m.status === "done" || m.status === "bye",
  );
  if (!allDone) {
    return { error: "Die Gruppenphase ist noch nicht abgeschlossen." };
  }

  // Per-group standings from that group's decided matches.
  const groupNos = [...new Set(groupMatches.map((m) => m.group_no as number))].sort(
    (a, b) => a - b,
  );
  const rankedByGroup: string[][] = groupNos.map((gNo) => {
    const done: DoneMatch[] = groupMatches
      .filter(
        (m) =>
          m.group_no === gNo &&
          m.status === "done" &&
          m.participant_a_id &&
          m.participant_b_id &&
          m.score_a != null &&
          m.score_b != null,
      )
      .map((m) => ({
        participantAId: m.participant_a_id as string,
        participantBId: m.participant_b_id as string,
        scoreA: m.score_a as number,
        scoreB: m.score_b as number,
      }));
    return computeStandings(done).map((r) => r.participantId);
  });

  const seeded = seedPlayoffAdvancers(rankedByGroup, ADVANCE_PER_GROUP);
  if (seeded.length < 2) {
    return { error: "Zu wenige Teilnehmer für die Playoffs." };
  }

  const generated = generateSingleElim(seeded);
  if (generated.length === 0) {
    return { error: "Playoff-Bracket konnte nicht erzeugt werden." };
  }

  // Insert the playoff matches (group_no stays NULL).
  const rows: MatchInsert[] = generated.map((m) => ({
    tournament_id: tournamentId,
    bracket: m.bracket,
    round: m.round,
    slot: m.slot,
    participant_a_id: m.participantAId,
    participant_b_id: m.participantBId,
    winner_id: m.winnerId,
    status: m.status,
    group_no: null,
  }));
  const { data: inserted, error: insErr2 } = await supabase
    .from("matches")
    .insert(rows)
    .select("id, bracket, round, slot");
  if (insErr2 || !inserted) {
    return { error: friendlyDbError(insErr2, "Playoff-Matches konnten nicht angelegt werden.") };
  }

  // Wire winner advancement + auto-advance byes (same as single-elim).
  let idMap;
  try {
    idMap = buildIdMap(generated, inserted);
  } catch {
    return { error: "Playoff-Bracket konnte nicht verknüpft werden." };
  }
  for (const u of resolveLinkUpdates(generated, idMap)) {
    const { error: linkErr } = await supabase
      .from("matches")
      .update({ next_match_id: u.nextMatchId, next_slot: u.nextSlot })
      .eq("id", u.id);
    if (linkErr) {
      return { error: friendlyDbError(linkErr, "Bracket-Verknüpfung fehlgeschlagen.") };
    }
  }
  for (const a of resolveByeAdvances(generated, idMap)) {
    const patch =
      a.nextSlot === "a"
        ? { participant_a_id: a.winnerId }
        : { participant_b_id: a.winnerId };
    const { error: advErr } = await supabase
      .from("matches")
      .update(patch)
      .eq("id", a.nextMatchId);
    if (advErr) {
      return { error: friendlyDbError(advErr, "Freilos konnte nicht weitergeleitet werden.") };
    }
  }

  return { ok: true };
}
