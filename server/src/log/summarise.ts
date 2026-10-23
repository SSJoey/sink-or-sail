// Usage: npm run summary -- logs/<file>.jsonl [more files…]
import { readFile } from "node:fs/promises";
import { formatSummary, parseLog, summarise } from "./summary.ts";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: npm run summary -- logs/<file>.jsonl [more files...]");
  process.exit(1);
}
for (const file of files) {
  console.log(`${file}\n${formatSummary(summarise(parseLog(await readFile(file, "utf8"))))}\n`);
}
