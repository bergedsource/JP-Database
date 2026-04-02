import { getCurrentRole } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function GET() {
  const current = await getCurrentRole();
  if (!current) {
    return NextResponse.json({ role: null }, { status: 401 });
  }
  return NextResponse.json({ role: current.role, email: current.email, userId: current.userId });
}
