import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: games } = await supabase
    .from("games")
    .select("id, name, team_size")
    .order("name");

  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Turnier-App</h1>
      <ul className="space-y-1">
        {games?.map((g) => (
          <li key={g.id}>
            {g.name} <span className="text-muted-foreground">({g.team_size}er)</span>
          </li>
        ))}
      </ul>
      <Button>Los geht&apos;s</Button>
    </main>
  );
}
