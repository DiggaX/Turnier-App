"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Barcode, Camera, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  IScannerError,
  IScannerHandle,
  ScannerErrorKind,
} from "@yudiel/react-qr-scanner";

import { createClient } from "@/lib/supabase/client";
import type { CheckinMethod, Database } from "@/lib/database.types";
import { playScanSound } from "@/lib/scan-feedback";

import { ScanDiagnostics } from "./scan-diagnostics";
import { ScanResultCard, type ScanStatus } from "./scan-result-card";
import { useCameras } from "./use-cameras";
import { useHardwareScan } from "./use-hardware-scan";

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

type Status = ScanStatus;

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

/** A door station keeps the reader it was set up with across reloads. */
const MODE_KEY = "turnierapp.checkin.scanMode";

type ScanMode = "camera" | "hardware";

const MODES: { id: ScanMode; label: string; Icon: LucideIcon }[] = [
  { id: "camera", label: "Kamera", Icon: Camera },
  { id: "hardware", label: "Handscanner", Icon: Barcode },
];

/**
 * `zoom` is missing from the DOM typings — it is widely implemented but not in
 * the standard track constraints, and it is the whole point on a handset whose
 * second rear lens is a telephoto.
 */
type ZoomRange = { min: number; max: number; step: number };

function zoomCapability(track: MediaStreamTrack): ZoomRange | null {
  const caps = track.getCapabilities?.() as
    | (MediaTrackCapabilities & { zoom?: ZoomRange })
    | undefined;
  if (!caps?.zoom || caps.zoom.max <= caps.zoom.min) return null;
  return { ...caps.zoom, step: caps.zoom.step || 0.1 };
}

function setTrackZoom(track: MediaStreamTrack | undefined, value: number) {
  void track
    ?.applyConstraints({
      advanced: [{ zoom: value }],
    } as unknown as MediaTrackConstraints)
    .catch(() => undefined);
}

// Don't re-fire on the same QR while it stays in frame: ignore a token we just
// processed for this window.
const DEBOUNCE_MS = 2500;

