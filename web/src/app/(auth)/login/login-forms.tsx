"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signInMagicLink,
  signInPassword,
  type LoginState,
} from "./actions";

const initialState: LoginState = {};

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(
    signInPassword,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="password-email"
          className="font-display text-[11px] uppercase tracking-[0.14em] text-fg-muted"
        >
          E-Mail
        </Label>
        <Input
          id="password-email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="password-password"
          className="font-display text-[11px] uppercase tracking-[0.14em] text-fg-muted"
        >
          Passwort
        </Label>
        <Input
          id="password-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="font-display text-sm font-bold uppercase tracking-wider"
      >
        {pending ? "Wird angemeldet…" : "Anmelden"}
      </Button>
    </form>
  );
}

export function MagicLinkForm() {
  const [state, formAction, pending] = useActionState(
    signInMagicLink,
    initialState,
  );

  if (state.magicLinkSent) {
    return (
      <p className="text-sm text-fg-muted" role="status">
        Bitte prüfe dein E-Mail-Postfach und klicke auf den Anmeldelink.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="magic-email"
          className="font-display text-[11px] uppercase tracking-[0.14em] text-fg-muted"
        >
          E-Mail
        </Label>
        <Input
          id="magic-email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        variant="outline"
        size="lg"
        disabled={pending}
        className="font-display text-xs font-medium uppercase tracking-wider text-cyan"
      >
        {pending ? "Wird gesendet…" : "Magic Link senden"}
      </Button>
    </form>
  );
}
