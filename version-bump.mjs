import { readFileSync, writeFileSync } from "node:fs";

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  throw new Error(
    "npm_package_version is undefined. Run via npm scripts (e.g. `npm version patch|minor|major`)."
  );
}

const manifestPath = "manifest.json";
const versionsPath = "versions.json";

// 1) bump manifest.json version to package.json version
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const minAppVersion = manifest?.minAppVersion;
if (!minAppVersion) {
  throw new Error("manifest.json is missing required field: minAppVersion");
}

manifest.version = targetVersion;
writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t") + "\n");

// 2) ensure versions.json has entry { [targetVersion]: minAppVersion }
const versions = JSON.parse(readFileSync(versionsPath, "utf8"));

const prev = versions[targetVersion];
if (prev && prev !== minAppVersion) {
  console.warn(
    `versions.json already has ${targetVersion}: ${prev}. Updating to ${minAppVersion}.`
  );
}

versions[targetVersion] = minAppVersion;
writeFileSync(versionsPath, JSON.stringify(versions, null, "\t") + "\n");
