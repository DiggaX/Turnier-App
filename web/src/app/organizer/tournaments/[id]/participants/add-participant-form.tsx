"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { addParticipant } from "./actions";

type MemberDraft = { name: string; gamertag: string };

const emptyRoster = (size: number): MemberDraft[] =>
  Array.from({ length: size }, () => ({ name: "", gamertag: "" }));

/**
 * Nachmeldung at the desk: name, birthdate, optional gamertag — plus the roster
 * on a team tournament, because a 3v3 entry with no players in it is not an
 * entry. The first row is the captain, matching what the public registration
 * writes.
 *
 * Collapsed by default: at an event the participant list is what staff reads,
 * the form is what they occasionally need. Birthdate uses the native date input
 * so phones show their own picker.
 */
export function AddParticipantForm({
  tournamentId,
  teamSize = 1,
}: {
  tournamentId: string;
  teamSize?: number;
}) {
  const isTeam = teamSize > 1;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gamertag, setGamertag] = useState("");
  const [members, setMembers] = useState<MemberDraft[]>(() =>
    emptyRoster(teamSize),
  );
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

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
      const result = await addParticipant(
        tournamentId,
        name,
        birthdate,
        gamertag,
        isTeam ? members : [],
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setAdded(name);
      setDisplayName("");
      setBirthdate("");
      setGamertag("");
      setMembers(emptyRoster(teamSize));
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="mb-6 flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-fit font-display text-sm font-bold uppercase tracking-wider"
          onClick={() => setOpen(true)}
        >
          <UserPlus data-icon="inline-start" />
          {isTeam ? "Team nachmelden" : "Teilnehmer nachmelden"}
        </Button>
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
      <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
        {isTeam ? `Team nachmelden · ${teamSize}v${teamSize}` : "Teilnehmer nachmelden"}
      </h2>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="add-name">{isTeam ? "Teamname" : "Anzeigename"}</Label>
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
            {isTeam ? "Geburtsdatum Captain" : "Geburtsdatum"}
          </Label>
          <Input
            id="add-birthdate"
            type="date"
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="add-gamertag">
            {isTeam ? "Team-Tag (optional)" : "Gamertag (optional)"}
          </Label>
          <Input
            id="add-gamertag"
            value={gamertag}
            onChange={(e) => setGamertag(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      {isTeam && (
        <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
          <legend className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
            Aufstellung
          </legend>
          {members.map((member, i) => (
            <div key={i} className="flex flex-col gap-3 sm:flex-row">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={`add-member-${i}`}>
                  {i === 0 ? "Captain" : `Spieler ${i + 1}`}
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
                <Label htmlFor={`add-member-tag-${i}`}>Gamertag (optional)</Label>
                <Input
                  id={`add-member-tag-${i}`}
                  value={member.gamertag}
                  onChange={(e) => updateMember(i, { gamertag: e.target.value })}
                  autoComplete="off"
                />
              </div>
            </div>
          ))}
        </fieldset>
      )}

      <p className="text-xs text-fg-dim">
        Wird sofort eingecheckt. Kein Konto und keine Fotoerlaubnis — die
        Fotoerlaubnis müsste auf Papier eingeholt werden. Damit die Nachmeldung
        ein Match bekommt, muss das Bracket neu generiert werden.
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
