"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { User, UserPlus, Users } from "lucide-react";

import { BirthdateField } from "@/components/birthdate-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { incompleteTeams } from "../bracket/free-agents";
import { addParticipant } from "./actions";

type MemberDraft = { name: string; gamertag: string };

/** Ein bestehendes Team als Ziel der Direktzuordnung. */
export type TeamOption = { id: string; name: string; memberCount: number };

const MODES = [
  { id: "team", label: "Team nachmelden", Icon: Users },
  { id: "single", label: "Einzelspieler nachmelden", Icon: User },
] as const;

type Mode = (typeof MODES)[number]["id"];

const emptyRoster = (size: number): MemberDraft[] =>
  Array.from({ length: size }, () => ({ name: "", gamertag: "" }));

/**
 * Nachmeldung at the desk: name, birthdate, optional gamertag — plus the roster
 * on a team tournament, because a 3v3 entry with no players in it is not an
 * entry. The first row is the captain, matching what the public registration
 * writes.
 *
 * Bei einem Teamturnier steht daneben der zweite Weg: EIN Spieler ohne Team.
 * Solange es den nicht gab, legte der Tresen fuer ein Kind ohne Handy ein Team
 * mit einem Mitglied an — im 3v3 ein Geisterteam, das nie vollzaehlig antritt.
 * Wer allein kommt, wird jetzt Restspieler und kann optional direkt in ein
 * bestehendes Team einziehen.
 *
 * Collapsed by default: at an event the participant list is what staff reads,
 * the form is what they occasionally need. Birthdate uses the native date input
 * so phones show their own picker.
 */
