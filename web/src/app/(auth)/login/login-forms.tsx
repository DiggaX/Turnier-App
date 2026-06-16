"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle>Anmelden</CardTitle>
        <CardDescription>
          Melde dich mit deiner E-Mail-Adresse und deinem Passwort an.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password-email">E-Mail</Label>
            <Input
              id="password-email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password-password">Passwort</Label>
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

          <Button type="submit" disabled={pending}>
            {pending ? "Wird angemeldet…" : "Anmelden"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function MagicLinkForm() {
  const [state, formAction, pending] = useActionState(
    signInMagicLink,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Magic Link</CardTitle>
        <CardDescription>
          Ohne Passwort: Wir senden dir einen Anmeldelink per E-Mail.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.magicLinkSent ? (
          <p className="text-sm" role="status">
            Bitte prüfe dein E-Mail-Postfach und klicke auf den Anmeldelink.
          </p>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="magic-email">E-Mail</Label>
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

            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? "Wird gesendet…" : "Magic Link senden"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
