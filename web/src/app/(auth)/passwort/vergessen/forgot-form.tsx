"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, type ForgotState } from "../actions";

const initialState: ForgotState = {};

export function ForgotForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  // Same wording whether or not the address has an account — see the action.
  if (state.sent) {
    return (
      <p className="text-sm text-fg-muted" role="status">
        Wenn es zu dieser Adresse ein Konto gibt, ist die E-Mail unterwegs. Schau
        in dein Postfach — auch im Spam-Ordner.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="forgot-email"
          className="font-display text-[11px] uppercase tracking-[0.14em] text-fg-muted"
        >
          E-Mail
        </Label>
        <Input
          id="forgot-email"
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
        size="lg"
        disabled={pending}
        className="font-display text-sm font-bold uppercase tracking-wider"
      >
        {pending ? "Wird gesendet…" : "Link senden"}
      </Button>
    </form>
  );
}
