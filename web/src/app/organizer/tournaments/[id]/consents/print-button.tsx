"use client";

import { Button } from "@/components/ui/button";

/**
 * Kein PDF-Generator im Backend: der Browser kann das längst, und "Drucken →
 * Als PDF sichern" liefert dieselbe Datei ohne Dependency, ohne Serverlast und
 * mit einer Vorschau, in der man vor dem Speichern noch etwas sieht.
 */
export function PrintButton() {
  return (
    <Button
      type="button"
      onClick={() => window.print()}
      className="h-11 font-display text-xs font-bold uppercase tracking-wider"
    >
      Drucken / Als PDF sichern
    </Button>
  );
}
