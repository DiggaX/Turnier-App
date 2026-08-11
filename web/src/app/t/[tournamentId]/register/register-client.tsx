"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import {
  ensureGuestSession,
  isGuestUser,
  STAFF_SESSION_MESSAGE,
} from "@/lib/supabase/guest-session";
import type { Database } from "@/lib/database.types";
import { validBirthdate } from "@/lib/consent";
import { friendlyDbError, isUniqueViolation } from "@/lib/db-errors";
import { BirthdateField } from "@/components/birthdate-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ParticipantShell,
  SectionLabel,
} from "@/components/brand/participant-shell";
import { QrCode } from "@/components/qr-code";
import { QrActions } from "@/components/qr-actions";
import type { ConsentOrg } from "@/lib/consent-text";
import { PhotoConsentStep } from "./consent-step";
import { SaveAccessDialog } from "./save-access-dialog";
import { TeamStep, type TeamState } from "./team-step";

/**
 * "loading" ist nicht Kosmetik: bevor feststeht, ob diese Sitzung hier schon
 * angemeldet ist, darf das Formular nicht zu sehen sein. Sonst tippt jemand
 * seine Daten ein zweiter Mal ein und laeuft in
 * unique(tournament_id, user_id).
 */
type Step = "loading" | "form" | "consent" | "team" | "done";

/**
 * Gefragt wird nach der PERSON — auch im Teamturnier. Der Teamname und die
 * Mitspieler gehoeren nicht mehr hierher: sie entstehen im Team-Schritt, wo
 * jeder Mitspieler seine eigene Anmeldung hat.
 */
const schema = z.object({
  displayName: z.string().trim().min(1, "Anzeigename erforderlich"),
  gamertag: z.string().trim().optional(),
  // new Date() gehört in den Callback: die Uhr wird zur Prüfzeit gelesen,
  // nicht beim Bauen des Schemas — sonst veraltet ein über Mitternacht
  // offener Tab.
  birthdate: z
    .string()
    .min(1, "Geburtsdatum erforderlich")
    .refine(
      (v) => validBirthdate(v, new Date()),
      "Bitte ein gültiges Geburtsdatum eingeben.",
    ),
});

type FormValues = {
  displayName: string;
  gamertag?: string;
  birthdate: string;
};

interface RegisterClientProps {
  tournament: { id: string; name: string };
  teamSize: number;
  /** Verantwortliche Stelle im Text der Fotoerlaubnis. */
  org: ConsentOrg;
  /**
   * Geprüfter Team-Code aus `?join=…` — der Beitritts-QR eines Mitspielers
   * führt hierher. Im Einzelturnier bedeutungslos, dort gibt es keinen
   * Team-Schritt.
   */
  joinCode?: string | null;
}

