import { SectionLabel } from "@/components/brand/participant-shell";

import { JoinCodeCard } from "../register/join-code-card";

/** Ein Mitspieler, so wie get_my_team ihn liefert. */
export interface TeamMember {
  id: string;
  name: string;
  isCaptain: boolean;
  checkedIn: boolean;
  isMe: boolean;
}

/** Das eigene Team samt Beitritts-Code, sofern der noch etwas nuetzt. */
export interface TeamInfo {
  name: string;
  /** Nur waehrend `status = 'registration'` gesetzt — danach ist er wertlos. */
  joinCode: string | null;
  members: TeamMember[];
}

/**
 * Team und Mitspieler auf "Mein Status" — und, solange die Anmeldung laeuft,
 * der Beitritts-Code.
 *
 * Nach Anmeldeschluss ruft die Registrierungsseite notFound(). Ohne diese Karte
 * kaeme danach niemand mehr an den Code, und ein Nachzuegler haette keinen Weg
 * mehr ins Team.
 */
export function TeamCard({ team }: { team: TeamInfo }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <SectionLabel className="mb-2">Dein Team</SectionLabel>
        <p className="mb-3 font-display text-base font-semibold text-ink">
          {team.name}
        </p>
        {team.members.length === 0 ? (
          <p className="text-sm text-fg-muted">Noch keine Mitspieler geladen.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {team.members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate text-ink">
                  {m.name}
                  {m.isCaptain && (
                    <span className="ml-2 font-display text-[10px] uppercase tracking-[0.14em] text-cyan">
                      Captain
                    </span>
                  )}
                  {m.isMe && (
                    <span className="ml-2 font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
                      Du
                    </span>
                  )}
                </span>
                <span
                  className={
                    m.checkedIn
                      ? "shrink-0 font-display text-[10px] uppercase tracking-[0.14em] text-lime"
                      : "shrink-0 font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim"
                  }
                >
                  {m.checkedIn ? "Eingecheckt" : "Fehlt noch"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {team.joinCode && (
        <JoinCodeCard code={team.joinCode} teamName={team.name} />
      )}
    </div>
  );
}
