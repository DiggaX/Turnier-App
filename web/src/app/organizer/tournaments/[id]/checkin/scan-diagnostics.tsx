import { formatShortDateTime } from "@/lib/format-date";

import type { RawKeyEntry, ScanLogEntry } from "./use-hardware-scan";

const OUTCOME_LABEL: Record<ScanLogEntry["outcome"], string> = {
  ok: "OK",
  "too-short": "zu kurz",
  "no-enter": "ohne Enter abgebrochen",
};

const CHANNEL_LABEL: Record<ScanLogEntry["channel"], string> = {
  tasten: "Tasten",
  text: "Textfeld",
};

/**
 * What the handheld actually delivered.
 *
 * Two lists, because they answer two different questions. "Scans" says what was
 * read as a code and what became of it; "Tasten-Rohdaten" says whether anything
 * reached the browser at all. An empty raw list is a DataWedge problem, a full
 * one with no scans is ours.
 */
export function ScanDiagnostics({
  scans,
  rawKeys,
}: {
  scans: ScanLogEntry[];
  rawKeys: RawKeyEntry[];
}) {
  return (
    <div className="mt-2 flex flex-col gap-4 text-xs text-fg-muted">
      <section className="flex flex-col gap-2">
        <h3 className="font-display text-[10px] uppercase tracking-wider text-fg-dim">
          Scans
        </h3>
        {scans.length === 0 ? (
          <p className="text-fg-dim">
            Noch nichts empfangen. Drück die Scan-Taste am Gerät. Kommt nichts
            an, in DataWedge unter Profile0 die Keystroke-Ausgabe mit „Send
            Characters as Events“ und „Send ENTER key“ aktivieren.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {scans.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-line bg-bg/40 px-2.5 py-1.5"
              >
                <code className="block break-all font-mono text-[11px] text-ink">
                  {entry.text}
                </code>
                <span className="text-[10px] text-fg-dim">
                  <span
                    className={
                      entry.outcome === "ok" ? "text-lime" : "text-warn"
                    }
                  >
                    {OUTCOME_LABEL[entry.outcome]}
                  </span>
                  {" · "}
                  {CHANNEL_LABEL[entry.channel]} · {entry.text.length} Zeichen
                  {entry.durationMs !== undefined &&
                    ` · ${Math.round(entry.durationMs)} ms`}
                  {" · "}
                  {formatShortDateTime(new Date(entry.at))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-display text-[10px] uppercase tracking-wider text-fg-dim">
          Tasten-Rohdaten
        </h3>
        {rawKeys.length === 0 ? (
          <p className="text-fg-dim">
            Keine Tasten empfangen — die Scans erreichen den Browser nicht
            (DataWedge-Profil prüfen).
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {rawKeys.map((entry) => (
              <li
                key={entry.id}
                className="rounded-md border border-line/60 bg-bg/40 px-2 py-1 text-[10px]"
              >
                <code className="font-mono text-ink">{entry.label}</code>
                <span className="text-fg-dim">
                  {" · "}
                  {entry.gapMs} ms · {entry.target}
                </span>
                {entry.swallowed && (
                  <span className="text-warn"> · ignoriert (Eingabefeld)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
