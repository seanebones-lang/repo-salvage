import { NextResponse } from "next/server";
import { getListing, incrementUsed } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!getListing(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  incrementUsed(id);
  return NextResponse.json({ used_count: getListing(id)!.used_count });
}
