import { getParts } from "../../v1/parts/handler";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => getParts(request, 2);
