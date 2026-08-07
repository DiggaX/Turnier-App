"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { renameOrg } from "./actions";

type Props = {
  name: string;
  slug: string;
};

export function OrgSettings({ name, slug }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = value.trim() !== name && value.trim().length > 0;

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
    </section>
  );
}
