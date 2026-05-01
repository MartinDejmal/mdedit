import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const versionPath = path.join(repoRoot, "VERSION");

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function bumpVersion(current, mode) {
  if (mode === "patch") {
    return { ...current, patch: current.patch + 1 };
  }

  if (mode === "minor") {
    return { major: current.major, minor: current.minor + 1, patch: 0 };
  }

  if (mode === "major") {
    return { major: current.major + 1, minor: 0, patch: 0 };
  }

  fail(`Unsupported mode: ${mode}`);
}

function runSyncVersion() {
  const result = spawnSync("npm", ["run", "sync:version"], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    fail("sync:version failed.");
  }
}

const args = process.argv.slice(2);
const mode = args[0] ?? "help";

if (mode === "help" || mode === "--help" || mode === "-h") {
  console.log("Usage:");
  console.log("  npm run release -- patch");
  console.log("  npm run release -- minor");
  console.log("  npm run release -- major");
  console.log("  npm run release -- set <x.y.z>");
  process.exit(0);
}

const currentRaw = readFileSync(versionPath, "utf8").trim();
const current = parseVersion(currentRaw);

if (!current) {
  fail(`VERSION must be strict semver x.y.z, got: ${currentRaw}`);
}

let next;

if (mode === "set") {
  const explicit = args[1];
  if (!explicit) {
    fail("Missing version for set mode. Example: npm run release:set -- 1.2.3");
  }

  const parsed = parseVersion(explicit);
  if (!parsed) {
    fail(`Invalid version for set mode: ${explicit}`);
  }

  next = parsed;
} else {
  next = bumpVersion(current, mode);
}

const nextString = formatVersion(next);
writeFileSync(versionPath, `${nextString}\n`, "utf8");

console.log(`release: VERSION ${currentRaw} -> ${nextString}`);
runSyncVersion();

console.log("release: done");
console.log(`release: next steps:`);
console.log(`  npm run tauri build`);
console.log(`  git commit -am \"release: v${nextString}\"`);
console.log(`  git tag v${nextString}`);
