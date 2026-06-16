"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";

// The camera scanner touches `navigator.mediaDevices`, which doesn't exist
// during SSR/build. Loading it with ssr:false keeps the page build-safe and
// defers all browser-API access to the client after mount.
const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
  { ssr: false },
);

interface ScannerClientProps {
  tournamentId: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "success"; name: string }
  | { kind: "unknown" }
  | { kind: "consent" }
  | { kind: "error" };

/** Map a check_in RPC failure to a friendly German message (no raw DB leak). */
function isConsentError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  return message.toLowerCase().includes("consent");
}

// Don't re-fire on the same QR while it stays in frame: ignore a token we just
// processed for this window.
const DEBOUNCE_MS = 2500;

export function ScannerClient({ tournamentId }: ScannerClientProps) {
  void tournamentId; // staff RLS already scopes participants; token lookup is global by qr_token
  const [supabase] = useState<SupabaseClient<Database>>(() => createClient());
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Token we are currently/last processing + when, so the same QR held in
  // frame doesn't spam the RPC.
  const lastTokenRef = useRef<string | null>(null);
  const lastAtRef = useRef<number>(0);
  const busyRef = useRef(false);

  const handleToken = useCallback(
    async (token: string) => {
      const now = Date.now();
      if (busyRef.current) return;
      if (
        lastTokenRef.current === token &&
        now - lastAtRef.current < DEBOUNCE_MS
      ) {
        return;
      }
      lastTokenRef.current = token;
      lastAtRef.current = now;
      busyRef.current = true;

      try {
        const { data: participant, error: lookupErr } = await supabase
          .from("participants")
          .select("id, display_name")
          .eq("qr_token", token)
          .maybeSingle();

        if (lookupErr || !participant) {
          setStatus({ kind: "unknown" });
          return;
        }

        const { error: rpcErr } = await supabase.rpc("check_in", {
          p_participant_id: participant.id,
          p_method: "qr_scan",
        });

        if (rpcErr) {
          // check_in is idempotent for an already-checked-in participant, so a
          // failure here is a real error — most importantly missing consent.
          setStatus(
            isConsentError(rpcErr) ? { kind: "consent" } : { kind: "error" },
          );
          return;
        }

        setStatus({ kind: "success", name: participant.display_name });
      } catch (e) {
        setStatus(isConsentError(e) ? { kind: "consent" } : { kind: "error" });
      } finally {
        busyRef.current = false;
      }
    },
    [supabase],
  );

  const onScan = useCallback(
    (codes: { rawValue: string }[]) => {
      const value = codes[0]?.rawValue?.trim();
      if (value) void handleToken(value);
    },
    [handleToken],
  );

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <div className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
          QR-Scanner
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Richte die Kamera auf den persönlichen QR-Code des Teilnehmers.
        </p>
      </div>

      <div
        className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-line bg-surface-2"
        data-testid="qr-scanner"
      >
        <Scanner
          onScan={onScan}
          scanDelay={500}
          constraints={{ facingMode: "environment" }}
          // Re-scan even the same QR so a debounced token can fire again;
          // our own debounce above governs the RPC rate.
          allowMultiple
        />
      </div>

      <div aria-live="polite" className="min-h-6 text-center text-sm">
        {status.kind === "idle" && (
          <span className="text-fg-muted">Bereit zum Scannen…</span>
        )}
        {status.kind === "success" && (
          <span className="font-display font-medium text-lime">
            ✅ {status.name} eingecheckt
          </span>
        )}
        {status.kind === "unknown" && (
          <span className="text-live">QR nicht erkannt</span>
        )}
        {status.kind === "consent" && (
          <span className="text-live">Einwilligung fehlt</span>
        )}
        {status.kind === "error" && (
          <span className="text-live">Check-in fehlgeschlagen</span>
        )}
      </div>
    </div>
  );
}
