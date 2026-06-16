"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SignaturePadHandle {
  toBlob(): Promise<Blob | null>;
  isEmpty(): boolean;
  clear(): void;
}

interface SignaturePadProps {
  className?: string;
  ariaLabel?: string;
  width?: number;
  height?: number;
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad(
    {
      className,
      ariaLabel = "Unterschrift",
      width = 600,
      height = 200,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isEmptyRef = useRef(true);
    const isDrawing = useRef(false);

    const getCtx = useCallback((): CanvasRenderingContext2D | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return canvas.getContext("2d");
    }, []);

    const startStroke = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = getCtx();
        if (!canvas || !ctx) return;

        canvas.setPointerCapture(e.pointerId);
        isDrawing.current = true;

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#000000";

        ctx.beginPath();
        ctx.moveTo(x, y);
      },
      [getCtx],
    );

    const continueStroke = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing.current) return;
        const canvas = canvasRef.current;
        const ctx = getCtx();
        if (!canvas || !ctx) return;

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        ctx.lineTo(x, y);
        ctx.stroke();
        isEmptyRef.current = false;
      },
      [getCtx],
    );

    const endStroke = useCallback(() => {
      isDrawing.current = false;
    }, []);

    const clear = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      isEmptyRef.current = true;
      isDrawing.current = false;
    }, [getCtx]);

    useImperativeHandle(
      ref,
      () => ({
        toBlob(): Promise<Blob | null> {
          if (isEmptyRef.current) return Promise.resolve(null);
          const canvas = canvasRef.current;
          if (!canvas) return Promise.resolve(null);
          return new Promise<Blob | null>((resolve) => {
            canvas.toBlob((blob) => resolve(blob), "image/png");
          });
        },
        isEmpty(): boolean {
          return isEmptyRef.current;
        },
        clear,
      }),
      [clear],
    );

    return (
      <div className={cn("flex flex-col items-start gap-2", className)}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          className="w-full max-w-full rounded-lg border border-line bg-white touch-none cursor-crosshair"
          onPointerDown={startStroke}
          onPointerMove={continueStroke}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clear}
          aria-label="Unterschrift löschen"
        >
          Löschen
        </Button>
      </div>
    );
  },
);
