"use client";

import { useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { requiredConsentMethod } from "@/lib/consent";
import { photoConsentText, type ConsentOrg } from "@/lib/consent-text";
import { friendlyDbError, isUniqueViolation } from "@/lib/db-errors";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ParticipantShell } from "@/components/brand/participant-shell";

/** Map a consents-insert failure to a safe German message (no raw DB leak). */
function consentSaveError(error: unknown): string {
  // unique(participant_id) — consent for this registration already exists.
  if (isUniqueViolation(error)) {
    return "Für diese Anmeldung wurde bereits eine Fotoerlaubnis erteilt.";
  }
  return friendlyDbError(
    error,
    "Die Fotoerlaubnis konnte nicht gespeichert werden. Bitte versuche es erneut.",
  );
}

interface PhotoConsentStepProps {
  supabase: SupabaseClient<Database>;
  participantId: string;
  birthdate: string;
  participantName: string;
  org: ConsentOrg;
  getUid: () => Promise<string>;
  onDone: () => void;
}

/**
 * Die Fotoerlaubnis — freiwillig. Wer sie nicht erteilt, geht mit "Ohne
 * Fotoerlaubnis fortfahren" weiter und ist genauso angemeldet; es wird dann
 * schlicht keine consents-Zeile geschrieben.
 *
 * Der angezeigte Wortlaut wird als consents.consent_text mitgespeichert: welcher
 * Satz zugestimmt wurde, lässt sich später nicht rekonstruieren.
 */
export function PhotoConsentStep({
  supabase,
  participantId,
  birthdate,
  participantName,
  org,
  getUid,
  onDone,
}: PhotoConsentStepProps) {
  const method = useMemo(
    () => requiredConsentMethod(birthdate, new Date()),
    [birthdate],
  );
  const grantor = method === "signature" ? "guardian" : "self";

  const consentText = useMemo(
    () => photoConsentText(org, grantor, participantName),
    [org, grantor, participantName],
  );

  const [grantorName, setGrantorName] = useState(
    method === "checkbox" ? participantName : "",
  );
  const [address, setAddress] = useState("");
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sigRef = useRef<SignaturePadHandle>(null);

  const canSubmit =
    grantorName.trim().length > 0 &&
    address.trim().length > 0 &&
    (method === "checkbox" ? checked : true);

  async function handleSubmit() {
    setError(null);

    if (grantorName.trim().length === 0) {
      setError("Bitte Namen angeben.");
      return;
    }

    if (address.trim().length === 0) {
      setError("Bitte Anschrift angeben.");
      return;
    }

    if (method === "checkbox" && !checked) {
      setError("Bitte der Fotoerlaubnis zustimmen.");
      return;
    }

    setSubmitting(true);
    try {
      const uid = await getUid();

      if (method === "signature") {
        if (!sigRef.current || sigRef.current.isEmpty()) {
          setError("Bitte unterschreiben.");
          setSubmitting(false);
          return;
        }
        const blob = await sigRef.current.toBlob();
        if (!blob) {
          setError("Unterschrift konnte nicht gelesen werden.");
          setSubmitting(false);
          return;
        }
        const path = `${uid}/${participantId}.png`;
        const { error: upErr } = await supabase.storage
          .from("consent-signatures")
          .upload(path, blob, {
            contentType: "image/png",
            upsert: true,
          });
        if (upErr) {
          throw new Error(
            friendlyDbError(
              upErr,
              "Die Unterschrift konnte nicht gespeichert werden. Bitte versuche es erneut.",
            ),
          );
        }

        const { error: cErr } = await supabase.from("consents").insert({
          participant_id: participantId,
          grantor: "guardian",
          grantor_name: grantorName.trim(),
          method: "signature",
          signature_path: path,
          address: address.trim(),
          consent_text: consentText,
        });
        if (cErr) throw new Error(consentSaveError(cErr));
      } else {
        const { error: cErr } = await supabase.from("consents").insert({
          participant_id: participantId,
          grantor: "self",
          grantor_name: grantorName.trim(),
          method: "checkbox",
          address: address.trim(),
          consent_text: consentText,
        });
        if (cErr) throw new Error(consentSaveError(cErr));
      }

      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
      setSubmitting(false);
    }
  }

  const addressField = (
    <div className="flex flex-col gap-2">
      <Label htmlFor="consentAddress">Wohnhaft (Anschrift)</Label>
      <Input
        id="consentAddress"
        value={address}
        autoComplete="street-address"
        placeholder="Straße Hausnummer, PLZ Ort"
        onChange={(e) => setAddress(e.target.value)}
      />
    </div>
  );

  return (
    <ParticipantShell
      eyebrow="/ Fotoerlaubnis · optional"
      heading="Fotoerlaubnis"
      subheading={
        method === "signature"
          ? "Freiwillig. Soll die teilnehmende Person auf Fotos zu sehen sein dürfen, unterschreibt ein Erziehungsberechtigter — sonst einfach überspringen."
          : "Freiwillig. Du kannst sie erteilen oder ohne sie fortfahren — angemeldet bist du in beiden Fällen."
      }
    >
      <div className="rounded-2xl border border-line bg-surface p-6 sm:p-7">
        <div className="flex flex-col gap-5">
          {method === "checkbox" ? (
            <>
              <Label className="items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-4">
                {/* No aria-label: the wrapping Label already names it, and Base UI
                    concatenates the two into a stuttering announcement. */}
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) => setChecked(value)}
                />
                <span className="leading-snug text-fg-muted">
                  {consentText}
                </span>
              </Label>

              <div className="flex flex-col gap-2">
                <Label htmlFor="grantorName">Name (zur Bestätigung)</Label>
                <Input
                  id="grantorName"
                  value={grantorName}
                  onChange={(e) => setGrantorName(e.target.value)}
                />
              </div>

              {addressField}
            </>
          ) : (
            <>
              <div className="rounded-xl border border-warn/35 bg-warn/[0.08] p-4">
                <div className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-warn">
                  ⚠ Minderjährig — nur mit Eltern-Unterschrift
                </div>
                <p className="text-sm leading-snug text-fg-muted">
                  {consentText}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="grantorName">
                  Name des Erziehungsberechtigten
                </Label>
                <Input
                  id="grantorName"
                  value={grantorName}
                  onChange={(e) => setGrantorName(e.target.value)}
                />
              </div>

              {addressField}

              <div className="flex flex-col gap-2">
                <Label>Unterschrift des Erziehungsberechtigten</Label>
                <SignaturePad
                  ref={sigRef}
                  ariaLabel="Unterschrift des Erziehungsberechtigten"
                />
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            className="mt-1 h-12 font-display text-sm font-bold uppercase tracking-wider"
          >
            {submitting ? "Wird gespeichert…" : "Fotoerlaubnis erteilen"}
          </Button>

          {/* Gleichwertiger Weg, kein Notausgang: ohne Erlaubnis ist die
              Anmeldung genauso fertig. */}
          <Button
            type="button"
            variant="ghost"
            onClick={onDone}
            disabled={submitting}
            className="h-11 font-display text-xs font-bold uppercase tracking-wider"
          >
            Ohne Fotoerlaubnis fortfahren
          </Button>
        </div>
      </div>
    </ParticipantShell>
  );
}
