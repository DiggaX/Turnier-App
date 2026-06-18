"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { orgSlug } from "@/lib/org/slug";

export type SignupState = { error?: string };

async function signUp(email: string, password: string): Promise<{ error?: string }> {
  if (!email || password.length < 8) {
    return { error: "E-Mail und ein Passwort (min. 8 Zeichen) erforderlich." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: "Registrierung fehlgeschlagen. E-Mail evtl. schon vergeben." };
  return {};
}

export async function signUpCreateOrg(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const orgName = String(formData.get("orgName") ?? "").trim();
  if (!orgName) return { error: "Firmenname erforderlich." };
  const slug = orgSlug(orgName);
  if (!slug) return { error: "Firmenname ergibt keinen gültigen Namen." };

  const res = await signUp(email, password);
  if (res.error) return res;

  const supabase = await createClient();
  const { error } = await supabase.rpc("bootstrap_org", { p_name: orgName, p_slug: slug });
  if (error) return { error: "Organisation konnte nicht angelegt werden." };
  redirect("/organizer");
}

export async function signUpAcceptInvite(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!code) return { error: "Einladungscode fehlt." };

  const res = await signUp(email, password);
  if (res.error) return res;

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { p_code: code });
  if (error) return { error: "Einladung konnte nicht eingelöst werden (ungültig/abgelaufen?)." };
  redirect("/organizer");
}
