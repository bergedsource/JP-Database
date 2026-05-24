import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Total count
  const { count } = await sb.from("chapter_roster").select("*", { count: "exact", head: true });
  console.log(`chapter_roster total rows: ${count}`);

  // Min and max roll
  const { data: minMax } = await sb.from("chapter_roster").select("roll").order("roll", { ascending: true }).limit(1);
  const { data: maxRow } = await sb.from("chapter_roster").select("roll").order("roll", { ascending: false }).limit(1);
  console.log(`Roll range: ${minMax?.[0]?.roll} – ${maxRow?.[0]?.roll}`);

  // Check roll 1290 specifically
  const { data: r1290 } = await sb.from("chapter_roster").select("roll, name, big_brother_roll").eq("roll", 1290);
  console.log(`Roll 1290: ${JSON.stringify(r1290)}`);

  // Check roll 1352 (Dillon)
  const { data: r1352 } = await sb.from("chapter_roster").select("roll, name, big_brother_roll").eq("roll", 1352);
  console.log(`Roll 1352: ${JSON.stringify(r1352)}`);

  // Check members.roll type
  const { data: mSample } = await sb.from("members").select("name, roll").not("roll", "is", null).limit(3);
  console.log(`Members sample: ${JSON.stringify(mSample)}`);
  if (mSample?.[0]) {
    const roll = mSample[0].roll;
    console.log(`members.roll type: ${typeof roll}, value: ${roll}`);
    const { data: rMatch } = await sb.from("chapter_roster").select("roll, name").eq("roll", roll);
    console.log(`chapter_roster match for roll ${roll}: ${JSON.stringify(rMatch)}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
