"use client";

import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/brand/participant-shell";

interface QrActionsProps {
  /** The tournament this participant belongs to (for the recovery URL). */
  tournamentId: string;
  /** The participant's check-in QR token — also doubles as the recovery credential. */
  qrToken: string;
}

/**
 * "Save this for later" actions for a participant's QR: download the QR as a
 * PNG, and copy/share a recovery link back to `/me` that works even without
 * the original browser session (see get_participant_by_qr_token RPC).
 */
export function QrActions({ tournamentId, qrToken }: QrActionsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  const recoveryUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/t/${tournamentId}/me?token=${qrToken}`
      : "";

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "check-in-qr.png";
    link.click();
  }

  async function handleShare() {
    if (!recoveryUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Mein Status", url: recoveryUrl });
        return;
      } catch {
        // user cancelled the share sheet — fall through to copy
      }
    }
    await handleCopy();
  }

  async function handleCopy() {
    if (!recoveryUrl) return;
    try {
      await navigator.clipboard.writeText(recoveryUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — nothing more we can do here
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <SectionLabel className="mb-3">Für später sichern</SectionLabel>
      <p className="mb-4 text-sm text-fg-muted">
        Lade deinen QR-Code herunter oder speichere den Link — damit findest du
        deinen Status auch auf einem anderen Gerät wieder.
      </p>

      {/* Hidden canvas purely for PNG export; the visible QR is rendered separately. */}
      <span className="hidden">
        <QRCodeCanvas ref={canvasRef} value={qrToken} size={512} level="H" />
      </span>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={handleDownload}
          className="h-11 flex-1"
        >
          QR herunterladen
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleShare()}
          className="h-11 flex-1"
        >
          {copied ? "Link kopiert ✓" : "Link teilen"}
        </Button>
      </div>
    </div>
  );
}