export function AddParticipantForm({
  tournamentId,
  teamSize = 1,
  teams = [],
}: {
  tournamentId: string;
  teamSize?: number;
  teams?: TeamOption[];
}) {
  const isTeam = teamSize > 1;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("team");
  const [isPending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gamertag, setGamertag] = useState("");
  const [teamId, setTeamId] = useState("");
  const [members, setMembers] = useState<MemberDraft[]>(() =>
    emptyRoster(teamSize),
  );
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  // Einzelspieler gibt es nur, wo es Teams gibt: bei team_size 1 ist jede
  // Nachmeldung ohnehin eine Person, der Schalter waere sinnlos.
  const asSingle = isTeam && mode === "single";
  const teamEntry = isTeam && !asSingle;

  // Nur Teams mit Luecke — dieselbe Rechnung wie im Restspieler-Panel. Die Liste
  // von der Seite enthaelt auch volle Teams; boete man sie an, entstuende am
  // Tresen lautlos ein Viertel im 3v3.
  const openTeams = incompleteTeams(teams, teamSize);

  function updateMember(index: number, patch: Partial<MemberDraft>) {
    setMembers((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setAdded(null);
    const name = displayName.trim();
    startTransition(async () => {
      // Die Optionen nur im Einzelmodus mitgeben — der Team- und der Solo-Weg
      // rufen die Action unveraendert auf.
      const result = asSingle
        ? await addParticipant(tournamentId, name, birthdate, gamertag, [], {
            asSingle: true,
            teamId: teamId || null,
          })
        : await addParticipant(
            tournamentId,
            name,
            birthdate,
            gamertag,
            teamEntry ? members : [],
          );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setAdded(name);
      setDisplayName("");
      setBirthdate("");
      setGamertag("");
      setTeamId("");
      setMembers(emptyRoster(teamSize));
      router.refresh();
    });
  }

  function openWith(next: Mode) {
    setMode(next);
    setOpen(true);
  }

  if (!open) {
    const triggerClass = "w-fit font-display text-sm font-bold uppercase tracking-wider";
    return (
      <div className="mb-6 flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className={triggerClass}
            onClick={() => openWith("team")}
          >
            <UserPlus data-icon="inline-start" />
            {isTeam ? "Team nachmelden" : "Teilnehmer nachmelden"}
          </Button>
          {/* Der Einzelweg braucht einen eigenen Knopf: was hier nicht steht,
              findet am Tresen niemand. Genau daran ist live ein Kind ohne Handy
              als 1-von-3-Geisterteam gelandet — wer nur „Team nachmelden" liest,
              meldet ein Team an. */}
          {isTeam && (
            <Button
              type="button"
              variant="outline"
              className={triggerClass}
              onClick={() => openWith("single")}
            >
              <User data-icon="inline-start" />
              Einzelspieler nachmelden
            </Button>
          )}
        </div>
        {added && (
          <p className="text-sm text-lime" role="status">
            {added} wurde angelegt und eingecheckt.
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-6 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
    >
      {isTeam ? (
        // Segmented Control wie im Scan-Panel. aria-pressed, weil die Auswahl
        // sonst nur an der Farbe haengt — vorlesen laesst sich Farbe nicht.
        <div
          role="group"
          aria-label="Was wird nachgemeldet"
          className="inline-flex self-start gap-1 rounded-lg border border-line bg-surface-2 p-1"
        >
          {MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-display text-[11px] uppercase tracking-wider transition-colors ${
                mode === id ? "bg-lime/15 text-lime" : "text-fg-muted hover:text-ink"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      ) : (
        <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
          Teilnehmer nachmelden
        </h2>
      )}

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="add-name">{teamEntry ? "Teamname" : "Anzeigename"}</Label>
          <Input
            id="add-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="off"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="add-birthdate">
            {teamEntry ? "Geburtsdatum Captain" : "Geburtsdatum"}
          </Label>
          <BirthdateField
            id="add-birthdate"
            value={birthdate}
            onChange={setBirthdate}
            required
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="add-gamertag">
            {teamEntry ? "Team-Tag (optional)" : "Gamertag (optional)"}
          </Label>
          <Input
            id="add-gamertag"
            value={gamertag}
            onChange={(e) => setGamertag(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      {/* Nur im Einzelmodus und nur, wenn es ueberhaupt ein Team mit Luecke
          gibt: ein leeres Auswahlfeld ist eine Frage ohne moegliche Antwort. */}
      {asSingle && openTeams.length > 0 && (
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="add-team">Direkt in Team (optional)</Label>
          <select
            id="add-team"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink"
          >
            <option value="">— ohne Team —</option>
            {/* „x/y" wie im Restspieler-Panel: eine blanke Belegungszahl sagt am
                Tresen nichts, die Teamgroesse steht im Einzelmodus nirgends. */}
            {openTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.memberCount}/{teamSize})
              </option>
            ))}
          </select>
        </div>
      )}

      {teamEntry && (
        <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
          <legend className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
            Aufstellung · {teamSize}v{teamSize}
          </legend>
          {members.map((member, i) => {
            // Distinct label per row: three fields all reading "Gamertag" are
            // indistinguishable to a screen reader.
            const who = i === 0 ? "Captain" : `Spieler ${i + 1}`;
            return (
              <div key={i} className="flex flex-col gap-3 sm:flex-row">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor={`add-member-${i}`}>
                    {who}
                    {i > 0 && " (optional)"}
                  </Label>
                  <Input
                    id={`add-member-${i}`}
                    value={member.name}
                    onChange={(e) => updateMember(i, { name: e.target.value })}
                    autoComplete="off"
                    required={i === 0}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor={`add-member-tag-${i}`}>
                    Gamertag {who} (optional)
                  </Label>
                  <Input
                    id={`add-member-tag-${i}`}
                    value={member.gamertag}
                    onChange={(e) => updateMember(i, { gamertag: e.target.value })}
                    autoComplete="off"
                  />
                </div>
              </div>
            );
          })}
        </fieldset>
      )}

      <p className="text-xs text-fg-dim">
        Wird sofort eingecheckt. Kein Konto und keine Fotoerlaubnis — die
        Fotoerlaubnis müsste auf Papier eingeholt werden.{" "}
        {asSingle && !teamId
          ? "Ohne Team steht der Spieler als Restspieler da und bekommt kein Match — erst einem Team zuordnen, dann das Bracket neu generieren."
          : "Damit die Nachmeldung ein Match bekommt, muss das Bracket neu generiert werden."}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={isPending}
          className="font-display text-sm font-bold uppercase tracking-wider"
        >
          {isPending ? "Wird angelegt…" : "Anlegen & einchecken"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Abbrechen
        </Button>
      </div>

      {added && (
        <p className="text-sm text-lime" role="status">
          {added} wurde angelegt und eingecheckt.
        </p>
      )}
      {error && (
        <p className="text-sm text-live" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
