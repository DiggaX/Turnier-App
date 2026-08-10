"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { addParticipant } from "./actions";

/**
 * Nachmeldung at the desk: name, birthdate, optional gamertag.
 *
 * Collapsed by default — at an event the participant list is what staff reads,
 * the form is what they occasionally need. Birthdate uses the native date input
 * so phones show their own picker.
 */
export function AddParticipantForm({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gamertag, setGamertag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

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
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setAdded(name);
      setDisplayName("");
      setBirthdate("");
      setGamertag("");
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
          Teilnehmer nachmelden
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
        Teilnehmer nachmelden
      </h2>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="add-name">Anzeigename</Label>
          <Input
            id="add-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="off"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="add-birthdate">Geburtsdatum</Label>
          <Input
            id="add-birthdate"
            type="date"
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="add-gamertag">Gamertag (optional)</Label>
          <Input
            id="add-gamertag"
            value={gamertag}
            onChange={(e) => setGamertag(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

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
