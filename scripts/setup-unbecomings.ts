// One-time setup for the Unbecomings feature:
//   1. Applies the SQL migration (creates unbecomings + unbecoming_attachments tables)
//   2. Creates the private 'unbecomings' Storage bucket
//
// Idempotent — re-runnable. Reads SUPABASE_SERVICE_ROLE_KEY from .env.local.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function runMigration() {
  console.log("Running migration_add_unbecomings.sql via Postgres REST...");
  const sql = readFileSync("supabase/migrations/migration_add_unbecomings.sql", "utf8");

  // Supabase JS client doesn't expose raw SQL execution directly.
  // Use the underlying REST endpoint: POST /rest/v1/rpc/exec_sql is not available;
  // use the management API via pg-meta. Easier: just call each statement against
  // the postgres function 'exec' if we have it, OR use direct connection.
  // Simplest: call the SQL editor endpoint at /api/v1/query — but that's dashboard-only.
  //
  // Fall-through plan: write the SQL out, tell the user to paste it into the
  // Supabase SQL editor. We attempt programmatic via pg-style endpoint first.

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });

  if (res.ok) {
    console.log("  ✓ Migration applied via exec_sql RPC");
    return;
  }
  if (res.status === 404) {
    console.log("  ✗ No exec_sql RPC available on this project.");
    console.log("    Paste the contents of supabase/migrations/migration_add_unbecomings.sql");
    console.log("    into the Supabase SQL Editor and run it manually.");
    return;
  }
  const body = await res.text();
  throw new Error(`Migration call failed: HTTP ${res.status} ${body}`);
}

async function createBucket() {
  console.log("Creating 'unbecomings' Storage bucket (private, 50MB limit)...");
  const { data, error } = await sb.storage.createBucket("unbecomings", {
    public: false,
    fileSizeLimit: 52428800, // 50 MB in bytes
  });
  if (error) {
    // Treat 'already exists' as success
    if (error.message?.toLowerCase().includes("already exists")) {
      console.log("  ✓ Bucket already exists");
      return;
    }
    throw new Error(`Bucket creation failed: ${error.message}`);
  }
  console.log("  ✓ Bucket created:", data?.name);
}

async function main() {
  await runMigration();
  await createBucket();
  console.log("\nDone. Unbecomings setup complete.");
}

main().catch((e) => {
  console.error("\nFAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
