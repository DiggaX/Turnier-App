"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FORMAT_OPTIONS, MODE_OPTIONS, SELECT_CLASS } from "../options";
import { updateTournament } from "../actions";

const schema = z.object({
  name: z.string().trim().min(1, "Name erforderlich"),
  gameId: z.string().min(1, "Spiel wählen"),
  format: z.string().min(1),
  mode: z.string().min(1),
  teamSize: z.number().int().min(1, "Mindestens 1"),
  startsAt: z.string().optional(),
});
type Values = z.infer<typeof schema>;

type TournamentData = {
  id: string;
  name: string;
  gameId: string;
  format: string;
  mode: string;
  teamSize: number;
  startsAt: string | null;
};

export function EditTournamentForm({
  games,
  tournament,
  canEditStructure,
}: {
  games: { id: string; name: string; team_size: number }[];
  tournament: TournamentData;
  canEditStructure: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: tournament.name,
      gameId: tournament.gameId,
      format: tournament.format,
      mode: tournament.mode,
      teamSize: tournament.teamSize,
      startsAt: tournament.startsAt ?? "",
    },
  });

  async function onSubmit(values: Values) {
    setError(null);
    setSaved(false);
    const res = await updateTournament({
      id: tournament.id,
      name: values.name,
      gameId: values.gameId,
      format: values.format,
      mode: values.mode,
      teamSize: values.teamSize,
      startsAt: values.startsAt ? values.startsAt : null,
    });
    if (res && "error" in res) {
      setError(res.error);
    } else {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-name">Name</Label>
        <Input id="edit-name" {...register("name")} />
        {errors.name && <p className="text-xs text-live">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-gameId">Spiel</Label>
        <select
          id="edit-gameId"
          className={SELECT_CLASS}
          disabled={!canEditStructure}
          {...register("gameId")}
        >
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {!canEditStructure && (
          <p className="text-xs text-fg-dim">
            Spiel kann nicht geändert werden, solange Matches existieren.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-format">Format</Label>
        <select
          id="edit-format"
          className={SELECT_CLASS}
          disabled={!canEditStructure}
          {...register("format")}
        >
          {FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {!canEditStructure && (
          <p className="text-xs text-fg-dim">
            Format kann nicht geändert werden, solange Matches existieren.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-mode">Modus</Label>
        <select id="edit-mode" className={SELECT_CLASS} {...register("mode")}>
          {MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-teamSize">Teamgröße (1 = Solo, 5 = 5v5)</Label>
        <Input
          id="edit-teamSize"
          type="number"
          min={1}
          {...register("teamSize", { valueAsNumber: true })}
        />
        {errors.teamSize && (
          <p className="text-xs text-live">{errors.teamSize.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-startsAt">Start (optional)</Label>
        <Input id="edit-startsAt" type="datetime-local" {...register("startsAt")} />
      </div>

      {error && <p className="text-sm text-live">{error}</p>}
      {saved && <p className="text-sm text-lime">Gespeichert.</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Wird gespeichert…" : "Speichern"}
      </Button>
    </form>
  );
}
