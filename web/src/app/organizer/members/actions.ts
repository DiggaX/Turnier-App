"use server";

import { friendlyDbError } from "@/lib/db-errors";
import { requireAdmin, type ActionResult } from "@/lib/auth/staff";

export async function createInvite(role: "organizer" | "referee"): Promise<ActionResult> {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const { supabase, orgId } = guard;
  const code = crypto.randomUUID();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("org_invites").insert({
    org_id: orgId, code, role, expires_at: expires,
  });
  if (error) return { error: friendlyDbError(error, "Einladung konnte nicht erstellt werden (nur Admin).") };
  return { ok: true };
}

export async function revokeInvite(id: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const { supabase, orgId } = guard;
  const { error } = await supabase
    .from("org_invites")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) return { error: friendlyDbError(error, "Einladung konnte nicht widerrufen werden.") };
  return { ok: true };
}

export async function setMemberRole(member: string, role: "organizer" | "referee"): Promise<ActionResult> {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const { error } = await guard.supabase.rpc("set_member_role", { p_member: member, p_role: role });
  if (error) return { error: friendlyDbError(error, "Rolle konnte nicht geändert werden.") };
  return { ok: true };
}

export async function removeMember(member: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const { error } = await guard.supabase.rpc("remove_member", { p_member: member });
  if (error) return { error: friendlyDbError(error, "Mitglied konnte nicht entfernt werden.") };
  return { ok: true };
}
