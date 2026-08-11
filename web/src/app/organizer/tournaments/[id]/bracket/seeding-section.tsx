import { SeedingClient, type SeedParticipant } from "./seeding-client";

export type SeedingSectionProps = {
  tournamentId: string;
  participants: SeedParticipant[];
  /** Steht schon ein Spielplan? Entscheidet ueber Trennlinie und Hinweis. */
  hasMatches: boolean;
};

/**
 * Der Seeding-Block der Bracket-Seite — als eigene Datei, weil er in BEIDE
 * Zweige der Seite gehoert (vor und nach dem Generieren) und page.tsx sonst
 * ueber 500 Zeilen laeuft.
 *
 * Warum er nach dem Generieren ueberhaupt noch auftaucht: „Zufällig setzen"
 * steckt in SeedingClient und war ab dem ersten Match unerreichbar. Neu
 * generieren ist seit der Nachmeldung aber ein normaler Schritt mitten im
 * Turnier — und genau dann will die Orga neu auslosen. Der Ablauf liest sich
 * jetzt von oben nach unten: Zufällig setzen → Seeding speichern → Neu
 * generieren.
 */
export function SeedingSection({
  tournamentId,
  participants,
  hasMatches,
}: SeedingSectionProps) {
  return (
    <section
      className={
        hasMatches
          ? "flex flex-col gap-4 border-t border-line pt-6"
          : "flex flex-col gap-4"
      }
    >
      <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
        Seeding
      </h2>
      {participants.length === 0 ? (
        <p className="text-sm text-fg-muted">
          Noch keine eingecheckten Teilnehmer. Das Bracket kann erst nach dem
          Check-in generiert werden.
        </p>
      ) : (
        <>
          <SeedingClient tournamentId={tournamentId} participants={participants} />
          {hasMatches && (
            <p className="text-sm text-fg-muted">
              Ein geändertes Seeding wirkt erst, wenn das Bracket darunter neu
              generiert wird — der bestehende Spielplan bleibt bis dahin, wie er
              ist.
            </p>
          )}
        </>
      )}
    </section>
  );
}