export function RegisterClient({
  tournament,
  teamSize,
  org,
  joinCode,
}: RegisterClientProps) {
  const isTeam = teamSize > 1;
  // The browser Supabase client is created once (stable singleton, render-safe).
  const [supabase] = useState<SupabaseClient<Database>>(() => createClient());

  // Single-flight anonymous sign-in. The sign-in runs on the first call to
  // ensureSession() (always from an event handler), NEVER during render: under
  // React Strict Mode the render phase runs twice in dev, which would otherwise
  // create two anonymous users, and the second one would own a session the
  // freshly written participant row does not belong to.
  const signInRef = useRef<Promise<string> | null>(null);

  const ensureSession = useCallback((): Promise<string> => {
    signInRef.current ??= ensureGuestSession(supabase.auth).catch((e) => {
      signInRef.current = null; // allow retry on failure
      throw e;
    });
    return signInRef.current;
  }, [supabase]);

  const [accountSession, setAccountSession] = useState(false);
  const [step, setStep] = useState<Step>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [birthdate, setBirthdate] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [team, setTeam] = useState<TeamState | null>(null);
  // Gates the success screen until the participant confirms they saved their
  // QR/link. Not persisted, and it does not need to be: a reload lands back on
  // the step the DB says we are on, and the dialog is only shown right after
  // the registration was written.
  const [accessSaved, setAccessSaved] = useState(false);

  /**
   * Wo stehen wir? Genau zwei Dinge werden hier beantwortet, und beide vor dem
   * ersten Pixel Formular:
   *
   *  1. Ein angemeldetes Orga-Konto darf sich nicht als Gast anmelden — siehe
   *     ensureGuestSession. Der Riegel greift beim Absenden; diese Abfrage
   *     zeigt es, bevor jemand alles eintippt.
   *  2. Ist diese Gast-Sitzung hier schon angemeldet? Bisher war `step`
   *     fluechtiger React-State: nach einem Neuladen — und ein Handy laedt beim
   *     Wechsel in den Chat neu — landete man wieder auf dem Formular, und der
   *     zweite Versuch scheiterte an unique(tournament_id, user_id). Wer den
   *     Team-Code weitergeben wollte, kam nicht mehr an ihn heran.
   *
   * Ohne Sitzung wird gar nicht erst gefragt: angemeldet sein kann nur, wer
   * eine hat, und ein anonymer Login nur fuers Nachsehen wuerde fuer jeden
   * Besucher der Seite einen Auth-User anlegen.
   *
   * Nur Lesen, kein Login — Strict Modes doppelter Effekt ist damit harmlos.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session && !isGuestUser(session.user)) {
        setAccountSession(true);
        return;
      }
      if (!session) {
        setStep("form");
        return;
      }

      const { data } = await supabase.rpc("get_my_registration", {
        p_tournament_id: tournament.id,
      });
      if (cancelled) return;

      const reg = data?.[0];
      if (!reg) {
        setStep("form");
        return;
      }

      // qr_token steht nicht in get_my_registration — dort hat es nichts zu
      // suchen. Die eigene Zeile ist ueber participants_select_owner_or_staff
      // lesbar (user_id = auth.uid()).
      const { data: row } = await supabase
        .from("participants")
        .select("qr_token")
        .eq("id", reg.participant_id)
        .maybeSingle();
      if (cancelled) return;

      setParticipantId(reg.participant_id);
      setDisplayName(reg.display_name);
      if (row) setQrToken(row.qr_token);
      setTeam(
        reg.team_id
          ? {
              id: reg.team_id,
              name: reg.team_name ?? "",
              joinCode: reg.join_code,
              isCaptain: reg.is_captain,
            }
          : null,
      );
      // Die Fotoerlaubnis wird nicht nachgeholt: sie ist freiwillig, und ob sie
      // erteilt wurde, ist von hier aus nicht zu sehen. Wer wiederkommt, kommt
      // wegen seines Teams oder seines QR.
      setStep(isTeam ? "team" : "done");
      setAccessSaved(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, tournament.id, isTeam]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: "",
      gamertag: "",
      birthdate: "",
    },
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
          // Ein Mensch, kein Wettkaempfer. Die Team-Zeile entsteht erst im
          // Team-Schritt, ueber create_team — hier ginge sie auch gar nicht
          // mehr durch: der Trigger aus 20260811092000 verlangt, dass `type`
          // zur Teamgroesse des Turniers passt.
          type: isTeam ? "player" : "solo",
          display_name: values.displayName,
          gamertag: values.gamertag?.trim() ? values.gamertag.trim() : null,
          birthdate: values.birthdate,
        })
        .select("id, qr_token")
        .single();

      if (pErr || !participant) {
        // unique(tournament_id, user_id) — same user already registered here.
        if (isUniqueViolation(pErr)) {
          throw new Error("Du bist für dieses Turnier bereits angemeldet.");
        }
        throw new Error(
          friendlyDbError(
            pErr,
            "Anmeldung fehlgeschlagen. Bitte versuche es erneut.",
          ),
        );
      }

      setParticipantId(participant.id);
      setQrToken(participant.qr_token);
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
      <ParticipantShell
        eyebrow="/ Anmeldung"
        heading="Anmeldung abgeschlossen"
        glow="lime"
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-lime/30 bg-lime/[0.06] p-6">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-md bg-lime font-display text-base font-bold text-bg"
              >
                ✓
              </span>
              <p className="text-sm leading-relaxed text-fg-muted">
                Vielen Dank, {displayName}! Du bist für{" "}
                <span className="text-ink">{tournament.name}</span>{" "}
                angemeldet.
              </p>
            </div>
          </div>

          {isTeam && team && (
            <div className="rounded-2xl border border-cyan/30 bg-cyan/[0.06] p-6">
              <SectionLabel className="mb-2">Dein Team</SectionLabel>
              <p className="font-display text-lg font-bold uppercase tracking-wide text-ink">
                {team.name}
              </p>
              {team.joinCode && (
                <p className="mt-2 text-sm text-fg-muted">
                  Team-Code{" "}
                  <span className="font-display text-base font-bold tracking-[0.25em] text-ink">
                    {team.joinCode}
                  </span>{" "}
                  — den geben deine Mitspieler bei ihrer eigenen Anmeldung ein.
                </p>
              )}
            </div>
          )}

          {qrToken && (
            <>
              <div className="rounded-2xl border border-line bg-surface p-6">
                <SectionLabel className="mb-4 text-center">
                  Dein Check-in-QR
                </SectionLabel>
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-2xl bg-white p-4">
                    <QrCode value={qrToken} ariaLabel="Dein Check-in-QR" />
                  </div>
                  <p className="text-sm text-fg-muted">
                    Zeig das der Orga zum Check-in
                  </p>
                </div>
              </div>

              <QrActions tournamentId={tournament.id} qrToken={qrToken} />

              <Button
                render={<a href={`/t/${tournament.id}/me`} />}
                nativeButton={false}
                className="h-12 font-display text-sm font-bold uppercase tracking-wider"
              >
                Zu meinem Status
              </Button>

              {!accessSaved && (
                <SaveAccessDialog
                  tournamentId={tournament.id}
                  qrToken={qrToken}
                  onDone={() => setAccessSaved(true)}
                />
              )}
            </>
          )}
        </div>
      </ParticipantShell>
    );
  }

  if (step === "team") {
    return (
      <TeamStep
        supabase={supabase}
        tournamentId={tournament.id}
        teamSize={teamSize}
        initialTeam={team}
        // Der Code zählt nur, solange kein Team steht: wer beim Wiedereinstieg
        // schon in einem ist, sieht die Beitritts-Karte gar nicht — der
        // Parameter läuft dann ins Leere, und genau das soll er.
        initialJoinCode={joinCode}
        onDone={(chosen) => {
          setTeam(chosen);
          setStep("done");
        }}
      />
    );
  }

  if (step === "consent" && participantId) {
    return (
      <PhotoConsentStep
        supabase={supabase}
        participantId={participantId}
        birthdate={birthdate}
        participantName={displayName}
        org={org}
        getUid={ensureSession}
        onDone={() => setStep(isTeam ? "team" : "done")}
      />
    );
  }

  if (accountSession) {
    return (
      <ParticipantShell
        eyebrow={`/ ${tournament.name} / Register`}
        heading="Anmeldung"
      >
        <div className="rounded-2xl border border-warn/35 bg-warn/[0.08] p-6">
          <div className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-warn">
            ⚠ Angemeldet mit einem Konto
          </div>
          <p className="text-sm leading-relaxed text-fg-muted">
            {STAFF_SESSION_MESSAGE}
          </p>
        </div>
        <Button
          render={<a href={`/t/${tournament.id}`} />}
          nativeButton={false}
          variant="outline"
          className="mt-4 h-12 w-full font-display text-sm font-bold uppercase tracking-wider"
        >
          Zurück zum Turnier
        </Button>
      </ParticipantShell>
    );
  }

  if (step === "loading") {
    return (
      <ParticipantShell
        eyebrow={`/ ${tournament.name} / Register`}
        heading="Anmeldung"
      >
        <p className="text-sm text-fg-muted">Einen Moment…</p>
      </ParticipantShell>
    );
  }

  return (
    <ParticipantShell
      eyebrow={`/ ${tournament.name} / Register`}
      heading="Anmeldung"
      subheading={
        isTeam
          ? `Du meldest dich selbst an — dein Team (${teamSize} Spieler) gründest oder wählst du gleich danach.`
          : "Einzel-Anmeldung."
      }
    >
      <div className="rounded-2xl border border-line bg-surface p-6 sm:p-7">
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="flex flex-col gap-5"
          noValidate
        >
          <SectionLabel>Spieler</SectionLabel>

          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Anzeigename</Label>
            <Input id="displayName" {...register("displayName")} />
            {errors.displayName && (
              <p className="text-sm text-destructive">
                {errors.displayName.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="gamertag">Gamertag (optional)</Label>
            <Input id="gamertag" {...register("gamertag")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="birthdate">Geburtsdatum</Label>
            <Controller
              control={control}
              name="birthdate"
              render={({ field }) => (
                <BirthdateField
                  id="birthdate"
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            {errors.birthdate && (
              <p className="text-sm text-destructive">
                {errors.birthdate.message}
              </p>
            )}
          </div>

          {serverError && (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="mt-1 h-12 font-display text-sm font-bold uppercase tracking-wider"
          >
            {submitting ? "Wird gesendet…" : "Weiter zur Fotoerlaubnis"}
          </Button>

          <p className="text-center text-xs text-fg-muted">
            Als Gast — kein Account nötig
          </p>
        </form>
      </div>
    </ParticipantShell>
  );
}
