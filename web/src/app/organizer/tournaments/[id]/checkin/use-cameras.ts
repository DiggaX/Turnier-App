"use client";

import { useEffect, useState } from "react";

// Phones used as ticket scanners expose several rear lenses, and the browser's
// default pick is often the ultra-wide, which cannot focus on a QR held close.
// Laptops with a second USB webcam have the same problem in reverse. So the desk
// gets to choose, and the choice sticks.
//
// The library ships an equivalent `useDevices`, but importing it would pull the
// whole scanner package into the server bundle and defeat the scanner's
// ssr:false, so this stays hand-rolled.
export function useCameras(): [MediaDeviceInfo[], () => void] {
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
