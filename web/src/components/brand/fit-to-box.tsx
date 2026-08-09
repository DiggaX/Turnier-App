"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Scales its content down until it fits the space it is given.
 *
 * A bracket on a projector has nobody to scroll it, so anything past the edge
 * is simply lost. Rather than shrinking type by breakpoint and hoping, this
 * measures what the content actually wants and picks the one factor that makes
 * it fit — so a 4-player and a 64-player bracket both land fully on screen.
 *
 * The caller has to give this a definite size (a height especially), because
 * that box is what the content is measured against. `transform` is visual only,
 * so the inner element keeps reporting its natural size and the measurement
 * never feeds back on itself.
 */
export function FitToBox({
  children,
  maxScale = 1,
  className,
}: {
  children: React.ReactNode;
  /** Allow growing past 1 when there is room — useful on a big screen. */
  maxScale?: number;
  className?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const measure = () => {
      const w = inner.offsetWidth;
      const h = inner.offsetHeight;
      const boxW = outer.clientWidth;
      const boxH = outer.clientHeight;
      if (!w || !h || !boxW || !boxH) return;
      setScale(Math.min(boxW / w, boxH / h, maxScale));
    };

    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);

    // Second channel on purpose. The box is sized off the viewport, and the
    // board's fullscreen toggle resizes it — a case where the window event is
    // the direct signal, and one worth not depending on a single mechanism for:
    // getting this wrong means a clipped bracket on the projector.
    window.addEventListener("resize", measure);
    document.addEventListener("fullscreenchange", measure);

    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("fullscreenchange", measure);
    };
  }, [maxScale]);

  return (
    <div
      ref={outerRef}
      className={cn("flex items-center justify-center overflow-hidden", className)}
    >
      {/* w-max: the content must lay out at its natural width, not the box's,
          or it would wrap and there would be nothing to scale. */}
      <div
        ref={innerRef}
        className="w-max origin-center"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
