"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ParticipantShell,
  SectionLabel,
} from "@/components/brand/participant-shell";
import { JoinCodeCard } from "./join-code-card";

/** Das Team, in dem der Anmeldende gerade steht. */
export interface TeamState {
  id: string;
  name: string;
  /** Der Beitritts-Code des Teams; jedes Mitglied darf ihn sehen. */
  joinCode: string | null;
  isCaptain: boolean;
}

type Member =
  Database["public"]["Functions"]["get_my_team"]["Returns"][number];

/**
 * Die Team-RPCs werfen bereits deutsche, fuer Endnutzer gedachte Meldungen
 * ("Dieses Team ist schon vollzaehlig (3 von 3).", "Diesen Team-Code gibt es
 * hier nicht."). Sie zu ersetzen wuerde dem Anmeldenden genau die Auskunft
 * nehmen, die er braucht — deshalb wird die Meldung durchgereicht und der
 * Fallback greift nur, wenn gar keine da ist.
 */
function rpcMessage(error: { message?: string } | null, fallback: string) {
  const message = error?.message?.trim();
  return message ? message : fallback;
}

interface TeamStepProps {
  supabase: SupabaseClient<Database>;
  tournamentId: string;
  teamSize: number;
  /** Beim Wiedereinstieg schon bekannt, bei frischer Anmeldung `null`. */
  initialTeam: TeamState | null;
  /** Weiter zum Abschluss — mit dem Team, in dem der Anmeldende steht. */
  onDone: (team: TeamState | null) => void;
}

/**
 * Der Team-Schritt: gruenden, beitreten, oder bewusst ohne Team weitermachen.
 *
 * Alle drei Wege stehen nebeneinander, weil keiner der Normalfall ist — wer
 * zuerst da ist gruendet, alle anderen treten bei, und wer allein ankommt und
 * niemanden kennt, soll trotzdem angemeldet sein statt die Anmeldung
 * abzubrechen.
 *
 * Der Zustand kommt nach jeder Aktion frisch aus der Datenbank statt aus dem
 * Rueckgabewert der jeweiligen RPC: `leave_team` kann den Captain nachruecken
 * lassen und ein leeres Team loeschen, `remove_from_team` aendert die Liste der
 * anderen. Lokal nachzuhalten, was serverseitig passiert ist, waere eine zweite
 * Wahrheit.
 */
