"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTournament } from "../actions";

const FORMAT_OPTIONS = [
  { value: "single_elim", label: "Single Elimination" },
  { value: "double_elim", label: "Double Elimination" },
  { value: "round_robin", label: "Round Robin" },
  { value: "swiss", label: "Swiss-System" },
  { value: "groups_playoffs", label: "Gruppen → Playoffs" },
];
const MODE_OPTIONS = [
  { value: "hybrid", label: "Hybrid" },
  { value: "lan", label: "LAN" },
  { value: "online", label: "Online" },
];

const schema = z.object({
  name: z.string().trim().min(1, "Name erforderlich"),
  gameId: z.string().min(1, "Spiel wählen"),
  format: z.string().min(1),
  mode: z.string().min(1),
  teamSize: z.number().int().min(1, "Mindestens 1"),
  startsAt: z.string().optional(),
});
type Values = z.infer<typeof schema>;

const SELECT_CLASS =
  "h-11 w-full rounded-xl border border-line bg-bg px-3 font-display text-sm text-ink outline-none focus:border-lime/60";

export function NewTournamentForm({
  games,
}: {
  games: { id: string; name: string; team_size: number }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      gameId: games[0]?.id ?? "",
      format: "single_elim",
      mode: "hybrid",
      teamSize: games[0]?.team_size ?? 1,
      startsAt: "",
    },
  });

  async function onSubmit(values: Values) {
    setError(null);
    const res = await createTournament({
      name: values.name,
      gameId: values.gameId,
      format: values.format,
      mode: values.mode,
      teamSize: values.teamSize,
      startsAt: values.startsAt ? values.startsAt : null,
    });
    if (res && "error" in res) setError(res.error);
    // success path redirects server-side
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} />
        {errors.name && <p className="text-xs text-live">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gameId">Spiel</Label>
        <select
          id="gameId"
          className={SELECT_CLASS}
          {...register("gameId")}
          onChange={(e) => {
            const g = games.find((x) => x.id === e.target.value);
            if (g) setValue("teamSize", g.team_size);
          }}
        >
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="format">Format</Label>
        <select id="format" className={SELECT_CLASS} {...register("format")}>
          {FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mode">Modus</Label>
        <select id="mode" className={SELECT_CLASS} {...register("mode")}>
          {MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="teamSize">Teamgröße (1 = 1v1, 5 = 5v5)</Label>
        <Input
          id="teamSize"
          type="number"
          min={1}
          {...register("teamSize", { valueAsNumber: true })}
        />
        {errors.teamSize && (
          <p className="text-xs text-live">{errors.teamSize.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="startsAt">Start (optional)</Label>
        <Input id="startsAt" type="datetime-local" {...register("startsAt")} />
      </div>

      {error && <p className="text-sm text-live">{error}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Wird angelegt…" : "Turnier anlegen"}
      </Button>
    </form>
  );
}
