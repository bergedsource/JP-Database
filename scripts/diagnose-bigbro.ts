import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: members } = await sb
    .from("members")
    .select("name, roll, status")
    .eq("status", "active")
    .not("roll", "is", null)
    .order("name");

  const { data: roster } = await sb
    .from("chapter_roster")
    .select("roll, big_brother_roll");

  const rosterMap = new Map((roster ?? []).map((r) => [r.roll, r.big_brother_roll]));

  let withBigBro = 0, withoutBigBro = 0, notInRoster = 0;

  for (const m of members ?? []) {
    if (!rosterMap.has(m.roll)) {
      notInRoster++;
      console.log(`NOT IN ROSTER:  ${m.name} #${m.roll}`);
    } else if (rosterMap.get(m.roll) != null) {
      withBigBro++;
    } else {
      withoutBigBro++;
      console.log(`NO BIGBRO DATA: ${m.name} #${m.roll}`);
    }
  }

  console.log(`\nActive members with roll: ${members?.length ?? 0}`);
  console.log(`  In roster WITH bigbro : ${withBigBro}`);
  console.log(`  In roster, NO bigbro  : ${withoutBigBro}`);
  console.log(`  NOT in roster at all  : ${notInRoster}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
