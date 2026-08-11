import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireOrgTournament } from "@/lib/auth/org-tournament";
import { storedConsentText } from "@/lib/consent-text";
import { formatDate } from "@/lib/format-date";

import { PERSON_TYPES } from "../participants/participant-types";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Fotoerlaubnisse — Turnier-App",
};

/** Wie lange die Signatur-Links gelten. Nur für diesen einen Seitenaufruf. */
const SIGNATURE_URL_TTL_SECONDS = 600;

type ConsentRow = {
  id: string;
  grantor: "self" | "guardian";
  grantor_name: string;
  method: string;
  signature_path: string | null;
  address: string | null;
  consent_text: string | null;
  granted_at: string;
};

/**
 * Die erteilten Fotoerlaubnisse als Papier — ein Blatt pro Person, im Wortlaut,
 * dem sie zugestimmt hat, mit ihrer Unterschrift.
 *
 * Für die Unterlagen des Veranstalters: wer fragt, ob eine Aufnahme gedeckt
 * ist, bekommt ein Blatt in die Hand und nicht einen Datenbankauszug. Gedruckt
 * wird über den Browser (siehe PrintButton) — "Als PDF sichern" ist dort der
 * gleiche Dialog.
 */
export default async function ConsentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["admin", "organizer", "referee"].includes(profile.role)) {
    redirect("/login");
  }

  const tournament = await requireOrgTournament<{
    id: string;
    name: string;
    org_id: string;
  }>(supabase, id, profile.org_id as string | null, "id, name, org_id");

  // Eine Fotoerlaubnis gehoert einem MENSCHEN, nie einem Team: es wird ja das
  // Kind fotografiert. Darum nur solo + player — Team-Zeilen haetten hier
  // ohnehin nie eine Einwilligung, wuerden aber mitgeladen.
  const { data: participants } = await supabase
    .from("participants")
    .select(
      "id, display_name, consents(id, grantor, grantor_name, method, signature_path, address, consent_text, granted_at)",
    )
    .eq("tournament_id", id)
    .in("type", PERSON_TYPES)
    .order("display_name", { ascending: true });

  const sheets = (participants ?? [])
    .map((p) => ({
      name: p.display_name,
      consent: ((p.consents ?? []) as ConsentRow[])[0],
    }))
    .filter((s): s is { name: string; consent: ConsentRow } => Boolean(s.consent));

  // Der Bucket ist privat: die Unterschriften brauchen kurzlebige signierte
  // Links, sonst bleibt im Ausdruck ein leeres Kästchen. Ein Aufruf für alle.
  const paths = sheets
    .map((s) => s.consent.signature_path)
    .filter((p): p is string => Boolean(p));
  const signatureUrls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("consent-signatures")
      .createSignedUrls(paths, SIGNATURE_URL_TTL_SECONDS);
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) {
        signatureUrls.set(entry.path, entry.signedUrl);
      }
    }
  }

  return (
    <main className="min-h-screen bg-bg print:bg-white">
      {/* @page und die Umbrüche gehen mit Tailwind-Utilities nicht, und das
          hier ist die einzige Seite im Projekt, die gedruckt wird. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          .consent-sheet { break-after: page; }
          .consent-sheet:last-of-type { break-after: auto; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <div className="mb-1 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
              Organizer · Fotoerlaubnisse
            </div>
            <h1 className="font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-ink">
              {tournament.name}
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              {sheets.length}{" "}
              {sheets.length === 1 ? "Erlaubnis" : "Erlaubnisse"} — ein Blatt pro
              Person.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/organizer/tournaments/${id}/participants`}
              className="font-display text-xs uppercase tracking-wider text-fg-muted transition-colors hover:text-ink"
            >
              Zurück
            </Link>
            <PrintButton />
          </div>
        </div>

        {sheets.length === 0 ? (
          <p className="text-sm text-fg-muted print:hidden">
            Für dieses Turnier hat noch niemand eine Fotoerlaubnis erteilt.
          </p>
        ) : (
          <div className="flex flex-col gap-6 print:gap-0">
            {sheets.map(({ name, consent }) => (
              <article
                key={consent.id}
                className="consent-sheet rounded-xl bg-white p-8 text-black shadow-lg print:rounded-none print:p-0 print:shadow-none"
              >
                <h2 className="font-display text-lg font-bold">
                  Einverständniserklärung
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  {tournament.name}
                </p>

                <dl className="mt-6 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-neutral-500">Teilnehmer/in</dt>
                  <dd className="font-semibold">{name}</dd>

                  <dt className="text-neutral-500">Ich,</dt>
                  <dd className="font-semibold">{consent.grantor_name}</dd>

                  <dt className="text-neutral-500">wohnhaft</dt>
                  <dd>{consent.address ?? "—"}</dd>

                  <dt className="text-neutral-500">erteilt als</dt>
                  <dd>
                    {consent.grantor === "guardian"
                      ? "Erziehungsberechtigte/r"
                      : "teilnehmende Person selbst"}
                  </dd>
                </dl>

                <p className="mt-6 border-l-2 border-neutral-300 pl-4 text-sm leading-relaxed">
                  {storedConsentText(consent.consent_text)}
                </p>

                <div className="mt-10 flex items-end justify-between gap-8">
                  <div className="min-w-[10rem]">
                    <div className="border-b border-neutral-400 pb-1 text-sm">
                      {formatDate(consent.granted_at)}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">Datum</div>
                  </div>

                  <div className="min-w-[14rem] flex-1">
                    <div className="flex h-16 items-end border-b border-neutral-400">
                      {consent.signature_path &&
                      signatureUrls.has(consent.signature_path) ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signierte Storage-URL, kein Next-Loader nötig
                        <img
                          src={signatureUrls.get(consent.signature_path)}
                          alt={`Unterschrift ${consent.grantor_name}`}
                          className="max-h-16 object-contain"
                        />
                      ) : (
                        <span className="pb-1 text-xs text-neutral-500">
                          Digital bestätigt (Checkbox)
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      Unterschrift
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
