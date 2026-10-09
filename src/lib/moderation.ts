export function isModerator(githubId: number) {
  return (process.env.MODERATOR_GITHUB_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id))
    .includes(String(githubId));
}
