import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const versionPath = path.join(repoRoot, "VERSION");
const packageJsonPath = path.join(repoRoot, "package.json");
const tauriConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
const cargoTomlPath = path.join(repoRoot, "src-tauri", "Cargo.toml");

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

console.log(`Synchronized version ${version} -> package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml`);
