import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, status, roll, big_brother_roll } = await req.json();

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const validStatuses = ["active", "pledge", "alumni", "inactive", "resident-advisor", "live-out"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const parsedRoll = roll ? parseInt(roll) : null;
  if (roll && (!Number.isFinite(parsedRoll) || parsedRoll! < 1 || parsedRoll! > 99999)) {
    return NextResponse.json({ error: "Invalid roll number" }, { status: 400 });
  }

  let bbRoll: number | null = null;
  if (big_brother_roll != null) {
    if (!Number.isInteger(big_brother_roll) || big_brother_roll < 1 || big_brother_roll > 99999) {
      return NextResponse.json({ error: "Invalid big_brother_roll" }, { status: 400 });
    }
    bbRoll = big_brother_roll;
  }

  if (bbRoll != null && parsedRoll != null && bbRoll === parsedRoll) {
    return NextResponse.json({ error: "A member cannot be their own big brother" }, { status: 400 });
  }

  const service = createServiceClient();

  if (bbRoll != null) {
    const { data: bbExists } = await service
      .from("chapter_roster")
      .select("roll")
      .eq("roll", bbRoll)
      .maybeSingle();
    if (!bbExists) {
      return NextResponse.json({ error: "Big brother roll # not found in chapter roster" }, { status: 400 });
    }
  }

  const { error } = await service.from("members").insert({
    name: name.trim(),
    status,
    roll: parsedRoll,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rosterAction: "none" | "inserted" | "updated_filled_null" | "updated_overwrote" = "none";
  let rosterOverwriteFrom: number | null = null;

  if (parsedRoll != null) {
    const { data: existingRoster } = await service
      .from("chapter_roster")
      .select("roll, big_brother_roll")
      .eq("roll", parsedRoll)
      .maybeSingle();

    if (!existingRoster) {
      const { error: rosterErr } = await service.from("chapter_roster").insert({
        roll: parsedRoll,
        name: name.trim(),
        initiation_class: `New (${status})`,
        initiation_date: new Date().toISOString().slice(0, 10),
        big_brother_roll: bbRoll,
        notes: null,
      });
      if (rosterErr) {
        return NextResponse.json({ error: `Roster write failed: ${rosterErr.message}` }, { status: 500 });
      }
      rosterAction = "inserted";
    } else if (bbRoll != null) {
      // Admin explicitly picked a big bro — write it, even if a value was already there.
      if (existingRoster.big_brother_roll == null) {
        rosterAction = "updated_filled_null";
      } else if (existingRoster.big_brother_roll !== bbRoll) {
        rosterAction = "updated_overwrote";
        rosterOverwriteFrom = existingRoster.big_brother_roll;
      }
      // If existingRoster.big_brother_roll === bbRoll, no-op (rosterAction stays "none").

      if (rosterAction !== "none") {
        const { error: rosterErr } = await service
          .from("chapter_roster")
          .update({ big_brother_roll: bbRoll })
          .eq("roll", parsedRoll);
        if (rosterErr) {
          return NextResponse.json({ error: `Roster update failed: ${rosterErr.message}` }, { status: 500 });
        }
      }
    }
    // If existingRoster exists and bbRoll is null, leave the row untouched.
  }

  const table = current.role === "root" ? "system_events" : "audit_logs";

  let bbDetails = "";
  if (rosterAction === "updated_overwrote") {
    bbDetails = ` — Big Bro: #${bbRoll} (overwrote prior #${rosterOverwriteFrom})`;
  } else if (rosterAction === "updated_filled_null" || rosterAction === "inserted") {
    if (bbRoll != null) bbDetails = ` — Big Bro: #${bbRoll}`;
  }

  await service.from(table).insert({
    admin_email: current.email,
    action: "Added Member",
    details: `${name.trim()} (${status})${parsedRoll ? ` — Roll ${parsedRoll}` : ""}${bbDetails}`,
  });

  return NextResponse.json({ success: true });
}
