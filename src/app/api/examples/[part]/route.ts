import { exampleListing, exampleReuseBrief } from "@/lib/examples";
import { componentId } from "@/lib/components";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ part: string }> },
) {
  const { part } = await params;
  const piece = exampleListing.summary.reusable_pieces.find(
    (p) => componentId(p) === part,
  );
  if (!piece) return NextResponse.json({ error: "not found" }, { status: 404 });
  const brief = exampleReuseBrief(piece);
  return new Response(JSON.stringify(brief, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="example-brief-${part}.json"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
