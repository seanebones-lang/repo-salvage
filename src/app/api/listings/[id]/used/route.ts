import { getPublicListing } from "@/lib/public-listings";
import { NextResponse } from "next/server";
import { getListing, incrementUsed, takeRequest } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!(await getPublicListing(id)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!takeRequest(`used:${id}`, 20, 3_600_000))
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  incrementUsed(id);
  return NextResponse.json({ used_count: getListing(id)!.used_count });
}
