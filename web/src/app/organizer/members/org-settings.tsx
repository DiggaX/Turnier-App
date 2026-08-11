"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { renameOrg, setOrgAddress, setOrgCarryOver } from "./actions";

type Props = {
  name: string;
  slug: string;
  address: string | null;
  allowCarryOver: boolean;
};

export function OrgSettings({ name, slug, address, allowCarryOver }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [addressValue, setAddressValue] = useState(address ?? "");
  const [addressPending, startAddressTransition] = useTransition();
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressSaved, setAddressSaved] = useState(false);

  // Kein Speichern-Knopf: ein Häkchen hat keinen "tippt noch"-Zustand, bei dem
  // man auf das Absenden warten müsste. Optimistisch setzen, bei Fehler zurück.
  const [carryOver, setCarryOver] = useState(allowCarryOver);
  const [carryOverPending, startCarryOverTransition] = useTransition();
  const [carryOverError, setCarryOverError] = useState<string | null>(null);

  const dirty = value.trim() !== name && value.trim().length > 0;
  const addressDirty = addressValue.trim() !== (address ?? "").trim();

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await renameOrg(value);
      if ("error" in res) {
        setError(res.error);
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  function handleCarryOver(next: boolean) {
    setCarryOverError(null);
    setCarryOver(next);
    startCarryOverTransition(async () => {
      const res = await setOrgCarryOver(next);
      if ("error" in res) {
        setCarryOver(!next); // zurückdrehen, sonst zeigt der Haken etwas Falsches
        setCarryOverError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleSaveAddress() {
    setAddressError(null);
    setAddressSaved(false);
    startAddressTransition(async () => {
      const res = await setOrgAddress(addressValue);
      if ("error" in res) {
        setAddressError(res.error);
      } else {
        setAddressSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <section className="mb-8 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
        Organisation
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="org-name">Name</Label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Input
            id="org-name"
            value={value}
            maxLength={80}
            disabled={pending}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            className="sm:flex-1"
          />
          <Button
            type="button"
            size="lg"
            disabled={pending || !dirty}
            onClick={handleSave}
            className="font-display text-xs font-bold uppercase tracking-wider"
          >
            {pending ? "Speichert…" : "Speichern"}
          </Button>
        </div>

        <p className="text-xs text-fg-muted">
          Wird Besuchern auf der Startseite und über deinen Turnieren angezeigt.
          Die öffentliche Adresse <span className="text-fg-dim">/o/{slug}</span>{" "}
          bleibt unverändert, damit verteilte Links und QR-Codes weiter
          funktionieren.
        </p>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="text-sm text-lime" role="status">
            Gespeichert ✓
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2 border-t border-line pt-6">
        <Label htmlFor="org-address">Anschrift</Label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Input
            id="org-address"
            value={addressValue}
            maxLength={200}
            disabled={addressPending}
            placeholder="Zur Strandpromenade 4, 23769 Fehmarn"
            onChange={(e) => {
              setAddressValue(e.target.value);
              setAddressSaved(false);
            }}
            className="sm:flex-1"
          />
          <Button
            type="button"
            size="lg"
            disabled={addressPending || !addressDirty}
            onClick={handleSaveAddress}
            className="font-display text-xs font-bold uppercase tracking-wider"
          >
            {addressPending ? "Speichert…" : "Speichern"}
          </Button>
        </div>

        <p className="text-xs text-fg-muted">
          Steht als verantwortliche Stelle im Text der Fotoerlaubnis, den
          Teilnehmer bei der Anmeldung bestätigen. Ohne Anschrift nennt der Text
          nur den Namen.
        </p>

        {addressError && (
          <p className="text-sm text-destructive" role="alert">
            {addressError}
          </p>
        )}
        {addressSaved && !addressError && (
          <p className="text-sm text-lime" role="status">
            Gespeichert ✓
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2 border-t border-line pt-6">
        {/* Kein aria-label: das umschließende Label benennt die Checkbox bereits,
            und Base UI setzt zusätzlich aria-labelledby — beides zusammen ergibt
            eine gestotterte Ansage. */}
        <Label className="items-start gap-3">
          <Checkbox
            checked={carryOver}
            disabled={carryOverPending}
            onCheckedChange={handleCarryOver}
          />
          <span className="leading-snug">
            QR-Codes früherer Turniere am Einlass zulassen
          </span>
        </Label>

        <p className="text-xs text-fg-muted">
          Kommt jemand mit dem Code vom letzten Mal, kann die Turnierleitung ihn
          in das laufende Turnier übernehmen und sofort einchecken. Name,
          Gamertag und Geburtsdatum werden kopiert — die{" "}
          <strong>Fotoerlaubnis nicht</strong>, die gilt nur für das Turnier,
          für das sie erteilt wurde. Ohne Häkchen zeigt der Scanner einen
          fremden Code lediglich an.
        </p>

        {carryOverError && (
          <p className="text-sm text-destructive" role="alert">
            {carryOverError}
          </p>
        )}
      </div>
    </section>
  );
}
