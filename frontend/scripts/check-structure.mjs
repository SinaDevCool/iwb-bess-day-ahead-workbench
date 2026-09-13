/* Submission-readability guard. File size is a ceiling, not a reason to split an equation.
 * Tests and generated output are excluded; production TS/TSX, Python and CSS are checked.
 * Also verify that the single stylesheet graph has no duplicate imports or cycles. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const maximumLines = 300;
const files = [];
const failures = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__pycache__") collect(file);
    } else if (/\.(tsx?|py|css)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      const lines = fs.readFileSync(file, "utf8").trimEnd().split(/\r?\n/).length;
      files.push({ file: path.relative(repository, file), lines });
      if (lines > maximumLines) failures.push(`${path.relative(repository, file)}: ${lines} lines exceeds ${maximumLines}`);
    }
  }
}

const visited = new Set();
function checkStyles(file) {
  if (visited.has(file)) {
    failures.push(`Duplicate stylesheet import or cycle: ${path.relative(repository, file)}`);
    return;
  }
  visited.add(file);
  const css = postcss.parse(fs.readFileSync(file, "utf8"), { from: file });
  css.walkAtRules("import", (rule) => {
    const relative = /^"(.+)"$/.exec(rule.params)?.[1];
    if (!relative || !relative.startsWith(".")) {
      failures.push(`Expected local stylesheet ownership: ${rule.params}`);
      return;
    }
    checkStyles(path.resolve(path.dirname(file), relative));
  });
}

collect(path.join(repository, "backend"));
collect(path.join(repository, "frontend/src"));
checkStyles(path.join(repository, "frontend/src/app/globals.css"));
checkStyles(path.join(repository, "frontend/src/app/present/present.css"));
const largest = files.sort((a, b) => b.lines - a.lines)[0];
console.log(`${files.length} production source files checked; largest: ${largest.lines} lines (${largest.file}).`);
console.log(`${visited.size} stylesheets checked for unique, acyclic imports.`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
