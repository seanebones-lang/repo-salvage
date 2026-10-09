import { getPublicListing } from "@/lib/public-listings";
import { NextResponse } from "next/server";
import { addReport, takeRequest } from "@/lib/db";
import { boundedJson } from "@/lib/http";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!(await getPublicListing(id)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > 4096)
    return NextResponse.json({ error: "report too large" }, { status: 413 });
  let body: unknown;
  try {
    body = await boundedJson(req);
  } catch (error) {
    return NextResponse.json(
      { error: "invalid report body" },
      {
        status:
          error instanceof Error && error.message === "body too large"
            ? 413
            : 400,
      },
    );
  }
  const reason =
    body && typeof body === "object" && "reason" in body ? body.reason : null;
  const text = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
  if (!text)
    return NextResponse.json({ error: "reason required" }, { status: 400 });
  if (!takeRequest(`report:${id}`, 10, 3_600_000))
    return NextResponse.json(
      { error: "too many reports" },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  addReport(id, text);
  return NextResponse.json({ ok: true });
}
