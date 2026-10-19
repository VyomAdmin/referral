import { readFile } from "node:fs/promises";
import { parseCoverageCsv } from "../functions/src/domain.ts";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run import:coverage -- <file.csv>");
  process.exit(1);
}
const csv = await readFile(file, "utf8");
const parsed = parseCoverageCsv(csv);
if (parsed.errors.length) {
  console.error(parsed.errors.join("\n"));
  process.exit(1);
}
const target = process.env.COVERAGE_IMPORT_URL ?? "";
if (!target) {
  console.log(`Validated ${parsed.rows.length} rows. No import URL is set, so nothing was written.`);
  process.exit(0);
}
const response = await fetch(target, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.COVERAGE_IMPORT_TOKEN ?? ""}`,
  },
  body: JSON.stringify({ csv }),
});
const body = await response.text();
console.log(response.status, body);
if (!response.ok) process.exit(1);
