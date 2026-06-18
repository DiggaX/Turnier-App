"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildInviteUrl, isInviteUsable } from "@/lib/org/invite";

import { createInvite, removeMember, revokeInvite, setMemberRole } from "./actions";

type Member = { id: string; role: string; display_name: string | null };
type Invite = {
  id: string;
  code: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

type Props = {
  members: Member[];
  invites: Invite[];
  currentUserId: string;
  origin: string;
};

function MemberRow({
  member,
  isSelf,
}: {
  member: Member;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value as "organizer" | "referee";
    setError(null);
    startTransition(async () => {
      const res = await setMemberRole(member.id, newRole);
      if ("error" in res) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleRemove() {
    if (!window.confirm(`Mitglied „${member.display_name ?? member.id}" wirklich entfernen?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await removeMember(member.id);
      if ("error" in res) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <TableRow className="border-line/60 hover:bg-white/[0.02]">
      <TableCell>
        <span className="font-medium text-ink">
          {member.display_name ?? "—"}
        </span>
        {isSelf && (
          <span className="ml-2 rounded-full bg-lime/20 px-1.5 py-0.5 font-display text-[9px] uppercase tracking-[0.12em] text-lime">
            du
          </span>
        )}
      </TableCell>
      <TableCell>
        {isSelf ? (
          <span className="font-display text-[11px] uppercase tracking-[0.12em] text-fg-muted">
            {member.role}
          </span>
        ) : (
          <select
            defaultValue={member.role}
            onChange={handleRoleChange}
            disabled={pending}
            className="rounded-lg border border-line bg-bg px-2 py-1 font-display text-xs text-fg-muted focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            aria-label={`Rolle von ${member.display_name ?? member.id}`}
          >
            <option value="organizer">organizer</option>
            <option value="referee">referee</option>
          </select>
        )}
      </TableCell>
      <TableCell>
        {!isSelf && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="rounded-[8px] border border-live/40 bg-live/10 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-live transition-colors hover:bg-live/20 disabled:opacity-50"
          >
            Entfernen
          </button>
        )}
        {error && <p className="mt-1 text-xs text-live">{error}</p>}
      </TableCell>
    </TableRow>
  );
}

function CreateInviteSection() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<"organizer" | "referee">("organizer");
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createInvite(role);
      if ("error" in res) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as "organizer" | "referee")}
        disabled={pending}
        className="rounded-lg border border-line bg-bg px-2 py-1.5 font-display text-xs text-fg-muted focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        aria-label="Rolle für Einladung"
      >
        <option value="organizer">organizer</option>
        <option value="referee">referee</option>
      </select>
      <button
        type="button"
        onClick={handleCreate}
        disabled={pending}
        className="rounded-[8px] bg-lime px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Wird erstellt…" : "Link erstellen"}
      </button>
      {error && <p className="text-xs text-live">{error}</p>}
    </div>
  );
}

function InviteRow({ invite, origin }: { invite: Invite; origin: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const now = new Date();
  const usable = isInviteUsable(
    { expiresAt: invite.expires_at, acceptedAt: invite.accepted_at },
    now,
  );
  const url = buildInviteUrl(origin, invite.code);

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleRevoke() {
    if (!window.confirm("Einladung wirklich widerrufen?")) return;
    setError(null);
    startTransition(async () => {
      const res = await revokeInvite(invite.id);
      if ("error" in res) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
            Rolle:
          </span>
          <span className="font-display text-xs font-medium text-fg-muted">
            {invite.role}
          </span>
          {!usable && (
            <span className="rounded-full bg-live/20 px-1.5 py-0.5 font-display text-[9px] uppercase tracking-[0.12em] text-live">
              {invite.accepted_at ? "eingelöst" : "abgelaufen"}
            </span>
          )}
        </div>
        <span className="font-display text-[10px] text-fg-dim">
          Ablauf: {new Date(invite.expires_at).toLocaleDateString("de-DE")}
        </span>
      </div>
      {usable && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="flex-1 truncate rounded bg-bg px-2 py-1 font-mono text-xs text-fg-muted">
            {url}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-[8px] border border-line px-3 py-1.5 font-display text-[10px] font-medium uppercase tracking-wider text-fg-muted transition-colors hover:border-white/20 hover:text-ink"
          >
            {copied ? "Kopiert!" : "Kopieren"}
          </button>
          <button
            type="button"
            onClick={handleRevoke}
            disabled={pending}
            className="rounded-[8px] border border-live/40 bg-live/10 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-live transition-colors hover:bg-live/20 disabled:opacity-50"
          >
            Widerrufen
          </button>
        </div>
      )}
      {error && <p className="text-xs text-live">{error}</p>}
    </div>
  );
}

export function MembersClient({ members, invites, currentUserId, origin }: Props) {
  const openInvites = invites.filter((inv) =>
    isInviteUsable({ expiresAt: inv.expires_at, acceptedAt: inv.accepted_at }, new Date()),
  );
  const pastInvites = invites.filter(
    (inv) => !isInviteUsable({ expiresAt: inv.expires_at, acceptedAt: inv.accepted_at }, new Date()),
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Members table */}
      <section>
        <h2 className="mb-3 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
          Teammitglieder
        </h2>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <Table>
            <TableHeader>
              <TableRow className="border-line hover:bg-transparent">
                <TableHead className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
                  Name
                </TableHead>
                <TableHead className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
                  Rolle
                </TableHead>
                <TableHead className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
                  Aktionen
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-fg-muted">
                    Keine Mitglieder gefunden.
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    isSelf={member.id === currentUserId}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Invite creation */}
      <section>
        <h2 className="mb-3 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
          Mitglied einladen
        </h2>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <CreateInviteSection />
        </div>
      </section>

      {/* Open invites */}
      {openInvites.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
            Offene Einladungen
          </h2>
          <div className="flex flex-col gap-2">
            {openInvites.map((inv) => (
              <InviteRow key={inv.id} invite={inv} origin={origin} />
            ))}
          </div>
        </section>
      )}

      {/* Past invites */}
      {pastInvites.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
            Vergangene Einladungen
          </h2>
          <div className="flex flex-col gap-2 opacity-60">
            {pastInvites.map((inv) => (
              <InviteRow key={inv.id} invite={inv} origin={origin} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
