import { analysisWorkerStatus } from "@/lib/analysis-worker-status";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    db().prepare("SELECT 1").get();
    const worker = analysisWorkerStatus();
    return NextResponse.json(
      {
        status: worker === "unavailable" ? "unavailable" : "ok",
        database: "ready",
        worker,
      },
      {
        status: worker === "unavailable" ? 503 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
