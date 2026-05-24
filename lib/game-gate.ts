import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Mirrors the requireOwner() pattern: returns a 403 NextResponse when the kill switch is off,
// or null when the game is enabled. Callers do `const denied = await gameDisabledResponse(); if (denied) return denied;`
export async function gameDisabledResponse(): Promise<NextResponse | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("settings")
    .select("value")
    .eq("key", "game_enabled")
    .maybeSingle();
  if (data?.value !== "true") {
    return NextResponse.json({ error: "Game is not currently enabled" }, { status: 403 });
  }
  return null;
}
