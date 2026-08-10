"use client";

import { useState } from "react";

import { QrCode } from "@/components/qr-code";
import { QrActions, participantRecoveryUrl } from "@/components/qr-actions";
import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface SaveAccessDialogProps {
  tournamentId: string;
  qrToken: string;
  onDone: () => void;
}

/**
 * Blocking gate shown once, right after registration: the participant has to
 * confirm they saved their QR or recovery link before the success screen
 * becomes usable.
 *
 * It exists because that link is the only way back to /me from another device —
 * children are usually registered on a parent's phone, and the parent leaves.
 * A dismissible hint is what we had; people clicked past it.
 *
 * Deliberately not dismissible: no ✕, no Close part, and `open` is a controlled
 * constant `true` with no `onOpenChange`, which is what makes Escape inert (see
 * ui/alert-dialog).
 *
 * The flip side is that Base UI then never runs its own close/unmount step —
 * verified in the browser: after acking, the popup kept `display: block` at full
 * height over the success screen, with the background already interactive again.
 * So the parent unmounts this component instead of toggling `open`; React's
 * unmount is what takes the dialog away, and Base UI's cleanup still restores
 * focus and clears `inert`.
 *
 * Equally deliberate: nothing here is gated on a *successful* download, share or
 * clipboard write. All three fail on some devices (iOS in-app webviews), and a
 * modal nobody can leave would be far worse than an unsaved link. The checkbox
 * is a self-attestation, the QR is on screen to photograph, and the raw URL is
 * selectable text as a last resort.
 */
export function SaveAccessDialog({
  tournamentId,
  qrToken,
  onDone,
}: SaveAccessDialogProps) {
  const [acked, setAcked] = useState(false);
  const recoveryUrl = participantRecoveryUrl(tournamentId, qrToken);

  function handleContinue() {
    // Belt and braces — the rule must not live only on the disabled attribute.
    if (!acked) return;
    onDone();
  }

  return (
    <AlertDialog open>
      <AlertDialogPopup>
        <div className="flex flex-col gap-4">
          <AlertDialogTitle>Sichere deinen Zugang</AlertDialogTitle>

          <AlertDialogDescription>
            Ohne QR-Code oder Link kommst du auf einem anderen Handy nicht mehr
            an deinen Status. Sichere jetzt beides — das dauert 10 Sekunden.
          </AlertDialogDescription>

          {/* On screen inside the dialog, because the dialog covers the copy
              behind it — and a screenshot is how most people actually save it. */}
          <div className="flex justify-center">
            <div className="rounded-2xl bg-white p-4">
              <QrCode value={qrToken} ariaLabel="Dein Check-in-QR" />
            </div>
          </div>

          <QrActions
            variant="bare"
            tournamentId={tournamentId}
            qrToken={qrToken}
          />

          <div className="rounded-xl border border-line bg-surface-2/60 p-3">
            <p className="mb-1 text-xs text-fg-dim">
              Klappt Teilen und Herunterladen nicht? Schreib dir diesen Link ab:
            </p>
            <p className="select-all break-all text-xs text-fg-muted">
              {recoveryUrl}
            </p>
          </div>

          <Label className="items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-4">
            {/* No aria-label: the wrapping Label already names it, and Base UI
                concatenates the two into a stuttering announcement. */}
            <Checkbox
              checked={acked}
              onCheckedChange={(value) => setAcked(value)}
            />
            <span className="leading-snug text-fg-muted">
              Ich habe den QR-Code oder den Link gespeichert
            </span>
          </Label>

          <Button
            type="button"
            onClick={handleContinue}
            disabled={!acked}
            className="h-12 font-display text-sm font-bold uppercase tracking-wider"
          >
            Weiter
          </Button>
        </div>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
