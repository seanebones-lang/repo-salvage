import { getListing, searchListings, allListings, type Listing } from "./db";
import { verifiedPublicRepo } from "./github";

async function currentPublicListing(listing: Listing): Promise<Listing | null> {
  if (listing.moderation_hidden_at) return null;
  const repo = await verifiedPublicRepo(
    listing.github_repo_id,
    listing.owner_id,
  );
  if (!repo) return null;
  const current = getListing(listing.id);
  if (
    !current ||
    current.moderation_hidden_at ||
    current.github_repo_id !== listing.github_repo_id ||
    current.owner_id !== listing.owner_id
  )
    return null;
  // A renamed repository can leave its old slug available for another repository.
  // Use current links for the verified numeric identity; retain analysis-time metadata.
  return {
    ...current,
    name: repo.name,
    full_name: repo.full_name,
    url: repo.html_url,
    owner_login: repo.owner.login,
  };
}

// Public rendering and mutations recheck anonymous visibility and current ownership.
export async function visibleListings(listings: Listing[]): Promise<Listing[]> {
  listings = listings.filter((l) => !l.moderation_hidden_at);
  const result: Listing[] = [];
  for (let offset = 0; offset < listings.length; offset += 8) {
    const batch = listings.slice(offset, offset + 8);
    const visible = await Promise.all(batch.map(currentPublicListing));
    result.push(
      ...visible.filter((listing): listing is Listing => listing !== null),
    );
  }
  return result;
}
export async function getPublicListing(id: number): Promise<Listing | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const l = getListing(id);
  return l ? currentPublicListing(l) : null;
}
export async function publicSearch(opts: Parameters<typeof searchListings>[0]) {
  return visibleListings(searchListings(opts));
}

export async function publicCatalog() {
  const stored = allListings();
  const listings = await visibleListings(stored);
  return { listings, hidden: stored.length - listings.length };
}
