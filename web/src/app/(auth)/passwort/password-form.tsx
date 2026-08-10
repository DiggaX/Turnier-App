"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPassword, type SetPasswordState } from "./actions";

const initialState: SetPasswordState = {};

const labelClass =
  "font-display text-[11px] uppercase tracking-[0.14em] text-fg-muted";

export interface PasswordFormProps {
  /**
   * "reset" arrives from a recovery mail and cannot be asked for the old
   * password — that is the one thing the visitor definitely does not have.
   */
  mode: "reset" | "change";
}

export function PasswordForm({ mode }: PasswordFormProps) {
  const [state, formAction, pending] = useActionState(
    setPassword,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {mode === "change" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currentPassword" className={labelClass}>
            Aktuelles Passwort
          </Label>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className={labelClass}>
          Neues Passwort
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="passwordRepeat" className={labelClass}>
          Neues Passwort wiederholen
        </Label>
        <Input
          id="passwordRepeat"
          name="passwordRepeat"
          type="password"
          autoComplete="new-password"
          minLength={8}
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
        {pending ? "Wird gespeichert…" : "Passwort speichern"}
      </Button>
    </form>
  );
}
