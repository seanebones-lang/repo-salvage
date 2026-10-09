import { getSession } from "@/auth";
import { jobById, publicJob } from "@/lib/analysis-jobs";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (!session)
    return NextResponse.json(
      { error: "Sign in to view analysis progress." },
      { status: 401, headers },
    );
  const job = jobById((await params).id, session.ghId);
  if (!job)
    return NextResponse.json(
      { error: "Analysis job not found." },
      { status: 404, headers },
    );
  return NextResponse.json(publicJob(job), { headers });
}
