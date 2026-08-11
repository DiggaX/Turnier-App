"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";

import { cn } from "@/lib/utils";
import {
  assignPlayer,
  fillFor,
  membersOf,
  pendingChanges,
  type Assignment,
} from "./assign";
import {
  createTeam,
  disbandTeam,
  renameTeam,
  saveAssignments,
  setCaptain,
  setTeamReady,
} from "./actions";

export type TeamRow = {
  id: string;
  display_name: string;
  join_code: string | null;
  checked_in_at: string | null;
};

export type PlayerRow = {
  id: string;
  display_name: string;
  gamertag: string | null;
  team_id: string | null;
  is_captain: boolean;
};

export type TeamsClientProps = {
  tournamentId: string;
  teamSize: number;
  teams: TeamRow[];
  players: PlayerRow[];
};

/** Schluessel einer Ablageflaeche. "none" ist die Spalte "Ohne Team". */
const NO_TEAM = "none";

type DragState = { playerId: string; x: number; y: number; overKey: string | null };

type DragHandlers = {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
};

/**
 * Welche Ablageflaeche liegt unter dem Finger?
 *
 * Mit Pointer Capture gehen alle Ereignisse an den Griff, egal worueber der
 * Finger gerade steht — die Zielbestimmung muss deshalb ueber die Koordinaten
 * laufen. Das Schleppbild traegt pointer-events-none, sonst faende
 * elementFromPoint immer nur sich selbst.
 */
function zoneKeyAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const zone = el.closest<HTMLElement>("[data-zone]");
  return zone?.dataset.zone ?? null;
}

function zoneKeyToTeamId(key: string): string | null {
  return key === NO_TEAM ? null : key;
}

const CARD = "rounded-2xl border border-line bg-surface p-4";
const SMALL_BTN =
  "rounded-md border border-line px-2.5 py-1 font-display text-[10px] uppercase tracking-[0.12em] text-fg-muted transition-colors hover:border-white/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";
const LIST = "overflow-hidden rounded-xl border border-line bg-surface-2";

/**
 * Eine Spielerzeile — auf Modulebene, nicht in TeamsClient verschachtelt.
 *
 * Eine im Render erzeugte Komponente ist bei jedem Durchlauf ein anderer Typ,
 * React haengt sie also ab und neu an. Waehrend des Ziehens laeuft pro
 * pointermove ein Render: der Griff waere jedes Mal ein neuer DOM-Knoten und die
 * Pointer-Erfassung nach der ersten Bewegung weg.
 */
function PlayerLine({
  player,
  teams,
  currentTeamId,
  dragging,
  disabled,
  dragHandlers,
  onMove,
}: {
  player: PlayerRow;
  teams: TeamRow[];
  currentTeamId: string | null;
  dragging: boolean;
  disabled: boolean;
  dragHandlers: DragHandlers;
  onMove: (playerId: string, teamId: string | null) => void;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 px-3 py-2 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-line/60",
        dragging && "opacity-40",
      )}
    >
      {/* touch-action nur auf dem Griff — auf der ganzen Zeile fraesse das
          Ziehen das Scrollen der Liste. */}
      <button
        type="button"
        tabIndex={-1}
        // Fuer Screenreader unsichtbar: das <select> daneben leistet dasselbe
        // und ist der Weg, den eine Tastatur nehmen kann.
        aria-hidden
        style={{ touchAction: "none" }}
        className="cursor-grab select-none rounded-md border border-line px-2 py-1 leading-none text-fg-dim active:cursor-grabbing"
        {...dragHandlers}
      >
        ⠿
      </button>

      <span className="min-w-0 flex-1 truncate">
        <span className="font-display font-semibold text-ink">
          {player.display_name}
        </span>
        {player.is_captain && (
          <span className="ml-1.5 text-cyan" title="Captain">
            ★
          </span>
        )}
        {player.gamertag && (
          <span className="ml-2 text-xs text-fg-dim">{player.gamertag}</span>
        )}
      </span>

      {/* Der Weg ohne Zeigegeraet — und zugleich die Bedienung fuer Tastatur
          und Screenreader. */}
      <select
        aria-label={`${player.display_name} verschieben nach …`}
        value={currentTeamId ?? NO_TEAM}
        onChange={(e) => onMove(player.id, zoneKeyToTeamId(e.target.value))}
        disabled={disabled}
        className="max-w-[9rem] shrink-0 rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-fg-muted"
      >
        <option value={NO_TEAM}>Ohne Team</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.display_name}
          </option>
        ))}
      </select>
    </li>
  );
}

