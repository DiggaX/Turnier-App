"use client";

import { useCallback, useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
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
import { ConsentStep } from "./consent-step";

type Step = "form" | "consent" | "done";

const memberSchema = z.object({
  name: z.string().trim().min(1, "Name erforderlich"),
  gamertag: z.string().trim().optional(),
});

function buildSchema(teamSize: number) {
  const base = {
    displayName: z.string().trim().min(1, "Anzeigename erforderlich"),
    gamertag: z.string().trim().optional(),
    birthdate: z
      .string()
      .min(1, "Geburtsdatum erforderlich")
      .refine((v) => {
        const d = new Date(v + "T00:00:00Z");
        return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
      }, "Bitte ein gültiges Datum in der Vergangenheit angeben"),
  };

  if (teamSize > 1) {
    return z.object({
      ...base,
      captainName: z.string().trim().min(1, "Name des Captains erforderlich"),
      captainGamertag: z.string().trim().optional(),
      members: z.array(memberSchema),
    });
  }

  return z.object(base);
}

type FormValues = {
  displayName: string;
  gamertag?: string;
  birthdate: string;
  captainName?: string;
  captainGamertag?: string;
  members?: { name: string; gamertag?: string }[];
};

interface RegisterClientProps {
  tournament: { id: string; name: string };
  teamSize: number;
}

export function RegisterClient({ tournament, teamSize }: RegisterClientProps) {
  const isTeam = teamSize > 1;
  // The browser Supabase client is created once (stable singleton, render-safe).
  const [supabase] = useState<SupabaseClient<Database>>(() => createClient());

  // Single-flight anonymous sign-in. The sign-in runs on the first call to
  // ensureSession() (always from an event handler), NEVER during render: under
  // React Strict Mode the render phase runs twice in dev, which would otherwise
  // create two anonymous users whose tokens diverge between the participant and
  // team_members inserts and break RLS.
  const signInRef = useRef<Promise<string> | null>(null);

  const ensureSession = useCallback((): Promise<string> => {
    signInRef.current ??= (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) return session.user.id;
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.user) {
        throw new Error(error?.message ?? "Keine anonyme Sitzung verfügbar.");
      }
      return data.user.id;
    })().catch((e) => {
      signInRef.current = null; // allow retry on failure
      throw e;
    });
    return signInRef.current;
  }, [supabase]);

  const [step, setStep] = useState<Step>("form");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [birthdate, setBirthdate] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(buildSchema(teamSize)),
    defaultValues: {
      displayName: "",
      gamertag: "",
      birthdate: "",
      captainName: "",
      captainGamertag: "",
      members: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "members",
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSubmitting(true);
    try {
      const uid = await ensureSession();

      const { data: participant, error: pErr } = await supabase
        .from("participants")
        .insert({
          tournament_id: tournament.id,
          user_id: uid,
          type: isTeam ? "team" : "solo",
          display_name: values.displayName,
          gamertag: values.gamertag?.trim() ? values.gamertag.trim() : null,
          birthdate: values.birthdate,
        })
        .select("id")
        .single();

      if (pErr || !participant) {
        throw new Error(pErr?.message ?? "Anmeldung fehlgeschlagen.");
      }

      if (isTeam) {
        const rows = [
          {
            participant_id: participant.id,
            name: values.captainName!.trim(),
            gamertag: values.captainGamertag?.trim()
              ? values.captainGamertag.trim()
              : null,
            is_captain: true,
          },
          ...(values.members ?? [])
            .filter((m) => m.name.trim().length > 0)
            .map((m) => ({
              participant_id: participant.id,
              name: m.name.trim(),
              gamertag: m.gamertag?.trim() ? m.gamertag.trim() : null,
              is_captain: false,
            })),
        ];
        const { error: mErr } = await supabase
          .from("team_members")
          .insert(rows);
        if (mErr) throw new Error(mErr.message);
      }

      setParticipantId(participant.id);
      setBirthdate(values.birthdate);
      setDisplayName(values.displayName);
      setStep("consent");
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "done") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Anmeldung &amp; Einwilligung abgeschlossen</CardTitle>
          <CardDescription>
            Vielen Dank, {displayName}! Du bist für {tournament.name}{" "}
            angemeldet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (step === "consent" && participantId) {
    return (
      <ConsentStep
        supabase={supabase}
        participantId={participantId}
        birthdate={birthdate}
        participantName={displayName}
        getUid={ensureSession}
        onDone={() => setStep("done")}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anmeldung — {tournament.name}</CardTitle>
        <CardDescription>
          {isTeam
            ? `Team-Anmeldung (Teamgröße ${teamSize}).`
            : "Einzel-Anmeldung."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName">Anzeigename</Label>
            <Input id="displayName" {...register("displayName")} />
            {errors.displayName && (
              <p className="text-sm text-destructive">
                {errors.displayName.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gamertag">Gamertag (optional)</Label>
            <Input id="gamertag" {...register("gamertag")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="birthdate">Geburtsdatum</Label>
            <Input id="birthdate" type="date" {...register("birthdate")} />
            {errors.birthdate && (
              <p className="text-sm text-destructive">
                {errors.birthdate.message}
              </p>
            )}
          </div>

          {isTeam && (
            <fieldset className="flex flex-col gap-4 rounded-lg border border-input p-3">
              <legend className="px-1 text-sm font-medium">Team</legend>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="captainName">Captain — Name</Label>
                <Input id="captainName" {...register("captainName")} />
                {errors.captainName && (
                  <p className="text-sm text-destructive">
                    {errors.captainName.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="captainGamertag">
                  Captain — Gamertag (optional)
                </Label>
                <Input
                  id="captainGamertag"
                  {...register("captainGamertag")}
                />
              </div>

              <div className="flex flex-col gap-3">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="flex flex-col gap-2 rounded-md border border-input/60 p-2"
                  >
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`members.${index}.name`}>
                        Mitglied {index + 1} — Name
                      </Label>
                      <Input
                        id={`members.${index}.name`}
                        {...register(`members.${index}.name` as const)}
                      />
                      {errors.members?.[index]?.name && (
                        <p className="text-sm text-destructive">
                          {errors.members[index]?.name?.message}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`members.${index}.gamertag`}>
                        Mitglied {index + 1} — Gamertag (optional)
                      </Label>
                      <Input
                        id={`members.${index}.gamertag`}
                        {...register(`members.${index}.gamertag` as const)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => remove(index)}
                    >
                      Mitglied entfernen
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ name: "", gamertag: "" })}
                >
                  Mitglied hinzufügen
                </Button>
              </div>
            </fieldset>
          )}

          {serverError && (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Wird gesendet…" : "Weiter zur Einwilligung"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
