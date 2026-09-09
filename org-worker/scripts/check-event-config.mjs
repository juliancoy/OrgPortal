import { readFileSync } from "node:fs";
import { checkEventConfiguration } from "../src/eventConfiguration.ts";

// Load configuration from the process environment (for example Node --env-file).
// Optional input is an operator-downloaded OAuth discovery document, not a URL.
const args = process.argv.slice(2);
if (args.length > 1) {
  console.error("Usage: npm run events:check-config -- [authorization-metadata.json]");
  process.exitCode = 2;
} else {
  try {
    const metadata = args[0] ? JSON.parse(readFileSync(args[0], "utf8")) : undefined;
    const result = checkEventConfiguration(process.env, metadata);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error("Configuration check failed: invalid or unreadable metadata file. No values were logged.");
    process.exitCode = 1;
  }
}
