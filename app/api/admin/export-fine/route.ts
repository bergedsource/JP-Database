import { requireOwner } from "@/lib/admin-auth";
import { isRateLimited, getIP } from "@/lib/rate-limit";
import { exportFineToSheets } from "@/lib/export-to-sheets";
import { NextRequest, NextResponse } from "next/server";

// POST /api/admin/export-fine — export a paid fine to Google Sheets (owner only)
export async function POST(req: NextRequest) {
  if (isRateLimited(getIP(req), { maxRequests: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const denied = await requireOwner();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { member_name, fine_type, description, amount, date_resolved } = body;

  if (typeof member_name !== "string" || !member_name.trim()) {
    return NextResponse.json({ error: "member_name is required" }, { status: 400 });
  }
  if (typeof fine_type !== "string" || !fine_type.trim()) {
    return NextResponse.json({ error: "fine_type is required" }, { status: 400 });
  }
  if (amount == null || isNaN(Number(amount)) || Number(amount) < 0) {
    return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
  }

  try {
    await exportFineToSheets({
      member_name: String(member_name),
      fine_type: String(fine_type),
      description: description != null ? String(description) : null,
      amount: Number(amount),
      date_resolved: date_resolved != null ? String(date_resolved) : null,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Google Sheets export error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
