import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    db().prepare("SELECT 1").get();
    return NextResponse.json(
      { status: "ok", database: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable", database: "unavailable" },
      { status: 503 },
    );
  }
}
