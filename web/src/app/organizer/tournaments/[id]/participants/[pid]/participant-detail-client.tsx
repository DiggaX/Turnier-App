"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateParticipant, removeParticipant } from "../actions";

const schema = z.object({
  displayName: z.string().trim().min(1, "Anzeigename erforderlich"),
  gamertag: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export function ParticipantDetailClient({
  participantId,
  tournamentId,
  defaultDisplayName,
  defaultGamertag,
}: {
  participantId: string;
  tournamentId: string;
  defaultDisplayName: string;
  defaultGamertag: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [removing, setRemoving] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: defaultDisplayName,
      gamertag: defaultGamertag ?? "",
    },
  });

  async function onSubmit(values: Values) {
    setError(null);
    setSaved(false);
    const res = await updateParticipant(
      participantId,
      tournamentId,
      values.displayName,
      values.gamertag?.trim() || null,
    );
    if (res && "error" in res) {
      setError(res.error);
    } else {
      setSaved(true);
      router.refresh();
    }
  }

  async function onRemove() {
    if (
      !window.confirm(
        "Teilnehmer wirklich entfernen? Diese Aktion kann nicht rückgängig gemacht werden.",
      )
    ) {
      return;
    }
    setError(null);
    setRemoving(true);
    const res = await removeParticipant(participantId, tournamentId);
    if (res && "error" in res) {
      setError(res.error);
      setRemoving(false);
    } else {
      router.push(`/organizer/tournaments/${tournamentId}/participants`);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-4 font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
        Bearbeiten
      </h2>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="displayName">Anzeigename</Label>
          <Input id="displayName" {...register("displayName")} />
          {errors.displayName && (
            <p className="text-xs text-live">{errors.displayName.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gamertag">Gamertag (optional)</Label>
          <Input id="gamertag" {...register("gamertag")} />
        </div>

        {error && <p className="text-sm text-live">{error}</p>}
        {saved && <p className="text-sm text-lime">Gespeichert.</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Wird gespeichert…" : "Speichern"}
          </Button>
          <button
            type="button"
            onClick={onRemove}
            disabled={removing || isSubmitting}
            className="rounded-[10px] border border-live/40 bg-live/10 px-5 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-live transition-colors hover:bg-live/20 disabled:opacity-50"
          >
            {removing ? "Wird entfernt…" : "Entfernen"}
          </button>
        </div>
      </form>
    </section>
  );
}
