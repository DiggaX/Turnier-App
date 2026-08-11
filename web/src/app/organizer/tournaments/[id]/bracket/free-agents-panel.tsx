"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { assignFreeAgents } from "./free-agent-actions";
import {
  NO_TEAM,
  incompleteTeams,
  newTeamIndex,
  newTeamKey,
  suggestAssignments,
  type FreeAgent,
  type TeamSlot,
} from "./free-agents";

export type FreeAgentsPanelProps = {
  tournamentId: string;
  teamSize: number;
  teams: TeamSlot[];
  freeAgents: FreeAgent[];
};

/**
 * Was dem Turnier kurz vor dem Start noch fehlt: Spieler ohne Team und Teams
 * ohne genug Spieler. Der Vorschlag ist ein Angebot — die Orga kann jede Zeile
 * aendern, alles stehen lassen, oder das Panel ignorieren und trotzdem
 * generieren. Deshalb sitzt hier kein Riegel, nur ein Hinweis.
 */
export function FreeAgentsPanel({
  tournamentId,
  teamSize,
  teams,
  freeAgents,
}: FreeAgentsPanelProps) {
  const router = useRouter();
  const [plan, setPlan] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const gaps = useMemo(
    () => incompleteTeams(teams, teamSize),
    [teams, teamSize],
  );

  // So viele neue Teams, wie der Rest hergibt — die Auswahl bietet immer eines
  // mehr an als der Vorschlag nutzt, damit die Orga umverteilen kann.
  const newTeamCount = Math.max(
    1,
    Math.floor(freeAgents.length / Math.max(teamSize, 1)) + 1,
  );

  // Der Knopf haengt am Plan, nicht am Vorschlag: wer von Hand zuordnet, ohne
  // vorher „vorschlagen" gedrueckt zu haben, kam sonst nie zum Uebernehmen.
  const hasPlan = Object.values(plan).some((target) => target !== NO_TEAM);

  function onSuggest() {
    setError(null);
    setPlan(suggestAssignments(teams, freeAgents, teamSize));
  }

  function onPick(playerId: string, target: string) {
    setError(null);
    setPlan((cur) => ({ ...cur, [playerId]: target }));
  }

  function onApply() {
    setError(null);
    const fills = new Map<string, string[]>();
    const news = new Map<number, string[]>();
    for (const [playerId, target] of Object.entries(plan)) {
      if (!target) continue;
      const idx = newTeamIndex(target);
      if (idx === null) {
        fills.set(target, [...(fills.get(target) ?? []), playerId]);
      } else {
        news.set(idx, [...(news.get(idx) ?? []), playerId]);
      }
    }
    if (fills.size === 0 && news.size === 0) {
      setError("Noch nichts zugeordnet.");
      return;
    }

    startTransition(async () => {
      const result = await assignFreeAgents(
        tournamentId,
        [...fills].map(([teamId, playerIds]) => ({ teamId, playerIds })),
        [...news].map(([idx, playerIds]) => ({
          name: `Restteam ${idx + 1}`,
          playerIds,
        })),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPlan({});
      router.refresh();
    });
  }

  if (freeAgents.length === 0 && gaps.length === 0) return null;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-warn/30 bg-warn/[0.04] p-5">
      <div>
        <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
          Restspieler
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          {freeAgents.length} Spieler ohne Team, {gaps.length}{" "}
          {gaps.length === 1 ? "Team unvollständig" : "Teams unvollständig"}
        </p>
      </div>

      {gaps.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {gaps.map((t) => (
            <li
              key={t.id}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg-muted"
            >
              <span className="font-display font-semibold text-ink">{t.name}</span>{" "}
              <span className="text-warn">
                {t.memberCount} / {teamSize}
              </span>
            </li>
          ))}
        </ul>
      )}

      {freeAgents.length > 0 && (
        <ul className="flex flex-col gap-2">
          {freeAgents.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate font-display font-semibold text-ink">
                {a.name}
              </span>
              <label className="sr-only" htmlFor={`target-${a.id}`}>
                Team für {a.name}
              </label>
              <select
                id={`target-${a.id}`}
                value={plan[a.id] ?? NO_TEAM}
                onChange={(e) => onPick(a.id, e.target.value)}
                disabled={isPending}
                className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink disabled:opacity-50"
              >
                <option value={NO_TEAM}>— ohne Team —</option>
                {gaps.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.memberCount}/{teamSize})
                  </option>
                ))}
                {Array.from({ length: newTeamCount }, (_, i) => (
                  <option key={newTeamKey(i)} value={newTeamKey(i)}>
                    Restteam {i + 1} (neu)
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSuggest}
          disabled={isPending || freeAgents.length === 0}
          className="rounded-lg border border-line px-3 py-2 font-display text-xs font-medium uppercase tracking-wider text-fg-muted transition-colors hover:border-white/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Restspieler vorschlagen
        </button>
        {hasPlan && (
          <button
            type="button"
            onClick={onApply}
            disabled={isPending}
            className="rounded-lg border border-cyan/40 bg-cyan/[0.06] px-4 py-2 font-display text-xs font-semibold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/15 disabled:opacity-50"
          >
            {isPending ? "Übernehme…" : "Zuordnung übernehmen"}
          </button>
        )}
        {error && <span className="text-sm text-live">{error}</span>}
      </div>

      {/*
        Der Satz steht immer da, nicht nur wenn schon ein Spielplan existiert:
        das Panel weiss nichts von matches, und vor dem ersten Generieren ist er
        genauso wahr. Ohne ihn liest sich ein uebernommener Vorschlag am Tisch
        wie „erledigt" — das Team meldet sich spielbereit (syncTeamReady), steht
        aber in keiner Partie, bis das Bracket generiert wird.
      */}
      <p className="text-sm text-fg-muted">
        Die Zuordnung erscheint im Spielplan, sobald das Bracket (neu) generiert
        wird — übernehmen allein setzt niemanden in ein Match.
      </p>

      <p className="text-xs text-fg-dim">
        Der Vorschlag ist unverbindlich — du kannst das Bracket auch ohne ihn
        generieren.
      </p>
    </section>
  );
}
