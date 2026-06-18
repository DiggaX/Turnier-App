"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAcceptInvite, signUpCreateOrg, type SignupState } from "./actions";

const initialState: SignupState = {};

interface SignupFormProps {
  invite: string | null;
  canSubmit: boolean;
}

export function SignupForm({ invite, canSubmit }: SignupFormProps) {
  const action = invite ? signUpAcceptInvite : signUpCreateOrg;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {invite && (
        <input type="hidden" name="code" value={invite} />
      )}

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="signup-email"
          className="font-display text-[11px] uppercase tracking-[0.14em] text-fg-muted"
        >
          E-Mail
        </Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="signup-password"
          className="font-display text-[11px] uppercase tracking-[0.14em] text-fg-muted"
        >
          Passwort
        </Label>
        <Input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>

      {!invite && (
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="signup-orgname"
            className="font-display text-[11px] uppercase tracking-[0.14em] text-fg-muted"
          >
            Firmenname
          </Label>
          <Input
            id="signup-orgname"
            name="orgName"
            type="text"
            autoComplete="organization"
            required
          />
        </div>
      )}

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={pending || !canSubmit}
        className="font-display text-sm font-bold uppercase tracking-wider"
      >
        {pending
          ? "Wird registriert…"
          : invite
            ? "Einladung einlösen"
            : "Organisation registrieren"}
      </Button>
    </form>
  );
}
