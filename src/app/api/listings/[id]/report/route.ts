import { getPublicListing } from "@/lib/public-listings";
import { NextResponse } from "next/server";
import { addReport } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!(await getPublicListing(id))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { reason } = (await req.json().catch(() => ({}))) as { reason?: string };
  const text = String(reason ?? "").trim();
  if (!text) return NextResponse.json({ error: "reason required" }, { status: 400 });
  addReport(id, text);
  return NextResponse.json({ ok: true });
}
