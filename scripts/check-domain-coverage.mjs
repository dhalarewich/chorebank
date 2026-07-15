import fs from "node:fs";
import path from "node:path";

const summaryPath = path.resolve(process.cwd(), "coverage", "coverage-summary.json");
const boardServiceSuffix = "/src/lib/server/domain/board-service.ts";
const minLineCoverage = 20;
const minFunctionCoverage = 25;

if (!fs.existsSync(summaryPath)) {
  console.error(`Coverage summary not found at ${summaryPath}. Run tests with --coverage first.`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const boardEntryKey = Object.keys(summary).find((key) => key.replaceAll("\\", "/").endsWith(boardServiceSuffix));

if (!boardEntryKey) {
  console.error(`Unable to find coverage data for ${boardServiceSuffix} in ${summaryPath}.`);
  process.exit(1);
}

const boardEntry = summary[boardEntryKey];
const linePct = Number(boardEntry?.lines?.pct ?? 0);
const functionPct = Number(boardEntry?.functions?.pct ?? 0);
const failures = [];

if (linePct < minLineCoverage) {
  failures.push(`lines ${linePct.toFixed(2)}% < ${minLineCoverage}%`);
}

if (functionPct < minFunctionCoverage) {
  failures.push(`functions ${functionPct.toFixed(2)}% < ${minFunctionCoverage}%`);
}

if (failures.length > 0) {
  console.error(`Coverage gate failed for board-service.ts: ${failures.join(", ")}`);
  process.exit(1);
}

console.log(
  `Coverage gate passed for board-service.ts (lines ${linePct.toFixed(2)}%, functions ${functionPct.toFixed(2)}%).`,
);
