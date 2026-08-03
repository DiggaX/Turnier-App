"use client";

import { useSyncExternalStore } from "react";

import { QrCode } from "@/components/qr-code";

function subscribe() {
  return () => undefined;
}

export function ScorekeeperQr({
  token,
  label,
  size = 88,
}: {
  token: string;
  label: string;
  size?: number;
}) {
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => null);
  const url = origin ? origin + "/score/" + token : null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-cyan/25 bg-cyan/[0.05] p-3">
      <span className="font-display text-[10px] uppercase tracking-[0.14em] text-cyan">
        Scorekeeper
      </span>
      <div className="bg-white p-1.5">
        {url ? (
          <QrCode value={url} size={size} ariaLabel={label} />
        ) : (
          <div
            aria-label="Scorekeeper-QR wird vorbereitet"
            className="size-[88px] bg-white"
          />
        )}
      </div>
    </div>
  );
}
