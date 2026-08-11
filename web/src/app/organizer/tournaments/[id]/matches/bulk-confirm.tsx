"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import {
  confirmSequentially,
  type ConfirmFailure,
  type ConfirmItem,
} from "@/lib/station/station";

/**
 * Sammel-Freigabe: every match both sides agreed on, released in one go.
 * confirm_match is single-match, so this walks the list one by one with visible
 * progress; a match that refuses (draw, follow-up already decided) is named and
 * the rest still run.
 */
export function BulkConfirm({ items }: { items: ConfirmItem[] }) {
  const router = useRouter();
  const [supabase] = useState<SupabaseClient<Database>>(() => createClient());
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [failures, setFailures] = useState<ConfirmFailure[] | null>(null);

  if (items.length === 0) return null;

  async function run() {
    setRunning(true);
    setDone(0);
    setFailures(null);
    const failed = await confirmSequentially(
      items,
      async (item) => {
        const { error } = await supabase.rpc("confirm_match", {
          p_match_id: item.id,
          p_score_a: item.scoreA,
          p_score_b: item.scoreB,
        });
        if (error) throw error;
      },
      setDone,
    );
    setFailures(failed);
    setRunning(false);
    router.refresh();
  }

  return (
    <section className="mb-6 flex flex-col gap-3 rounded-2xl border border-lime/30 bg-lime/[0.06] p-5">
      <h2 className="font-display text-sm font-bold uppercase tracking-[0.12em] text-lime">
        {items.length} {items.length === 1 ? "Partie" : "Partien"} einig
      </h2>

      <ul className="flex flex-col gap-1 text-sm text-fg-muted">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <span>{item.label}</span>
            <span className="font-display font-semibold text-ink">
              {item.scoreA}:{item.scoreB}
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => void run()}
        disabled={running}
        className="inline-flex w-fit items-center gap-2 rounded-[10px] bg-lime px-7 py-3 font-display text-sm font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running
          ? `Gebe frei … ${done}/${items.length}`
          : `Alle ${items.length} freigeben`}
      </button>

      {failures !== null && failures.length === 0 && (
        <p className="text-sm text-lime" role="status">
          Alle freigegeben.
        </p>
      )}

      {failures !== null && failures.length > 0 && (
        <div className="flex flex-col gap-1 text-sm text-live" role="alert">
          <p>
            {failures.length} von {items.length} nicht freigegeben:
          </p>
          <ul className="flex flex-col gap-1">
            {failures.map((f) => (
              <li key={f.id}>
                {f.label}: {f.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
