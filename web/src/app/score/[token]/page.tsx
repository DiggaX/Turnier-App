import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { Database } from "@/lib/database.types";
import { createPublicClient } from "@/lib/supabase/public";

import { ScorekeeperClient } from "./scorekeeper-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live-Score - Turnier-App",
};

type ScorekeeperMatch =
  Database["public"]["Functions"]["get_scorekeeper_match"]["Returns"][number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ScorekeeperPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!UUID.test(token)) notFound();

  const supabase = await createPublicClient();
  const { data } = await supabase.rpc("get_scorekeeper_match", {
    p_token: token,
  });
  const match: ScorekeeperMatch | undefined = data?.[0];

  if (!match) notFound();

  return <ScorekeeperClient token={token} initialMatch={match} />;
}
