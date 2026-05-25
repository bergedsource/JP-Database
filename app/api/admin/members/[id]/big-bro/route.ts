import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { big_brother_roll } = await req.json();

  let bbRoll: number | null = null;
  if (big_brother_roll != null) {
    if (!Number.isInteger(big_brother_roll) || big_brother_roll < 1 || big_brother_roll > 99999) {
      return NextResponse.json(
        { error: "big_brother_roll must be an integer between 1 and 99999, or null" },
        { status: 400 }
      );
    }
    bbRoll = big_brother_roll;
  }

  const service = createServiceClient();

  const { data: member } = await service
    .from("members")
    .select("name, roll, status")
    .eq("id", id)
    .single();

  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  if (member.roll == null) {
    return NextResponse.json(
      { error: "Member must have a Roll # before setting a big brother" },
      { status: 400 }
    );
  }

  if (bbRoll != null && bbRoll === member.roll) {
    return NextResponse.json({ error: "A member cannot be their own big brother" }, { status: 400 });
  }

  if (bbRoll != null) {
    const { data: bbExists } = await service
      .from("chapter_roster")
      .select("roll")
      .eq("roll", bbRoll)
      .maybeSingle();
    if (!bbExists) {
      return NextResponse.json(
        { error: "Big brother roll # not found in chapter roster" },
        { status: 400 }
      );
    }
  }

  const { data: existing } = await service
    .from("chapter_roster")
    .select("roll, big_brother_roll")
    .eq("roll", member.roll)
    .maybeSingle();

  const priorBb = existing?.big_brother_roll ?? null;

  if (!existing && bbRoll == null) {
    return NextResponse.json({ success: true, noop: true });
  }

  if (!existing) {
    const { error: insertErr } = await service.from("chapter_roster").insert({
      roll: member.roll,
      name: member.name,
      initiation_class: `New (${member.status})`,
      initiation_date: new Date().toISOString().slice(0, 10),
      big_brother_roll: bbRoll,
      notes: null,
    });
    if (insertErr) {
      return NextResponse.json({ error: `Roster insert failed: ${insertErr.message}` }, { status: 500 });
    }
  } else if (priorBb !== bbRoll) {
    const { error: updateErr } = await service
      .from("chapter_roster")
      .update({ big_brother_roll: bbRoll })
      .eq("roll", member.roll);
    if (updateErr) {
      return NextResponse.json({ error: `Roster update failed: ${updateErr.message}` }, { status: 500 });
    }
  } else {
    return NextResponse.json({ success: true, noop: true });
  }

  const table = current.role === "root" ? "system_events" : "audit_logs";
  const fromLabel = priorBb != null ? `#${priorBb}` : "—";
  const toLabel = bbRoll != null ? `#${bbRoll}` : "—";
  const rosterNote = !existing ? " (created roster row)" : "";

  await service.from(table).insert({
    admin_email: current.email,
    action: "Updated Member Big Brother",
    details: `${member.name} changed Big Brother from ${fromLabel} to ${toLabel}${rosterNote}`,
  });

  return NextResponse.json({ success: true });
}
