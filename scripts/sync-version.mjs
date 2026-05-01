import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const versionPath = path.join(repoRoot, "VERSION");
const packageJsonPath = path.join(repoRoot, "package.json");
const packageLockPath = path.join(repoRoot, "package-lock.json");
const tauriConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
const cargoTomlPath = path.join(repoRoot, "src-tauri", "Cargo.toml");
const cargoLockPath = path.join(repoRoot, "src-tauri", "Cargo.lock");

const version = readFileSync(versionPath, "utf8").trim();
if (!version) {
  throw new Error("VERSION file is empty.");
}

const semverLikePattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
if (!semverLikePattern.test(version)) {
  throw new Error(
    `Invalid VERSION format: \"${version}\". Expected semver like 1.0.0 or 1.0.0-beta.1`
  );
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
packageJson.version = version;
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

try {
  const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8"));
  packageLock.version = version;
  if (packageLock.packages && packageLock.packages[""]) {
    packageLock.packages[""].version = version;
  }
  writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`, "utf8");
} catch {
  // Ignore missing or invalid lockfile; versioning still works without it.
}

const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
tauriConfig.version = version;
writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`, "utf8");

const cargoToml = readFileSync(cargoTomlPath, "utf8");
const cargoVersionPattern = /(\[package\][\s\S]*?\nversion\s*=\s*")([^"]+)(")/;
if (!cargoVersionPattern.test(cargoToml)) {
  throw new Error("Could not locate [package] version in src-tauri/Cargo.toml.");
}
const updatedCargoToml = cargoToml.replace(cargoVersionPattern, `$1${version}$3`);
writeFileSync(cargoTomlPath, updatedCargoToml, "utf8");

try {
  const cargoLock = readFileSync(cargoLockPath, "utf8");
  const cargoLockPackagePattern =
    /(\[\[package\]\]\s*\nname\s*=\s*"mdedit"\s*\nversion\s*=\s*")([^"]+)(")/;
  if (!cargoLockPackagePattern.test(cargoLock)) {
    throw new Error("Could not locate mdedit package version in src-tauri/Cargo.lock.");
  }
  const updatedCargoLock = cargoLock.replace(cargoLockPackagePattern, `$1${version}$3`);
  writeFileSync(cargoLockPath, updatedCargoLock, "utf8");
} catch {
  // Ignore missing or unparsable lockfile; cargo will regenerate it when needed.
}

console.log(
  `Synchronized version ${version} -> package.json, package-lock.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml, src-tauri/Cargo.lock`
);
