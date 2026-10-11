import path from "node:path";

export function demoPort(value = "3187") {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)
    throw Error("Demo port must be an integer from 1 to 65535.");
  return String(Number(value));
}

export function demoEnvironment(parent, directory, secret, port) {
  return {
    ...parent,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    HOSTNAME: "127.0.0.1",
    PORT: demoPort(port),
    AUTH_SECRET: secret,
    AUTH_URL: `http://127.0.0.1:${demoPort(port)}`,
    AUTH_GITHUB_ID: "",
    AUTH_GITHUB_SECRET: "",
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_WORKSPACE_ID: "",
    REPO_SALVAGE_TOKEN: "",
    REPO_SALVAGE_DEMO: "1",
    DATABASE_PATH: path.join(directory, "demo.db"),
    ANALYSIS_WORKER_ENABLED: "0",
    DAILY_SUMMARY_LIMIT: "0",
    GLOBAL_DAILY_SUMMARY_LIMIT: "0",
    MODERATOR_GITHUB_IDS: "",
  };
}