/**
 * Der Teams-Screen der Orga: links die Spieler ohne Team, rechts die
 * Mannschaften.
 *
 * Zugeordnet wird per Ziehen ODER ueber das <select> in jeder Zeile. Das
 * <select> ist nicht der Notausgang, sondern der gleichwertige zweite Weg —
 * Tastatur, Screenreader, und alles, was am Tresen mit Handschuhen passiert.
 *
 * Bewusst KEIN HTML5-Drag-and-Drop: draggable/dragstart feuern auf iOS und
 * Android nicht, und die Orga steht dort mit einem Tablet.
 */
export function TeamsClient({
  tournamentId,
  teamSize,
  teams,
  players,
}: TeamsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [drag, setDrag] = useState<DragState | null>(null);

  const serverAssignments: Assignment[] = players.map((p) => ({
    playerId: p.id,
    teamId: p.team_id,
  }));
  const [assignments, setAssignments] = useState<Assignment[]>(serverAssignments);

  // Nach router.refresh() kommen neue Props herein. Zurueckgesetzt wird nur,
  // wenn sich die Zuordnung auf dem Server tatsaechlich geaendert hat — sonst
  // wuerfe jedes "Spielbereit" die noch nicht gespeicherten Zuege weg.
  const serverSignature = players
    .map((p) => `${p.id}:${p.team_id ?? ""}`)
    .join("|");
  const [knownSignature, setKnownSignature] = useState(serverSignature);
  if (knownSignature !== serverSignature) {
    setKnownSignature(serverSignature);
    setAssignments(serverAssignments);
  }

  const byId = new Map(players.map((p) => [p.id, p]));
  const dirty = pendingChanges(serverAssignments, assignments);

  /** Jede Schreib-Aktion laeuft gleich ab: Fehler zeigen oder neu laden. */
  function run(action: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function move(playerId: string, teamId: string | null) {
    setError(null);
    setAssignments((cur) => assignPlayer(cur, playerId, teamId));
  }

  // ── Ziehen ────────────────────────────────────────────────────────────────

  function dragHandlersFor(playerId: string): DragHandlers {
    return {
      onPointerDown: (e) => {
        // Sonst deutet der Browser die Geste als Textauswahl.
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ playerId, x: e.clientX, y: e.clientY, overKey: null });
      },
      onPointerMove: (e) => {
        setDrag((cur) =>
          cur
            ? {
                ...cur,
                x: e.clientX,
                y: e.clientY,
                overKey: zoneKeyAt(e.clientX, e.clientY),
              }
            : cur,
        );
      },
      onPointerUp: (e) => {
        if (!drag) return;
        const key = zoneKeyAt(e.clientX, e.clientY);
        if (key) move(drag.playerId, zoneKeyToTeamId(key));
        setDrag(null);
      },
      onPointerCancel: () => setDrag(null),
    };
  }

  function renderLine(playerId: string) {
    const player = byId.get(playerId);
    if (!player) return null;
    return (
      <PlayerLine
        key={playerId}
        player={player}
        teams={teams}
        currentTeamId={
          assignments.find((a) => a.playerId === playerId)?.teamId ?? null
        }
        dragging={drag?.playerId === playerId}
        disabled={isPending}
        dragHandlers={dragHandlersFor(playerId)}
        onMove={move}
      />
    );
  }

  const unassigned = membersOf(assignments, null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
          {teams.length} Teams · {players.length} Spieler · Teamgröße {teamSize}
        </div>
        <div className="flex items-center gap-3">
          {dirty.length > 0 && (
            <span className="font-display text-xs text-warn">
              {dirty.length} offene Änderung{dirty.length === 1 ? "" : "en"}
            </span>
          )}
          <button
            type="button"
            onClick={() => run(() => saveAssignments(tournamentId, dirty))}
            disabled={isPending || dirty.length === 0}
            className="inline-flex items-center gap-2 rounded-[10px] border border-cyan/40 bg-cyan/[0.06] px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Speichere…" : "Zuordnung speichern"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-live">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <section
          data-zone={NO_TEAM}
          className={cn(
            CARD,
            "self-start",
            drag?.overKey === NO_TEAM && "border-cyan bg-cyan/[0.06]",
          )}
        >
          <h2 className="mb-3 font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
            Ohne Team · {unassigned.length}
          </h2>
          {unassigned.length === 0 ? (
            <p className="text-sm text-fg-muted">Alle Spieler sind zugeordnet.</p>
          ) : (
            <ul className={LIST}>{unassigned.map(renderLine)}</ul>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = newTeamName;
              setNewTeamName("");
              run(() => createTeam(tournamentId, name));
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Neues Team"
              aria-label="Name des neuen Teams"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-fg-dim"
            />
            <button
              type="submit"
              disabled={isPending || newTeamName.trim().length === 0}
              className="rounded-lg border border-lime/40 bg-lime/[0.06] px-4 py-2 font-display text-xs font-semibold uppercase tracking-wider text-lime transition-colors hover:bg-lime/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Team anlegen
            </button>
          </form>

          {teams.length === 0 ? (
            <p className="text-sm text-fg-muted">
              Noch keine Mannschaften. Lege oben eine an.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {teams.map((team) => {
                const fill = fillFor(assignments, team.id, teamSize);
                const members = membersOf(assignments, team.id);
                const ready = team.checked_in_at !== null;
                const captainId = members.find((id) => byId.get(id)?.is_captain);
                return (
                  <section
                    key={team.id}
                    data-zone={team.id}
                    className={cn(
                      CARD,
                      drag?.overKey === team.id && "border-cyan bg-cyan/[0.06]",
                    )}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-display font-bold uppercase tracking-tight text-ink">
                          {team.display_name}
                        </h3>
                        {team.join_code && (
                          <div className="font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
                            Code {team.join_code}
                          </div>
                        )}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 font-display text-xs font-bold",
                          fill.state === "full"
                            ? "text-lime"
                            : fill.state === "over"
                              ? "text-live"
                              : "text-warn",
                        )}
                      >
                        {fill.count} von {fill.teamSize}
                      </span>
                    </div>

                    {fill.state !== "full" && (
                      <div className="mb-2 font-display text-[10px] uppercase tracking-[0.14em] text-warn">
                        {fill.state === "over" ? "Überbesetzt" : "Unvollständig"}
                      </div>
                    )}

                    <ul className={cn(LIST, "mb-3")}>
                      {members.length === 0 ? (
                        <li className="px-3 py-3 text-sm text-fg-dim">
                          Spieler hierher ziehen
                        </li>
                      ) : (
                        members.map(renderLine)
                      )}
                    </ul>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          run(() => setTeamReady(tournamentId, team.id, !ready))
                        }
                        className={cn(
                          SMALL_BTN,
                          ready && "border-lime/40 bg-lime/10 text-lime",
                        )}
                      >
                        {ready ? "Spielbereit ✓" : "Spielbereit"}
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          const name = window.prompt(
                            "Neuer Teamname",
                            team.display_name,
                          );
                          if (name === null) return;
                          run(() => renameTeam(tournamentId, team.id, name));
                        }}
                        className={SMALL_BTN}
                      >
                        Umbenennen
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `„${team.display_name}“ auflösen? Die Spieler bleiben angemeldet und stehen danach ohne Team da.`,
                            )
                          ) {
                            return;
                          }
                          run(() => disbandTeam(tournamentId, team.id));
                        }}
                        className={cn(SMALL_BTN, "border-live/40 text-live")}
                      >
                        Auflösen
                      </button>
                      <select
                        aria-label={`Captain von ${team.display_name}`}
                        value={captainId ?? ""}
                        disabled={isPending || members.length === 0}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          run(() =>
                            setCaptain(tournamentId, team.id, e.target.value),
                          );
                        }}
                        className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-fg-muted"
                      >
                        <option value="">Captain wählen…</option>
                        {members.map((id) => (
                          <option key={id} value={id}>
                            {byId.get(id)?.display_name ?? id}
                          </option>
                        ))}
                      </select>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Schleppbild. pointer-events-none, sonst findet elementFromPoint es
          statt der Ablageflaeche darunter. */}
      {drag && (
        <div
          aria-hidden
          style={{ left: drag.x, top: drag.y }}
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-cyan bg-surface px-3 py-1.5 font-display text-sm font-semibold text-ink shadow-lg"
        >
          {byId.get(drag.playerId)?.display_name}
        </div>
      )}
    </div>
  );
}
