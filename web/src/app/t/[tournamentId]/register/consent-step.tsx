"use client";

import { useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { requiredConsentMethod } from "@/lib/consent";
import { friendlyDbError, isUniqueViolation } from "@/lib/db-errors";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const CONSENT_TEXT =
  "Ich willige in Bild/Ton/Video-Aufnahmen und deren Nutzung für Social Media/Dritte ein";

/** Map a consents-insert failure to a safe German message (no raw DB leak). */
function consentSaveError(error: unknown): string {
  // unique(participant_id) — consent for this registration already exists.
  if (isUniqueViolation(error)) {
    return "Für diese Anmeldung wurde bereits eine Einwilligung erteilt.";
  }
  return friendlyDbError(
    error,
    "Die Einwilligung konnte nicht gespeichert werden. Bitte versuche es erneut.",
  );
}

interface ConsentStepProps {
  supabase: SupabaseClient<Database>;
  participantId: string;
  birthdate: string;
  participantName: string;
  getUid: () => Promise<string>;
  onDone: () => void;
}

export function ConsentStep({
  supabase,
  participantId,
  birthdate,
  participantName,
  getUid,
  onDone,
}: ConsentStepProps) {
  const method = useMemo(
    () => requiredConsentMethod(birthdate, new Date()),
    [birthdate],
  );

  const [grantorName, setGrantorName] = useState(
    method === "checkbox" ? participantName : "",
  );
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sigRef = useRef<SignaturePadHandle>(null);

  const canSubmit =
    grantorName.trim().length > 0 && (method === "checkbox" ? checked : true);

  async function handleSubmit() {
    setError(null);

    if (grantorName.trim().length === 0) {
      setError("Bitte Namen angeben.");
      return;
    }

    if (method === "checkbox" && !checked) {
      setError("Bitte der Einwilligung zustimmen.");
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
        });
        if (cErr) throw new Error(consentSaveError(cErr));
      } else {
        const { error: cErr } = await supabase.from("consents").insert({
          participant_id: participantId,
          grantor: "self",
          grantor_name: grantorName.trim(),
          method: "checkbox",
        });
        if (cErr) throw new Error(consentSaveError(cErr));
      }

      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Einwilligung</CardTitle>
        <CardDescription>
          {method === "signature"
            ? "Da die teilnehmende Person minderjährig ist, ist die Unterschrift eines Erziehungsberechtigten erforderlich."
            : "Bitte bestätige die Einwilligung in Medienaufnahmen."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {method === "checkbox" ? (
            <>
              <Label className="items-start gap-3">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) => setChecked(value)}
                  aria-label="Einwilligung erteilen"
                />
                <span className="leading-snug">{CONSENT_TEXT}</span>
              </Label>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="grantorName">Name (zur Bestätigung)</Label>
                <Input
                  id="grantorName"
                  value={grantorName}
                  onChange={(e) => setGrantorName(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm leading-snug">{CONSENT_TEXT}</p>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="grantorName">
                  Name des Erziehungsberechtigten
                </Label>
                <Input
                  id="grantorName"
                  value={grantorName}
                  onChange={(e) => setGrantorName(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
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
          >
            {submitting ? "Wird gespeichert…" : "Einwilligung abschließen"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
