"use client";

import { QrCode } from "@/components/qr-code";
import { SectionLabel } from "@/components/brand/participant-shell";
import { teamJoinUrl } from "./join-code";

/**
 * Der Beitritts-Code als QR — der zweite Weg zum selben Team.
 *
 * Sechs Zeichen ueber den Tisch zu buchstabieren ist fuer Kinder die
 * Bruchstelle: bei der ersten Live-Runde standen 9 von 11 am Ende ohne Team.
 * Der QR nimmt das Abtippen raus, und er braucht keinen Scanner in dieser App —
 * jede Handykamera oeffnet den Link, und der landet direkt im Beitritt.
 *
 * Kein Ersatz fuer den vorgelesenen Code: wer kein Handy dabei hat oder dessen
 * Kamera streikt, bekommt ihn weiterhin aus der JoinCodeCard darueber.
 */
export function JoinQrCard({
  tournamentId,
  code,
}: {
  tournamentId: string;
  code: string;
}) {
  // Beim Serverrendern gibt es kein origin. Erreichbar ist das hier nicht — der
  // Team-Schritt haengt an einem Effekt, der Server sieht nur "Einen Moment…" —
  // aber ein QR auf einen halben Link waere schlimmer als gar keiner.
  const url = teamJoinUrl(tournamentId, code);
  if (!url) return null;

  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <SectionLabel className="mb-4 text-center">
        Oder scannen lassen
      </SectionLabel>
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-2xl bg-white p-4">
          <QrCode value={url} ariaLabel={`Beitritts-QR für Code ${code}`} />
        </div>
        <p className="text-center text-sm text-fg-muted">
          Dein Kumpel scannt diesen Code mit der Handy-Kamera und landet direkt
          im Beitritt.
        </p>
      </div>
    </div>
  );
}
