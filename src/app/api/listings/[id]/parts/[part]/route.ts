import { getPublicListing } from "@/lib/public-listings";
import { componentId, reuseBrief } from "@/lib/components";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; part: string }> },
) {
  const { id, part } = await params;
  const listing = await getPublicListing(Number(id));
  const piece = listing?.summary.reusable_pieces.find(
    (p) => componentId(p) === part,
  );
  if (!listing || !piece)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return new Response(JSON.stringify(reuseBrief(listing, piece), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="reuse-brief-${part}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
