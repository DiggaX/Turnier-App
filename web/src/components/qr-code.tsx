"use client";
import { QRCodeSVG } from "qrcode.react";

export function QrCode({
  value,
  size = 200,
  ariaLabel = "QR-Code",
}: {
  value: string;
  size?: number;
  ariaLabel?: string;
}) {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      level="H"
      role="img"
      aria-label={ariaLabel}
    />
  );
}
