"use client";

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/brand/participant-shell";

/** Markiert den Text eines Elements, damit er von Hand kopiert werden kann. */
function selectContents(node: Node | null) {
  if (!node) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * Der Beitritts-Code, gross und abschreibbar — inklusive der Ansage, wozu er da
 * ist. Ohne diesen Satz ist der Code eine Zeichenfolge ohne Zweck, und die
 * Mitspieler warten darauf, dass irgendjemand sie "hinzufuegt".
 *
 * Teilen und Kopieren schlagen auf genug Geraeten fehl (iOS-Webviews, unsichere
 * Kontexte, verweigerte Berechtigung), als dass "es hat nicht geklappt" eine
 * Antwort waere: dann wird der Code markiert und gesagt, dass er von Hand
 * kopiert werden muss. Sichtbar ist er ohnehin die ganze Zeit.
 */
export function JoinCodeCard({
  code,
  teamName,
}: {
  code: string;
  teamName: string;
}) {
  const codeRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setManual(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      selectContents(codeRef.current);
      setManual(true);
    }
  }, [code]);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Team ${teamName}`,
          text: `Mein Team-Code für ${teamName}: ${code}`,
        });
        return;
      } catch {
        // Teilen abgebrochen oder nicht moeglich — dann eben kopieren.
      }
    }
    await copy();
  }

  return (
    <div className="rounded-2xl border border-cyan/30 bg-cyan/[0.06] p-6">
      <SectionLabel className="mb-3">Euer Team-Code</SectionLabel>
      {/*
        data-testid, weil der Code sonst nur ueber sein Aussehen zu finden ist:
        er hat keine Beschriftung, keine Rolle und keinen festen Text. Ein
        e2e-Lauf, der zwei Teilnehmer zu einem Team zusammenbringt, muss ihn
        auslesen koennen (siehe e2e/fixtures.ts, completeTeamStep).
      */}
      <div
        ref={codeRef}
        data-testid="join-code"
        className="select-all text-center font-display text-3xl font-bold uppercase tracking-[0.35em] text-ink sm:text-4xl"
      >
        {code}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-fg-muted">
        Gib den Code an deine Mitspieler weiter. Sie melden sich selbst an und
        geben ihn dort unter „Team beitreten“ ein — dann seid ihr ein Team.
      </p>
      {manual && (
        <p className="mt-2 text-sm text-warn">
          Kopieren geht auf diesem Gerät nicht — der Code ist markiert, kopiere
          ihn von Hand.
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={() => void copy()}
          className="h-11 flex-1"
        >
          {copied ? "Code kopiert ✓" : "Code kopieren"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void share()}
          className="h-11 flex-1"
        >
          Code teilen
        </Button>
      </div>
    </div>
  );
}
