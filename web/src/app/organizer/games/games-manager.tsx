"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createGame, updateGame, deleteGame } from "./actions";

type Game = { id: string; name: string; team_size: number };

function GameRow({ game }: { game: Game }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(game.name);
  const [teamSize, setTeamSize] = useState(game.team_size);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const teamSizeValid = Number.isInteger(teamSize) && teamSize >= 1;

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateGame(game.id, name, teamSize);
      if ("error" in res) {
        setError(res.error);
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!window.confirm(`Spiel "${name}" wirklich löschen?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteGame(game.id);
      if ("error" in res) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <TableRow className="border-line/60 hover:bg-white/[0.02]">
        <TableCell>
          <Input
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
            className="h-9 min-w-[140px]"
            disabled={pending}
            aria-label="Spielname"
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            min={1}
            value={teamSize}
            onChange={(e) => { setTeamSize(Number(e.target.value)); setSaved(false); }}
            className="h-9 w-20"
            disabled={pending}
            aria-label="Teamgröße"
          />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending || !teamSizeValid}
              className="rounded-[8px] bg-lime px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Speichern
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-[8px] border border-live/40 bg-live/10 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-live transition-colors hover:bg-live/20 disabled:opacity-50"
            >
              Löschen
            </button>
            {saved && (
              <span className="font-display text-[10px] uppercase tracking-wider text-lime">
                Gespeichert
              </span>
            )}
          </div>
          {error && <p className="mt-1 text-xs text-live">{error}</p>}
        </TableCell>
      </TableRow>
    </>
  );
}

function AddGameRow() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [teamSize, setTeamSize] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const teamSizeValid = Number.isInteger(teamSize) && teamSize >= 1;

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await createGame(name, teamSize);
      if ("error" in res) {
        setError(res.error);
      } else {
        setName("");
        setTeamSize(1);
        router.refresh();
      }
    });
  }

  return (
    <>
      <TableRow className="border-t border-line bg-white/[0.015] hover:bg-white/[0.02]">
        <TableCell>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Neues Spiel…"
            className="h-9 min-w-[140px]"
            disabled={pending}
            aria-label="Name des neuen Spiels"
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            min={1}
            value={teamSize}
            onChange={(e) => setTeamSize(Number(e.target.value))}
            className="h-9 w-20"
            disabled={pending}
            aria-label="Teamgröße des neuen Spiels"
          />
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={add}
              disabled={pending || !name.trim() || !teamSizeValid}
              className="w-fit rounded-[8px] bg-lime px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Wird angelegt…" : "Hinzufügen"}
            </button>
            {error && <p className="text-xs text-live">{error}</p>}
          </div>
        </TableCell>
      </TableRow>
    </>
  );
}

export function GamesManager({ games }: { games: Game[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <Table>
        <TableHeader>
          <TableRow className="border-line hover:bg-transparent">
            <TableHead className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
              Name
            </TableHead>
            <TableHead className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
              Teamgröße
            </TableHead>
            <TableHead className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
              Aktionen
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {games.map((game) => (
            <GameRow key={game.id} game={game} />
          ))}
          <AddGameRow />
        </TableBody>
      </Table>
    </div>
  );
}
