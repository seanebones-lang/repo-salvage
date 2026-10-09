import { getPart } from "../../../../v1/parts/[id]/[part]/handler";
export const dynamic = "force-dynamic";
export const GET = (
  request: Request,
  context: { params: Promise<{ id: string; part: string }> },
) => getPart(request, context, 2);
