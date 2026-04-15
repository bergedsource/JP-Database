// Load test — simulates 50 concurrent users on the member-facing page
// Usage: node loadtest.mjs [url]
// Example: node loadtest.mjs https://acaciajp.com

const BASE = process.argv[2] ?? "https://acaciajp.com";
const CONCURRENT_USERS = 50;
const ROUNDS = 3; // repeat the full simulation this many times

function percentile(sorted, p) {
  const i = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, i)];
}

function stats(label, times) {
  const sorted = [...times].sort((a, b) => a - b);
  const avg = Math.round(times.reduce((s, t) => s + t, 0) / times.length);
  console.log(`\n  ${label}`);
  console.log(`    min   ${sorted[0]}ms`);
  console.log(`    avg   ${avg}ms`);
  console.log(`    p95   ${percentile(sorted, 95)}ms`);
  console.log(`    p99   ${percentile(sorted, 99)}ms`);
  console.log(`    max   ${sorted[sorted.length - 1]}ms`);
}

async function timeRequest(url) {
  const start = Date.now();
  try {
    const res = await fetch(url);
    const ms = Date.now() - start;
    return { ms, status: res.status, ok: res.ok };
  } catch (e) {
    return { ms: Date.now() - start, status: 0, ok: false, error: e.message };
  }
}

async function simulateUser(members) {
  const results = {};

  // Step 1: load member list (what happens on page open)
  const membersResult = await timeRequest(`${BASE}/api/members`);
  results.members = membersResult;

  // Step 2: pick a random member and look up their fines (what happens after search)
  if (members.length > 0) {
    const member = members[Math.floor(Math.random() * members.length)];
    const finesResult = await timeRequest(`${BASE}/api/member-fines/${member.id}`);
    results.fines = finesResult;
  }

  return results;
}

async function run() {
  console.log(`\nLoad test — ${BASE}`);
  console.log(`${CONCURRENT_USERS} concurrent users × ${ROUNDS} rounds\n`);

  // Fetch member list once to get real IDs to test with
  process.stdout.write("Fetching member list for test data... ");
  const seedRes = await fetch(`${BASE}/api/members`);
  if (!seedRes.ok) {
    console.error(`Failed to fetch members (${seedRes.status}). Is the site up?`);
    process.exit(1);
  }
  const members = await seedRes.json();
  console.log(`${members.length} members found.\n`);

  const allMembersTimes = [];
  const allFinesTimes = [];
  const errors = { members: 0, fines: 0, rate_limited: 0 };

  for (let round = 1; round <= ROUNDS; round++) {
    process.stdout.write(`Round ${round}/${ROUNDS}: launching ${CONCURRENT_USERS} users... `);
    const start = Date.now();

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_USERS }, () => simulateUser(members))
    );

    const elapsed = Date.now() - start;
    console.log(`done in ${elapsed}ms`);

    for (const r of results) {
      if (r.members) {
        if (r.members.status === 429) errors.rate_limited++;
        else if (!r.members.ok) errors.members++;
        else allMembersTimes.push(r.members.ms);
      }
      if (r.fines) {
        if (r.fines.status === 429) errors.rate_limited++;
        else if (!r.fines.ok) errors.fines++;
        else allFinesTimes.push(r.fines.ms);
      }
    }

    // Brief pause between rounds so we don't hammer rate limiter
    if (round < ROUNDS) await new Promise(r => setTimeout(r, 2000));
  }

  const totalRequests = (allMembersTimes.length + allFinesTimes.length) +
    errors.members + errors.fines + errors.rate_limited;

  console.log("\n─────────────────────────────────────");
  console.log("Results");
  console.log("─────────────────────────────────────");
  console.log(`  Total requests:    ${totalRequests}`);
  console.log(`  Successful:        ${allMembersTimes.length + allFinesTimes.length}`);
  console.log(`  Rate limited 429:  ${errors.rate_limited}`);
  console.log(`  Errors:            ${errors.members + errors.fines}`);

  if (allMembersTimes.length > 0) stats("GET /api/members", allMembersTimes);
  if (allFinesTimes.length > 0)   stats("GET /api/member-fines/[id]", allFinesTimes);

  console.log("\n─────────────────────────────────────");
  if (errors.rate_limited > 0) {
    console.log(`⚠  ${errors.rate_limited} requests were rate-limited (429). Consider raising publicLimiter if this is legitimate traffic.`);
  }
  if (allMembersTimes.length > 0 && percentile([...allMembersTimes].sort((a,b)=>a-b), 95) > 1000) {
    console.log("⚠  /api/members p95 > 1s — consider increasing Cache-Control max-age.");
  }
  if (allFinesTimes.length > 0 && percentile([...allFinesTimes].sort((a,b)=>a-b), 95) > 1500) {
    console.log("⚠  /api/member-fines p95 > 1.5s — DB index on member_id may help.");
  }
  console.log("");
}

run().catch(console.error);
