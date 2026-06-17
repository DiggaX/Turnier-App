"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveSeeds } from "./actions";

export type SeedParticipant = {
  id: string;
  display_name: string;
};

export type SeedingClientProps = {
  tournamentId: string;
  participants: SeedParticipant[];
};

/** Fisher–Yates shuffle returning a new array (does not mutate the input). */
function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Move the item at `index` one position toward the given direction. */
function move<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir;
  if (target < 0 || target >= arr.length) return arr;
  const next = [...arr];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Seeding editor for a tournament's checked-in participants. Renders them in
 * seed order with per-row ▲/▼ reordering and a "Zufällig setzen" shuffle, then
 * persists the order via `saveSeeds`. No external drag-and-drop dependency.
 */
export function SeedingClient({
  tournamentId,
  participants,
}: SeedingClientProps) {
  const router = useRouter();
  const [order, setOrder] = useState<SeedParticipant[]>(participants);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onShuffle() {
    setSaved(false);
    setOrder((cur) => shuffle(cur));
  }

  function onMove(index: number, dir: -1 | 1) {
    setSaved(false);
    setOrder((cur) => move(cur, index, dir));
  }

  function onSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveSeeds(
        tournamentId,
        order.map((p) => p.id),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
          {order.length} eingecheckte Teilnehmer
        </div>
        <button
          type="button"
          onClick={onShuffle}
          disabled={isPending}
          className="rounded-lg border border-line px-3 py-2 font-display text-xs font-medium uppercase tracking-wider text-fg-muted transition-colors hover:border-white/20 hover:text-ink disabled:opacity-50"
        >
          Zufällig setzen
        </button>
      </div>

      <ol className="overflow-hidden rounded-2xl border border-line bg-surface">
        {order.map((p, i) => (
          <li
            key={p.id}
            className="flex items-center gap-3 px-4 py-3 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-line/60"
          >
            <span className="w-7 shrink-0 font-display text-sm font-bold text-lime">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-display font-semibold text-ink">
              {p.display_name}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label={`${p.display_name} nach oben`}
                onClick={() => onMove(i, -1)}
                disabled={i === 0 || isPending}
                className="rounded-md border border-line px-2 py-1 text-fg-muted transition-colors hover:border-white/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                aria-label={`${p.display_name} nach unten`}
                onClick={() => onMove(i, 1)}
                disabled={i === order.length - 1 || isPending}
                className="rounded-md border border-line px-2 py-1 text-fg-muted transition-colors hover:border-white/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              >
                ▼
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={isPending || order.length === 0}
          className="inline-flex w-fit items-center gap-2 rounded-[10px] border border-cyan/40 bg-cyan/[0.06] px-6 py-3 font-display text-sm font-semibold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Speichere…" : "Seeding speichern"}
        </button>
        {saved && (
          <span className="font-display text-xs text-lime">Gespeichert ✓</span>
        )}
        {error && <span className="text-sm text-live">{error}</span>}
      </div>
    </div>
  );
}