export function ScannerClient({ tournamentId }: ScannerClientProps) {
  void tournamentId; // staff RLS already scopes participants; token lookup is global by qr_token
  const router = useRouter();
  const [supabase] = useState<SupabaseClient<Database>>(() => createClient());
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Bumped with every scan outcome so the result card restarts its timer even
  // when two scans in a row produce the same status.
  const [statusNonce, setStatusNonce] = useState(0);

  const showStatus = useCallback((next: Status) => {
    setStatus(next);
    setStatusNonce((n) => n + 1);
  }, []);

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

  // Hardware mode keeps the camera off entirely, so it must not be guessed
  // during render — read it after mount like the camera pick above.
  const [mode, setMode] = useState<ScanMode>("camera");
  useEffect(() => {
    if (localStorage.getItem(MODE_KEY) === "hardware") setMode("hardware");
  }, []);

  function pickMode(next: ScanMode) {
    setMode(next);
    localStorage.setItem(MODE_KEY, next);
  }

  const [showSettings, setShowSettings] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [rescanNote, setRescanNote] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  /**
   * Re-read the camera list. Plain enumeration was not enough: a device that
   * has not granted camera permission reports a single nameless entry and
   * nothing else, so ask for a stream first — that is what makes the other
   * lenses appear — then drop it again and let the scanner keep its own.
   */
  async function rescanCameras() {
    setRescanning(true);
    setRescanNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // Permission refused or busy — enumerate anyway with what we have.
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const found = devices.filter((d) => d.kind === "videoinput").length;
      setRescanNote(
        found > 1
          ? `${found} Kameras gefunden — wähle oben die passende.`
          : "Nur eine Kamera gefunden. Erlaube den Kamerazugriff und versuch es nochmal.",
      );
    } catch {
      setRescanNote("Kameras konnten nicht gelesen werden.");
    }
    reloadCameras();
    setRescanning(false);
  }

  function pickCamera(id: string) {
    setDeviceId(id);
    setCameraError(null);
    if (id) localStorage.setItem(CAMERA_KEY, id);
    else localStorage.removeItem(CAMERA_KEY);
    setAttempt((n) => n + 1);
  }

  // Some rear lenses on a scan handset are telephoto: picking one lands you
  // zoomed way in, with the QR out of frame. Wind it back to the widest the
  // lens allows on start, and leave the knob out for close-up focus problems.
  const scannerRef = useRef<IScannerHandle>(null);
  const [zoom, setZoom] = useState<{
    min: number;
    max: number;
    step: number;
    value: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;

    // The stream only exists once the camera has started, and how long that
    // takes is the hardware's business.
    const poll = setInterval(() => {
      if (cancelled || ++tries > 20) return void clearInterval(poll);
      const track = scannerRef.current?.getStream()?.getVideoTracks()[0];
      if (!track) return;
      clearInterval(poll);

      const range = zoomCapability(track);
      if (!range) return;

      setTrackZoom(track, range.min);
      if (!cancelled) setZoom({ ...range, value: range.min });
    }, 300);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
    // `mode` re-arms the poll: coming back from hardware mode mounts a fresh
    // Scanner, and without a re-run a telephoto lens stays zoomed in with no
    // slider to wind it back.
  }, [deviceId, attempt, mode]);

  function applyZoom(value: number) {
    setZoom((z) => (z ? { ...z, value } : z));
    setTrackZoom(scannerRef.current?.getStream()?.getVideoTracks()[0], value);
  }

  // Token we are currently/last processing + when, so the same QR held in
  // frame doesn't spam the RPC.
  const lastTokenRef = useRef<string | null>(null);
  const lastAtRef = useRef<number>(0);
  const busyRef = useRef(false);

  const handleToken = useCallback(
    async (token: string, method: CheckinMethod) => {
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
          .select("id, display_name, checked_in_at")
          .eq("qr_token", token)
          .maybeSingle();

        if (lookupErr || !participant) {
          showStatus({ kind: "unknown" });
          playScanSound("reject");
          return;
        }

        // check_in is idempotent, so a second scan used to look identical to a
        // first one. At a door that matters: someone passing their code back
        // over the barrier should not read as a fresh admission.
        if (participant.checked_in_at) {
          showStatus({
            kind: "already",
            name: participant.display_name,
            since: participant.checked_in_at,
          });
          playScanSound("already");
          return;
        }

        const { error: rpcErr } = await supabase.rpc("check_in", {
          p_participant_id: participant.id,
          p_method: method,
        });

        if (rpcErr) {
          // The already-checked-in case is handled above, so a failure here is a
          // real one — most importantly missing consent.
          showStatus(
            isConsentError(rpcErr) ? { kind: "consent" } : { kind: "error" },
          );
          playScanSound("reject");
          return;
        }

        showStatus({ kind: "success", name: participant.display_name });
        playScanSound("success");
        // The attendance list and the "x von y anwesend" count are server-
        // rendered on this same page, so a scan used to leave them stale until
        // someone reloaded. Only the success path changes data — an already-
        // present scan short-circuits before the RPC, and a failure wrote
        // nothing. Re-rendering the server components leaves this client's
        // state (mode, camera stream, result card) untouched.
        router.refresh();
      } catch (e) {
        showStatus(isConsentError(e) ? { kind: "consent" } : { kind: "error" });
        playScanSound("reject");
      } finally {
        busyRef.current = false;
      }
    },
    [supabase, showStatus, router],
  );

  const onScan = useCallback(
    (codes: { rawValue: string }[]) => {
      const value = codes[0]?.rawValue?.trim();
      if (value) void handleToken(value, "camera_scan");
    },
    [handleToken],
  );

  const onError = useCallback((error: IScannerError) => {
    setCameraError(cameraErrorMessage(error.kind));
  }, []);

  // Which reader admitted someone is worth keeping: when a door station
  // misbehaves mid-event, check_ins can then say whether the camera or the
  // handheld produced the check-ins around it.
  const onHardwareToken = useCallback(
    (token: string) => void handleToken(token, "hardware_scan"),
    [handleToken],
  );

  // A handheld like the Zebra TC26 scans with a laser imager, not a camera —
  // its engine never shows up in getUserMedia. DataWedge replays the scan as
  // keystrokes ending with Enter, which the hook reads off the document.
  const { captureRef, rawKeys, scans } = useHardwareScan(onHardwareToken, {
    rawLogEnabled: showDiagnostics,
  });

  return (
    // min-w-0: the video carries an intrinsic width, and a grid item defaults to
    // min-width:auto, so without this the card refuses to shrink below the
    // camera's own resolution and pushes the phone layout wider than the screen.
    <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      {/* Android hands an injected scan to the page through the IME, which
          needs somewhere to put it: with no focused field the text is dropped
          before any key event exists. So this field stays mounted and the hook
          keeps it focused. sr-only rather than display:none — a hidden element
          cannot take focus — and inputMode="none" keeps the soft keyboard down. */}
      <input
        ref={captureRef}
        type="text"
        inputMode="none"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        tabIndex={-1}
        aria-hidden="true"
        data-scan-capture=""
        className="sr-only"
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
            QR-Scanner
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {mode === "camera"
              ? "Richte die Kamera auf den persönlichen QR-Code des Teilnehmers."
              : "Scanne den persönlichen QR-Code mit dem Handscanner."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          aria-label="Scanner-Einstellungen"
          className="shrink-0 rounded-lg p-2 text-fg-dim transition-colors hover:text-fg-muted"
        >
          <Settings className="size-4" />
        </button>
      </div>

      {/* Hand focus back after switching: Android leaves it on the button, and
          a scanner fires into whatever holds focus. Dropping it to body lets
          the capture field claim it again. */}
      <div className="inline-flex self-start gap-1 rounded-lg border border-line bg-surface-2 p-1">
        {MODES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={(e) => {
              pickMode(id);
              e.currentTarget.blur();
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-display text-[11px] uppercase tracking-wider transition-colors ${
              mode === id
                ? "bg-lime/15 text-lime"
                : "text-fg-muted hover:text-ink"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {mode === "camera" ? (
        <div
          className="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-line bg-surface-2"
          data-testid="qr-scanner"
        >
          {/* Over the picture, not under it: the eye is on the viewfinder while
              scanning, so that is where the verdict has to appear. It clears
              itself when the countdown ends. */}
          <div className="pointer-events-none absolute inset-x-2 top-2 z-10">
            <ScanResultCard
              status={status}
              nonce={statusNonce}
              onExpire={() => setStatus({ kind: "idle" })}
              variant="overlay"
            />
          </div>
          <Scanner
            key={`${deviceId}-${attempt}`}
            ref={scannerRef}
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
      ) : (
        // No viewfinder to stand in for, and no placeholder either: with the
        // camera off the result is the only thing worth screen space, so it
        // takes the top spot instead of sitting below an empty box.
        <ScanResultCard
          status={status}
          nonce={statusNonce}
          onExpire={() => setStatus({ kind: "idle" })}
        />
      )}

      {mode === "camera" && cameraError && (
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

      {showSettings && (
        <div className="flex flex-col gap-4 rounded-xl border border-line/60 bg-surface-2/60 p-4">
          {/* Always rendered, never gated on the list already being complete: on a
              scan handset the extra lenses appear only after the permission prompt
              is answered, and hiding the control until then is what stranded one. */}
          {mode === "camera" && (
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
                  // Hand focus back afterwards: Android leaves it on the select once
                  // the sheet closes, and a scanner fires into whatever holds focus.
                  // Dropping it to body lets the capture field claim it again.
                  onChange={(e) => {
                    pickCamera(e.target.value);
                    e.currentTarget.blur();
                  }}
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
                  onClick={() => void rescanCameras()}
                  disabled={rescanning}
                  className="shrink-0 rounded-lg border border-line px-3 py-2 font-display text-[10px] font-bold uppercase tracking-wider text-fg-muted transition-colors hover:text-ink disabled:opacity-50"
                >
                  {rescanning ? "Sucht…" : "Neu suchen"}
                </button>
              </div>
              <p className="text-xs text-fg-muted">
                {rescanNote ??
                  (cameras.length > 1
                    ? "Scannt eine Linse schlecht aus der Nähe, nimm eine andere. Die Wahl bleibt auf diesem Gerät gespeichert."
                    : "Erst nach erlaubtem Kamerazugriff zeigt das Gerät alle Linsen. Fehlt eine, tippe auf „Neu suchen“.")}
              </p>
            </div>
          )}

          {mode === "camera" && zoom && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="camera-zoom"
                className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim"
              >
                Zoom · {zoom.value.toFixed(1)}×
              </label>
              <input
                id="camera-zoom"
                type="range"
                min={zoom.min}
                max={zoom.max}
                step={zoom.step}
                value={zoom.value}
                onChange={(e) => applyZoom(Number(e.target.value))}
                className="w-full accent-lime"
              />
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => setShowDiagnostics((v) => !v)}
              className="font-display text-[10px] uppercase tracking-wider text-fg-dim transition-colors hover:text-fg-muted"
            >
              {showDiagnostics ? "Diagnose ausblenden" : "Scanner-Diagnose"}
              {scans.length > 0 && ` (${scans.length})`}
            </button>

            {showDiagnostics && (
              <ScanDiagnostics scans={scans} rawKeys={rawKeys} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
