import fs from "node:fs";
import path from "node:path";

const roots = ["src", "tests"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const bannedReferences = ["@/lib/kids-chore-app", "src/lib/kids-chore-app.js", "legacy-static/app.js"];
const violations = [];

function walkDir(directoryPath) {
  if (!fs.existsSync(directoryPath)) return;
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      walkDir(absolutePath);
      continue;
    }

    const extension = path.extname(entry.name);
    if (!sourceExtensions.has(extension)) continue;

    const content = fs.readFileSync(absolutePath, "utf8");
    for (const banned of bannedReferences) {
      if (content.includes(banned)) {
        violations.push({ file: absolutePath, banned });
      }
    }
  }
}

for (const root of roots) {
  walkDir(path.resolve(process.cwd(), root));
}

if (violations.length > 0) {
  console.error("Legacy isolation check failed. Remove references to archived runtime files:");
  for (const violation of violations) {
    console.error(`- ${violation.file}: contains "${violation.banned}"`);
  }
  process.exit(1);
}

console.log("Legacy isolation check passed.");
