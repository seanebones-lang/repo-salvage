import { notFound } from "next/navigation";
import { exampleListing, testedExampleId } from "@/lib/examples";
import { componentId } from "@/lib/components";
import { PartDetail } from "@/components/part-detail";

export default async function ExamplePage({
  params,
}: {
  params: Promise<{ part: string }>;
}) {
  const { part } = await params;
  const piece = exampleListing.summary.reusable_pieces.find(
    (p) => componentId(p) === part,
  );
  if (!piece) notFound();
  return (
    <PartDetail
      listing={exampleListing}
      piece={piece}
      example
      tested={part === testedExampleId}
    />
  );
}
