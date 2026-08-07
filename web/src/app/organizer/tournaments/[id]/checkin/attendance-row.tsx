"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { TableCell, TableRow } from "@/components/ui/table";
import { formatShortDateTime } from "@/lib/format-date";

import { resetCheckIn } from "../participants/actions";

export function AttendanceRow({
  participantId,
  tournamentId,
  displayName,
  checkedInAt,
}: {
  participantId: string;
  tournamentId: string;
  displayName: string;
  checkedInAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reset() {
    if (!window.confirm(`Anwesenheit von „${displayName}" zurücksetzen?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await resetCheckIn(participantId, tournamentId);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <TableRow className="border-line/60 hover:bg-white/[0.02]">
      <TableCell className="font-display font-semibold text-ink">
        {displayName}
      </TableCell>
      <TableCell>
        {checkedInAt ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-lime/15 px-2.5 py-1 font-display text-[10px] font-medium uppercase tracking-[0.12em] text-lime">
            Anwesend
          </span>
        ) : (
          <span className="text-fg-dim">—</span>
        )}
        {checkedInAt && (
          <span className="ml-2 text-xs text-fg-muted">
            {formatShortDateTime(checkedInAt)}
          </span>
        )}
        {error && <p className="mt-1 text-xs text-live">{error}</p>}
      </TableCell>
      <TableCell className="text-right">
        {checkedInAt && (
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="rounded-[8px] border border-line px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-fg-muted transition-colors hover:text-ink disabled:opacity-50"
          >
            Zurücksetzen
          </button>
        )}
      </TableCell>
    </TableRow>
  );
}
