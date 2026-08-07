"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IScannerError, ScannerErrorKind } from "@yudiel/react-qr-scanner";

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

/**
 * Turn a camera failure into something the person at the check-in desk can act
 * on. Without this the scanner just sits there showing its frame overlay and
 * never starts, which is indistinguishable from a broken page.
 */
export function cameraErrorMessage(kind: ScannerErrorKind): string {
  switch (kind) {
    case "permission-denied":
      return "Kamerazugriff ist blockiert. Erlaube ihn über das Symbol links in der Adressleiste und lade die Seite neu.";
    case "no-camera":
      return "Es wurde keine Kamera gefunden. Schließe eine an oder nutze die Anwesenheitsliste unten.";
    case "in-use":
      return "Die Kamera wird gerade von einem anderen Programm benutzt. Schließe es und starte den Scanner neu.";
    case "overconstrained":
      return "Diese Kamera steht nicht zur Verfügung. Wähle unten eine andere aus.";
    case "insecure-context":
      return "Die Kamera funktioniert nur über HTTPS.";
    case "unsupported":
      return "Dieser Browser unterstützt keinen Kamerazugriff. Nimm Chrome, Edge oder Safari.";
    case "aborted":
      return "Die Kamera hat zu lange zum Starten gebraucht. Starte den Scanner neu oder wähle eine andere Kamera.";
    default:
      return "Die Kamera konnte nicht gestartet werden. Starte den Scanner neu oder wähle eine andere Kamera.";
  }
}

/**
 * Label for a camera in the picker. Browsers hide device labels until camera
 * permission has been granted once, so fall back to a position instead of
 * rendering blank entries.
 */
export function cameraLabel(device: MediaDeviceInfo, index: number): string {
  return device.label.trim() || `Kamera ${index + 1}`;
}

/** Remembers the picked camera per browser, so a scan station keeps its lens. */
const CAMERA_KEY = "turnierapp.checkin.cameraId";

// Phones used as ticket scanners expose several rear lenses, and the browser's
// default pick is often the ultra-wide, which cannot focus on a QR held close.
// Laptops with a second USB webcam have the same problem in reverse. So the desk
// gets to choose, and the choice sticks.
//
// The library ships an equivalent `useDevices`, but importing it would pull the
// whole scanner package into the server bundle and defeat the ssr:false above,
// so this stays hand-rolled.
function useCameras(): [MediaDeviceInfo[], () => void] {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    let cancelled = false;
    const read = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setCameras(devices.filter((d) => d.kind === "videoinput"));
        }
      } catch {
        // Best-effort — the scanner still runs on the browser's default camera.
      }
    };

    void read();
    navigator.mediaDevices.addEventListener?.("devicechange", read);

    // Android hands out the full camera list only once the page holds camera
    // permission, and answering that prompt takes as long as the person takes.
    // A single delayed re-read raced them and left a scan handset showing one
    // camera forever, with no way to reach its dedicated scan lens.
    let permission: PermissionStatus | null = null;
    void navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        permission = status;
        status.addEventListener("change", read);
      })
      .catch(() => {
        // Firefox rejects the camera descriptor; the retries below cover it.
      });

    // Backstop for browsers with neither signal, spread out far enough to
    // outlast a permission dialog.
    const retries = [1500, 4000, 8000, 15000].map((ms) =>
      setTimeout(() => void read(), ms),
    );

    return () => {
      cancelled = true;
      retries.forEach(clearTimeout);
      permission?.removeEventListener("change", read);
      navigator.mediaDevices.removeEventListener?.("devicechange", read);
    };
  }, [reloads]);

  return [cameras, () => setReloads((n) => n + 1)];
}

// Don't re-fire on the same QR while it stays in frame: ignore a token we just
// processed for this window.
const DEBOUNCE_MS = 2500;

export function ScannerClient({ tournamentId }: ScannerClientProps) {
  void tournamentId; // staff RLS already scopes participants; token lookup is global by qr_token
  const [supabase] = useState<SupabaseClient<Database>>(() => createClient());
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const [cameras, reloadCameras] = useCameras();
  const [deviceId, setDeviceId] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  // Bumping this remounts the Scanner, which is how a retry restarts the camera.
  const [attempt, setAttempt] = useState(0);

  // Restore the previously picked camera once the device list is known.
  useEffect(() => {
    if (deviceId || cameras.length === 0) return;
    const saved = localStorage.getItem(CAMERA_KEY);
    if (saved && cameras.some((c) => c.deviceId === saved)) setDeviceId(saved);
  }, [cameras, deviceId]);

  function pickCamera(id: string) {
    setDeviceId(id);
    setCameraError(null);
    if (id) localStorage.setItem(CAMERA_KEY, id);
    else localStorage.removeItem(CAMERA_KEY);
    setAttempt((n) => n + 1);
  }

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

  const onError = useCallback((error: IScannerError) => {
    setCameraError(cameraErrorMessage(error.kind));
  }, []);

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
          key={`${deviceId}-${attempt}`}
          onScan={onScan}
          onError={onError}
          scanDelay={500}
          // An explicit pick wins; otherwise ask for a rear camera and let the
          // browser fall back to whatever it has (a laptop only has a front one).
          constraints={
            deviceId
              ? { deviceId: { exact: deviceId } }
              : { facingMode: "environment" }
          }
          // The 3s default trips USB webcams and multi-lens phones that are
          // still warming up, and a timeout leaves a dead frame behind.
          startTimeoutMs={8000}
          // Re-scan even the same QR so a debounced token can fire again;
          // our own debounce above governs the RPC rate.
          allowMultiple
        />
      </div>

      {/* Always rendered, never gated on the list already being complete: on a
          scan handset the extra lenses appear only after the permission prompt
          is answered, and hiding the control until then is what stranded one. */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="camera-pick"
          className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim"
        >
          Kamera
        </label>
        <div className="flex gap-2">
          <select
            id="camera-pick"
            value={deviceId}
            onChange={(e) => pickCamera(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg-muted focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Automatisch (Rückkamera)</option>
            {cameras.map((cam, i) => (
              <option key={cam.deviceId} value={cam.deviceId}>
                {cameraLabel(cam, i)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={reloadCameras}
            className="shrink-0 rounded-lg border border-line px-3 py-2 font-display text-[10px] font-bold uppercase tracking-wider text-fg-muted transition-colors hover:text-ink"
          >
            Neu suchen
          </button>
        </div>
        <p className="text-xs text-fg-muted">
          {cameras.length > 1
            ? "Scannt eine Linse schlecht aus der Nähe, nimm eine andere. Die Wahl bleibt auf diesem Gerät gespeichert."
            : "Erst nach erlaubtem Kamerazugriff zeigt das Gerät alle Linsen. Fehlt eine, tippe auf „Neu suchen“."}
        </p>
      </div>

      {cameraError && (
        <div className="flex flex-col gap-2 rounded-xl border border-live/40 bg-live/10 p-3">
          <p className="text-sm text-live" role="alert">
            {cameraError}
          </p>
          <button
            type="button"
            onClick={() => {
              setCameraError(null);
              setAttempt((n) => n + 1);
            }}
            className="w-fit rounded-[8px] border border-line px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-fg-muted transition-colors hover:text-ink"
          >
            Scanner neu starten
          </button>
        </div>
      )}

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
