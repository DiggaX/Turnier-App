// Räumt verwaiste Unterschriften aus dem privaten Bucket `consent-signatures`
// (HANDOVER §7.3): Objekte, auf die keine consents.signature_path-Zeile mehr
// zeigt — Reste gelöschter (Test-)Teilnehmer. Ein Turnier-/Teilnehmer-Delete
// cascadet nur DB-Zeilen, nie Storage-Objekte, und der Bucket hat keine
// DELETE-Policy: nur die Service-Role kann löschen. Genau deshalb ist das ein
// Skript und keine App-Funktion.
//
//   node scripts/cleanup-orphan-signatures.mjs --dry   # nur zählen und listen
//   node scripts/cleanup-orphan-signatures.mjs         # wirklich löschen
//   (oder: npm run cleanup:signatures)
//
// Liest web/.env.local über @next/env — dieselbe Quelle wie playwright.config.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd(), false);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const dry = process.argv.includes("--dry");
const BUCKET = "consent-signatures";

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen in .env.local stehen.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Alle Objektpfade des Buckets. Pfadkonvention: `${uid}/${participantId}.png`
 *  — die Wurzel listet uid-"Ordner", erst deren Inhalt sind Objekte. */
async function listAllObjects() {
  const { data: roots, error } = await admin.storage
    .from(BUCKET)
    .list("", { limit: 1000 });
  if (error) throw new Error(`Bucket-Wurzel nicht lesbar: ${error.message}`);

  const paths = [];
  for (const entry of roots ?? []) {
    // Ordner haben keine id; Objekte direkt in der Wurzel (gibt es laut
    // Konvention nicht, aber sicher ist sicher) zählen ebenfalls.
    if (entry.id) {
      paths.push(entry.name);
      continue;
    }
    const { data: files, error: listErr } = await admin.storage
      .from(BUCKET)
      .list(entry.name, { limit: 1000 });
    if (listErr) {
      throw new Error(`Ordner ${entry.name} nicht lesbar: ${listErr.message}`);
    }
    for (const f of files ?? []) {
      if (f.id) paths.push(`${entry.name}/${f.name}`);
    }
  }
  return paths;
}

const objects = await listAllObjects();

const { data: consents, error: consentErr } = await admin
  .from("consents")
  .select("signature_path")
  .not("signature_path", "is", null);
if (consentErr) {
  console.error(`consents nicht lesbar: ${consentErr.message}`);
  process.exit(1);
}
const referenced = new Set((consents ?? []).map((c) => c.signature_path));

const orphans = objects.filter((p) => !referenced.has(p));
console.log(
  `${objects.length} Objekte im Bucket, ${referenced.size} referenziert, ${orphans.length} verwaist.`,
);
for (const p of orphans) console.log(`  verwaist: ${p}`);

if (dry) {
  console.log("--dry: nichts gelöscht.");
  process.exit(0);
}
if (orphans.length === 0) {
  console.log("Nichts zu tun.");
  process.exit(0);
}

let deleted = 0;
for (let i = 0; i < orphans.length; i += 100) {
  const batch = orphans.slice(i, i + 100);
  const { error: rmErr } = await admin.storage.from(BUCKET).remove(batch);
  if (rmErr) {
    console.error(`Löschen fehlgeschlagen bei Batch ab ${i}: ${rmErr.message}`);
    process.exit(1);
  }
  deleted += batch.length;
}
console.log(`${deleted} verwaiste Objekte gelöscht.`);
