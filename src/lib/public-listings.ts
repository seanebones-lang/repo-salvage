import { getListing, searchListings, type Listing } from "./db";
import { isPublicRepo } from "./github";

// Public rendering and mutations recheck anonymous visibility and current ownership.
export async function visibleListings(listings: Listing[]): Promise<Listing[]> {
  const visible = await Promise.all(listings.map((l) => isPublicRepo(l.github_repo_id, l.owner_id)));
  return listings.filter((_, i) => visible[i]);
}
export async function getPublicListing(id: number): Promise<Listing | null> {
  const l = getListing(id);
  return l && await isPublicRepo(l.github_repo_id, l.owner_id) ? l : null;
}
export async function publicSearch(opts: Parameters<typeof searchListings>[0]) {
  return visibleListings(searchListings(opts));
}
