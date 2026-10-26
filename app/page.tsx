import { createServiceClient } from "@/lib/supabase/service";
import { jpInfo, publicMembers, publicSettings } from "@/lib/public-data";
import HomeClient from "./HomeClient";

// Rebuilt at most every 30 s, so phones get the page with the JP cards, names and
// pay links already in it instead of empty boxes that fill in later. Only the
// curated public_* views are read (same data the public /api routes serve).
export const revalidate = 30;

export default async function Page() {
  let info = null, settings = null, members = null;
  try {
    const service = createServiceClient();
    [info, settings, members] = await Promise.all([jpInfo(service), publicSettings(service), publicMembers(service)]);
  } catch {
    // The page still works: HomeClient fetches anything missing in the browser.
  }
  return <HomeClient initialInfo={info} initialSettings={settings} initialMembers={members} />;
}
