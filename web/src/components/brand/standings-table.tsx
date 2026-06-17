import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StandingRow } from "@/lib/standings";
import { cn } from "@/lib/utils";

export type StandingsTableProps = {
  /** Sorted standings rows from `computeStandings`. */
  rows: StandingRow[];
  /** Map participant id → display name. Missing ids fall back to "—". */
  names: Record<string, string>;
  className?: string;
};

const HEAD =
  "font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim";

/**
 * Round-robin standings — dark themed table with rank, team name and the
 * computed tallies (played, wins, losses, goals for/against, diff).
 * Presentational: receives already-sorted `StandingRow[]` plus an id→name map.
 */
export function StandingsTable({ rows, names, className }: StandingsTableProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        Noch keine Ergebnisse — die Tabelle erscheint, sobald Matches
        freigegeben sind.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-line bg-surface",
        className,
      )}
      data-testid="standings-table"
    >
      <Table>
        <TableHeader>
          <TableRow className="border-line hover:bg-transparent">
            <TableHead className={HEAD}>Rang</TableHead>
            <TableHead className={HEAD}>Team</TableHead>
            <TableHead className={cn(HEAD, "text-right")}>Sp</TableHead>
            <TableHead className={cn(HEAD, "text-right")}>S</TableHead>
            <TableHead className={cn(HEAD, "text-right")}>N</TableHead>
            <TableHead className={cn(HEAD, "text-right")}>+/−</TableHead>
            <TableHead className={cn(HEAD, "text-right")}>Diff</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow
              key={row.participantId}
              className="border-line/60 hover:bg-white/[0.02]"
            >
              <TableCell className="font-display font-semibold text-fg-muted">
                {i + 1}
              </TableCell>
              <TableCell className="font-display font-semibold text-ink">
                {names[row.participantId] ?? "—"}
              </TableCell>
              <TableCell className="text-right text-fg-muted">
                {row.played}
              </TableCell>
              <TableCell className="text-right text-lime">{row.wins}</TableCell>
              <TableCell className="text-right text-fg-muted">
                {row.losses}
              </TableCell>
              <TableCell className="text-right text-fg-muted">
                {row.scoreFor}:{row.scoreAgainst}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-display font-semibold",
                  row.diff > 0
                    ? "text-lime"
                    : row.diff < 0
                      ? "text-live"
                      : "text-fg-muted",
                )}
              >
                {row.diff > 0 ? `+${row.diff}` : row.diff}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
