// Shared env loading for indexer scripts: reads the repo's .env.local no
// matter what directory the script is launched from.
import { config } from "dotenv";

export const REPO_ROOT = new URL("../../", import.meta.url).pathname;
export const ENV_PATH = REPO_ROOT + ".env.local";
config({ path: ENV_PATH, quiet: true });

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}
