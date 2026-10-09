import { notFound } from "next/navigation";
import { getPublicListing } from "@/lib/public-listings";
import { componentId } from "@/lib/components";
import { getSession } from "@/auth";
import { PartDetail } from "@/components/part-detail";

export const dynamic = "force-dynamic";
export default async function ComponentPage({
  params,
}: {
  params: Promise<{ id: string; part: string }>;
}) {
  const { id, part } = await params;
  const listing = await getPublicListing(Number(id));
  if (!listing) notFound();
  const piece = listing.summary.reusable_pieces.find(
    (p) => componentId(p) === part,
  );
  if (!piece) notFound();
  const session = await getSession();
  return (
    <PartDetail
      listing={listing}
      piece={piece}
      isOwner={session?.ghId === listing.owner_id}
    />
  );
}
