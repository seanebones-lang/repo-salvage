import path from "node:path";

export function containerConfig(env) {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.trim().length < 32)
    throw new Error("AUTH_SECRET must contain at least 32 characters.");
  let origin;
  try {
    origin = new URL(env.AUTH_URL);
  } catch {
    throw new Error("AUTH_URL must be an explicit canonical origin.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    origin.hostname,
  );
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/" ||
    (origin.protocol !== "https:" && !(loopback && origin.protocol === "http:"))
  )
    throw new Error(
      "AUTH_URL requires HTTPS, except for HTTP loopback tests; use an origin without credentials or a path.",
    );
  const port = env.PORT ?? "3000";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error("PORT must be an integer between 1 and 65535.");
  const database = env.DATABASE_PATH ?? "/app/data/salvage.db";
  if (!path.isAbsolute(database))
    throw new Error("DATABASE_PATH must be absolute in the container.");
  if (
    Boolean(env.AUTH_GITHUB_ID?.trim()) !==
    Boolean(env.AUTH_GITHUB_SECRET?.trim())
  )
    throw new Error(
      "Configure both AUTH_GITHUB_ID and AUTH_GITHUB_SECRET, or neither.",
    );
  for (const key of [
    "DAILY_SUMMARY_LIMIT",
    "GLOBAL_DAILY_SUMMARY_LIMIT",
    "AGENT_READ_LIMIT",
  ])
    if (
      env[key] !== undefined &&
      (!/^\d+$/.test(env[key]) || !Number.isSafeInteger(Number(env[key])))
    )
      throw new Error(`${key} must be a non-negative integer.`);
  if (
    env.MODERATOR_GITHUB_IDS?.trim() &&
    !env.MODERATOR_GITHUB_IDS.split(",").every(
      (id) => /^[1-9]\d*$/.test(id.trim()) && Number.isSafeInteger(Number(id)),
    )
  )
    throw new Error(
      "MODERATOR_GITHUB_IDS must contain comma-separated positive numeric IDs.",
    );
  if (
    env.ANTHROPIC_API_KEY?.trim() &&
    Number(env.GLOBAL_DAILY_SUMMARY_LIMIT ?? 100) > 0 &&
    Number(env.DAILY_SUMMARY_LIMIT ?? 10) > 0 &&
    !env.MODERATOR_GITHUB_IDS?.trim()
  )
    throw new Error(
      "Configure MODERATOR_GITHUB_IDS before enabling paid analysis in the container.",
    );
  return { origin: origin.origin, port, database: path.resolve(database) };
}