export function TeamStep({
  supabase,
  tournamentId,
  teamSize,
  initialTeam,
  onDone,
}: TeamStepProps) {
  const [team, setTeam] = useState<TeamState | null>(initialTeam);
  const [members, setMembers] = useState<Member[]>([]);
  const [teamName, setTeamName] = useState("");
  const [code, setCode] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [{ data: regRows }, { data: memberRows }] = await Promise.all([
      supabase.rpc("get_my_registration", { p_tournament_id: tournamentId }),
      supabase.rpc("get_my_team", { p_tournament_id: tournamentId }),
    ]);
    // Scheitert die Nachlese, bleibt der bisherige Stand stehen. Sie auf "kein
    // Team" auszulegen waere die gefaehrlichste Deutung eines Netzwerkfehlers:
    // das Gruenden hat geklappt, saehe aber misslungen aus, und der naechste
    // Griff des Nutzers ist "Team gruenden" -> "Du bist bereits in einem Team"
    // -> "austreten". Damit ist das frisch gegruendete Team geloescht,
    // mitsamt dem Code, den er vielleicht schon weitergegeben hat.
    // regRows ist nur bei einem Fehler null; "angemeldet, aber ohne Team" ist
    // eine Zeile mit team_id null.
    const reg = regRows?.[0];
    if (!reg) {
      setError(
        "Der aktuelle Stand konnte nicht geladen werden. Lade die Seite neu.",
      );
      return;
    }

    setTeam(
      reg.team_id
        ? {
            id: reg.team_id,
            name: reg.team_name ?? "",
            joinCode: reg.join_code,
            isCaptain: reg.is_captain,
          }
        : null,
    );
    if (memberRows) setMembers(memberRows);
  }, [supabase, tournamentId]);

  // Nur beim Wiedereinstieg: wer gerade erst das Formular abgeschickt hat, hat
  // garantiert kein Team, und die beiden Abfragen haetten nichts zu melden.
  const hasInitialTeam = initialTeam !== null;
  useEffect(() => {
    if (!hasInitialTeam) return;
    void (async () => {
      await reload();
    })();
  }, [hasInitialTeam, reload]);

  // PromiseLike, nicht Promise: was supabase.rpc() liefert, ist ein Builder mit
  // then() — awaitbar, aber kein Promise.
  async function run(
    action: () => PromiseLike<{ error: { message?: string } | null }>,
    fallback: string,
  ) {
    setError(null);
    setBusy(true);
    try {
      const { error: rpcError } = await action();
      if (rpcError) {
        setError(rpcMessage(rpcError, fallback));
        return false;
      }
      await reload();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    const ok = await run(
      () =>
        supabase.rpc("create_team", {
          p_tournament_id: tournamentId,
          p_name: teamName,
        }),
      "Das Team konnte nicht gegründet werden.",
    );
    if (ok) setTeamName("");
  }

  async function handleJoin() {
    const ok = await run(
      () =>
        supabase.rpc("join_team", {
          p_tournament_id: tournamentId,
          p_code: code,
        }),
      "Der Beitritt hat nicht geklappt.",
    );
    if (ok) setCode("");
  }

  async function handleRename() {
    const ok = await run(
      () =>
        supabase.rpc("rename_team", {
          p_tournament_id: tournamentId,
          p_name: teamName,
        }),
      "Das Team konnte nicht umbenannt werden.",
    );
    if (ok) {
      setTeamName("");
      setRenaming(false);
    }
  }

  const shell = (children: ReactNode) => (
    <ParticipantShell
      eyebrow="/ Anmeldung · Team"
      heading={team ? "Dein Team" : "Team"}
      subheading={
        team
          ? undefined
          : `Gespielt wird in Teams zu ${teamSize}. Gründe eins oder tritt mit dem Code deiner Mitspieler bei.`
      }
    >
      <div className="flex flex-col gap-4">
        {children}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </ParticipantShell>
  );

  if (team) {
    return shell(
      <>
        <div className="rounded-2xl border border-line bg-surface p-6">
          <SectionLabel className="mb-2">Team</SectionLabel>
          <p className="font-display text-xl font-bold uppercase tracking-wide text-ink">
            {team.name}
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            {members.length} von {teamSize} ·{" "}
            {members.length >= teamSize
              ? "vollzählig"
              : `noch ${teamSize - members.length} frei`}
          </p>

          <ul className="mt-4 flex flex-col gap-2">
            {members.map((m) => (
              <li
                key={m.member_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-bg/40 px-3 py-2"
              >
                <span className="min-w-0 text-sm text-ink">
                  <span className="truncate">{m.member_name}</span>
                  {m.member_gamertag && (
                    <span className="text-fg-dim"> · {m.member_gamertag}</span>
                  )}
                  {m.member_is_captain && (
                    <span className="ml-2 font-display text-[10px] uppercase tracking-[0.18em] text-cyan">
                      Captain
                    </span>
                  )}
                  {m.member_is_me && (
                    <span className="ml-2 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
                      du
                    </span>
                  )}
                </span>
                {team.isCaptain && !m.member_is_me && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          supabase.rpc("remove_from_team", {
                            p_tournament_id: tournamentId,
                            p_member_id: m.member_id,
                          }),
                        "Das Mitglied konnte nicht entfernt werden.",
                      )
                    }
                  >
                    Entfernen
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {team.joinCode && (
          <JoinCodeCard code={team.joinCode} teamName={team.name} />
        )}

        {team.isCaptain &&
          (renaming ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-6">
              <Label htmlFor="renameTeam">Neuer Teamname</Label>
              <Input
                id="renameTeam"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRename()}
                  className="h-11 flex-1"
                >
                  Speichern
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRenaming(false)}
                  className="h-11"
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setTeamName(team.name);
                setRenaming(true);
              }}
              className="h-11"
            >
              Team umbenennen
            </Button>
          ))}

        {/* disabled waehrend einer laufenden Aktion: sonst schliesst ein
            ungeduldiger zweiter Tipp den Schritt mit dem Stand ab, den der
            gerade laufende Beitritt/Austritt genau jetzt umschreibt. */}
        <Button
          type="button"
          disabled={busy}
          onClick={() => onDone(team)}
          className="h-12 font-display text-sm font-bold uppercase tracking-wider"
        >
          Fertig
        </Button>

        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void run(
              () =>
                supabase.rpc("leave_team", { p_tournament_id: tournamentId }),
              "Das Austreten hat nicht geklappt.",
            )
          }
          className="h-11"
        >
          Aus dem Team austreten
        </Button>

        {team.isCaptain && (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  supabase.rpc("disband_team", {
                    p_tournament_id: tournamentId,
                  }),
                "Das Team konnte nicht aufgelöst werden.",
              )
            }
            className="h-11"
          >
            Team auflösen
          </Button>
        )}
      </>,
    );
  }

  return shell(
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6">
        <SectionLabel>Team gründen</SectionLabel>
        <Label htmlFor="teamName">Teamname</Label>
        <Input
          id="teamName"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
        />
        <Button
          type="button"
          disabled={busy}
          onClick={() => void handleCreate()}
          className="mt-1 h-11"
        >
          Team gründen
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6">
        <SectionLabel>Team beitreten</SectionLabel>
        <Label htmlFor="joinCode">Team-Code</Label>
        <Input
          id="joinCode"
          value={code}
          // Der Vergleich in der Datenbank ist schreibungsblind; hier wird nur
          // die Anzeige vereinheitlicht. Leerzeichen fliegen raus, weil ein
          // vorgelesener Code gern als "AB C4 2X" ankommt und btrim in der RPC
          // nur aussen putzt.
          onChange={(e) =>
            setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))
          }
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="uppercase tracking-[0.25em]"
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void handleJoin()}
          className="mt-1 h-11"
        >
          Team beitreten
        </Button>
      </div>

      <div className="rounded-2xl border border-line bg-surface-2/60 p-6">
        <SectionLabel className="mb-2">Noch kein Team</SectionLabel>
        <p className="text-sm leading-relaxed text-fg-muted">
          Du bist trotzdem angemeldet. Die Orga ordnet dich vor Ort einem Team
          zu — bring am besten mit, wen du kennst.
        </p>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => onDone(null)}
          className="mt-4 h-11 w-full"
        >
          Ohne Team fortfahren
        </Button>
      </div>
    </>,
  );
}
