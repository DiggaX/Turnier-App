/**
 * Base UI's Checkbox.Root takes its accessible name from the <Label> wrapped
 * around it. An aria-label on the same element does not replace that name, it
 * wins — so the sentence someone is actually agreeing to stopped being what got
 * read out, and the announcement stuttered the short label against the long one.
 *
 * Pinned here because the fix is a deletion, and deletions grow back. The
 * expected name is built from photoConsentText rather than pasted: the wording
 * itself is already pinned in consent-text.test.ts, this asserts the wiring.
 *
 * Nothing is mocked and nothing needs to be. `supabase` arrives as a prop, so
 * the component never reaches for the browser client; ParticipantShell owns no
 * routing; and SignaturePad only touches a 2D context from pointer handlers,
 * which no test here fires.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { photoConsentText, type ConsentOrg } from "@/lib/consent-text";
import { PhotoConsentStep } from "./consent-step";

const ORG: ConsentOrg = {
  name: "Abenteuerinsel Fehmarn",
  address: "Zur Strandpromenade 4, 23769 Fehmarn",
};
const NAME = "Alex Beispiel";
const ADULT = "2000-01-01";
const MINOR = "2014-01-01";

const supabase = {} as unknown as SupabaseClient<Database>;
const getUid = vi.fn(async () => "uid-1");
const onDone = vi.fn();

function renderStep(birthdate: string) {
  return render(
    <PhotoConsentStep
      supabase={supabase}
      participantId="p-1"
      birthdate={birthdate}
      participantName={NAME}
      org={ORG}
      getUid={getUid}
      onDone={onDone}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PhotoConsentStep", () => {
  it("names the checkbox with the consent wording itself, not a doubled label", () => {
    renderStep(ADULT);

    // Exact match, deliberately: a substring or RegExp would still pass with
    // the stutter back, because the doubled name contains the sentence.
    expect(
      screen.getByRole("checkbox", {
        name: photoConsentText(ORG, "self", NAME),
      }),
    ).toBeInTheDocument();
  });

  it("asks a minor for a guardian signature instead of a checkbox", () => {
    renderStep(MINOR);

    expect(
      screen.getByRole("img", {
        name: "Unterschrift des Erziehungsberechtigten",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
