"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { QrCode } from "@/components/qr-code";
import { Button } from "@/components/ui/button";
import { deviceLabel } from "@/lib/auth/device-label";
import { formatShortDateTime } from "@/lib/format-date";

import { createPairing, revokeSession } from "./device-actions";

export type SessionRow = {
  id: string;
  created_at: string;
  last_seen_at: string | null;
  /** From the pairing row — null for a session that came from e-mail or password. */
  user_agent: string | null;
  paired: boolean;
  is_current: boolean;
};

function Countdown({ until, onDone }: { until: number; onDone: () => void }) {
  const [left, setLeft] = useState(() => until - Date.now());

  useEffect(() => {
    const t = setInterval(() => {
      const remaining = until - Date.now();
      setLeft(remaining);
      if (remaining <= 0) onDone();
    }, 500);
    return () => clearInterval(t);
  }, [until, onDone]);

  const secs = Math.max(0, Math.ceil(left / 1000));
  return (
    <span className="tabular-nums">
      {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
    </span>
  );
}

export function DeviceLinking({
  sessions,
  origin,
}: {
  sessions: SessionRow[];
  origin: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pairing, setPairing] = useState<{ url: string; until: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await createPairing();
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setPairing({
        url: `${origin}/link/${res.token}`,
        until: new Date(res.expiresAt).getTime(),
      });
    });
  }

  function disconnect(id: string, label: string, isCurrent: boolean) {
    const question = isCurrent
      ? "Das ist dieses Gerät. Du wirst hier abgemeldet. Fortfahren?"
      : `„${label}" wirklich trennen?`;
    if (!window.confirm(question)) return;
    setError(null);
    startTransition(async () => {
      const res = await revokeSession(id);
      if ("error" in res) setError(res.error);
      else if (isCurrent) router.push("/login");
      else router.refresh();
    });
  }

  return (
    <section className="mb-8 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
        Geräte
      </div>

      {pairing ? (
        <div className="mb-6 flex flex-col items-center gap-3 rounded-xl border border-cyan/30 bg-cyan/[0.05] p-5">
          <div className="rounded-2xl bg-white p-4">
            <QrCode value={pairing.url} ariaLabel="QR-Code zum Anmelden" />
          </div>
          <p className="text-center text-sm text-fg-muted">
            Mit der Handy-Kamera scannen — das Handy ist danach angemeldet.
          </p>
          <p className="font-display text-xs uppercase tracking-[0.12em] text-cyan">
            Gültig noch{" "}
            <Countdown until={pairing.until} onDone={() => setPairing(null)} />
          </p>
          <button
            type="button"
            onClick={() => setPairing(null)}
            className="font-display text-[10px] uppercase tracking-wider text-fg-muted hover:text-ink"
          >
            Ausblenden
          </button>
        </div>
      ) : (
        <div className="mb-6 flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            disabled={pending}
            onClick={generate}
            className="w-fit font-display text-xs font-bold uppercase tracking-wider"
          >
            {pending ? "Erzeuge…" : "Handy verbinden"}
          </Button>
          <p className="text-xs text-fg-muted">
            Erzeugt einen QR-Code, der 2 Minuten gilt und nur einmal
            funktioniert. Wer ihn scannt, ist als du angemeldet — zeig ihn also
            niemandem sonst.
          </p>
        </div>
      )}

      <div className="mb-2 font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
        Angemeldete Geräte
      </div>
      <ul className="flex flex-col gap-2">
        {sessions.map((s) => {
          const label = deviceLabel(s.user_agent);
          return (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-bg/40 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="font-medium text-ink">
                  {label}
                  {s.is_current && (
                    <span className="ml-2 rounded-full bg-lime/20 px-1.5 py-0.5 font-display text-[9px] uppercase tracking-[0.12em] text-lime">
                      dieses Gerät
                    </span>
                  )}
                </div>
                <div className="text-xs text-fg-muted">
                  {s.paired ? "per QR verbunden · " : ""}
                  zuletzt aktiv{" "}
                  {formatShortDateTime(s.last_seen_at ?? s.created_at)}
                </div>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => disconnect(s.id, label, s.is_current)}
                className="rounded-[8px] border border-live/40 bg-live/10 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-live transition-colors hover:bg-live/20 disabled:opacity-50"
              >
                Trennen
              </button>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
