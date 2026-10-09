import Link from "next/link";
import { Icon } from "@/components/icon";

export default function NotFound() {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name="box" size={30} />
      </div>
      <h1>This part isn’t available.</h1>
      <p>
        The link may be outdated, or the repository may no longer be available
        for public reuse.
      </p>
      <Link href="/#catalog" className="button button-primary">
        Back to the catalog <Icon name="arrow" />
      </Link>
    </div>
  );
}
