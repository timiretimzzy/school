import { readFileSync, readdirSync } from "fs";
import { join, extname } from "path";

const ROOT = process.cwd();
const JS_EXT = [".js", ".mjs", ".cjs"];
const BLACKLIST = ["node_modules", ".git", "cli-temp"];

let errors = [];
let warnings = [];
let filesChecked = 0;

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (BLACKLIST.includes(e.name)) continue;
    const fp = join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(fp));
    else if (e.isFile() && JS_EXT.includes(extname(e.name))) files.push(fp);
  }
  return files;
}

function checkSyntax(fp) {
  const c = readFileSync(fp, "utf-8");
  let bd = 0;
  for (const ch of c) {
    if (ch === "{") bd++;
    if (ch === "}") { bd--; if (bd < 0) { errors.push({ file: fp, type: "SYNTAX", msg: "Unbalanced closing brace" }); break; } }
  }
  if (bd !== 0) errors.push({ file: fp, type: "SYNTAX", msg: "Unbalanced braces: " + bd });
}

function checkSig(fp) {
  const c = readFileSync(fp, "utf-8");
  if (fp.includes("schoolAdmin.js")) {
    // Verify inviteAllStudents has tenant_memberships check
    if (!c.includes("studentAuthUserIds")) {
      errors.push({ file: fp, type: "MISSING", msg: "inviteAllStudents missing tenant_memberships check" });
    }
    if (!c.includes("studentAuthUserIds.has") && !c.includes("studentAuthUserIds.forEach")) {
      errors.push({ file: fp, type: "MISSING", msg: "studentAuthUserIds declared but not used in eligibility filter" });
    }
    if (!c.includes("skippedCount") && !c.includes("Skipped")) {
      errors.push({ file: fp, type: "MISSING", msg: "inviteAllStudents missing skipped count in summary" });
    }
    // Verify student_links query includes user_id
    if (c.includes("inviteAllStudents") && c.includes("student_links") && !c.includes("student_id, user_id")) {
      warnings.push({ file: fp, type: "PARTIAL", msg: "student_links query may not include user_id for cross-reference" });
    }
  }
}

const files = walk(ROOT);
for (const f of files) {
  filesChecked++;
  checkSyntax(f);
  checkSig(f);
}

console.log("");
console.log("=== Static Regression Check ===");
console.log("Files checked: " + filesChecked);
console.log("Errors: " + errors.length);
console.log("Warnings: " + warnings.length);

if (errors.length > 0) {
  console.log("");
  console.log("--- ERRORS ---");
  errors.forEach((e) => console.log("  [" + e.type + "] " + e.file + ": " + e.msg));
}
if (warnings.length > 0) {
  console.log("");
  console.log("--- WARNINGS ---");
  warnings.forEach((w) => console.log("  [" + w.type + "] " + w.file + ": " + w.msg));
}
if (errors.length === 0) {
  console.log("");
  console.log("✓ All static checks passed.");
} else {
  console.log("");
  console.log("✗ Static checks FAILED.");
  process.exit(1);
}
